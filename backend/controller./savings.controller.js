const pool = require('../config/database');

// ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
// GET SAVINGS GOALS  (for logged-in user)
// GET /api/savings
// Returns all goals with id, name, target_amount, saved_amount, deadline
// ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
const getSavingsGoals = async (req, res) => {
  try {
    const userId = req.userId;

    const [rows] = await pool.execute(
      `SELECT id, name, target_amount, saved_amount, deadline, created_at
       FROM savings_goals
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [userId]
    );

    return res.status(200).json({
      success: true,
      goals: rows.map(r => ({
        id:           r.id,
        name:         r.name,
        targetAmount: parseFloat(r.target_amount),
        savedAmount:  parseFloat(r.saved_amount),
        deadline:     r.deadline,
        createdAt:    r.created_at,
      }))
    });
  } catch (error) {
    console.error('Get savings goals error:', error);
    return res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
  }
};

// ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
// CREATE SAVINGS GOAL
// POST /api/savings
// Body: { name, target_amount, deadline }
// ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
const createSavingsGoal = async (req, res) => {
  try {
    const userId = req.userId;
    const { name, target_amount, deadline } = req.body;

    // ── Validate ──────────────────────────────────────────────
    if (!name || typeof name !== 'string' || name.trim().length === 0)
      return res.status(400).json({ success: false, message: 'Goal name is required.' });
    if (name.trim().length > 100)
      return res.status(400).json({ success: false, message: 'Goal name must be 100 characters or fewer.' });

    const target = parseFloat(target_amount);
    if (isNaN(target) || target <= 0)
      return res.status(400).json({ success: false, message: 'Target amount must be a positive number.' });
    if (target > 99999999.99)
      return res.status(400).json({ success: false, message: 'Target amount exceeds maximum allowed value.' });

    if (!deadline || !/^\d{4}-\d{2}-\d{2}$/.test(deadline))
      return res.status(400).json({ success: false, message: 'Deadline must be a valid date (YYYY-MM-DD).' });
    if (new Date(deadline) <= new Date())
      return res.status(400).json({ success: false, message: 'Deadline must be a future date.' });

    // ── Insert ────────────────────────────────────────────────
    const [result] = await pool.execute(
      `INSERT INTO savings_goals (user_id, name, target_amount, saved_amount, deadline)
       VALUES (?, ?, ?, 0, ?)`,
      [userId, name.trim(), target, deadline]
    );

    const [rows] = await pool.execute(
      'SELECT id, name, target_amount, saved_amount, deadline, created_at FROM savings_goals WHERE id = ?',
      [result.insertId]
    );

    return res.status(201).json({
      success: true,
      message: 'Savings goal created successfully.',
      goal: {
        id:           rows[0].id,
        name:         rows[0].name,
        targetAmount: parseFloat(rows[0].target_amount),
        savedAmount:  parseFloat(rows[0].saved_amount),
        deadline:     rows[0].deadline,
        createdAt:    rows[0].created_at,
      }
    });
  } catch (error) {
    console.error('Create savings goal error:', error);
    return res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
  }
};

// ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
// ADD FUNDS TO GOAL
// PUT /api/savings/:id/funds
// Body: { amount }
// Adds amount to saved_amount; caps at target_amount
// ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
const addFunds = async (req, res) => {
  try {
    const userId = req.userId;
    const goalId = parseInt(req.params.id, 10);

    if (isNaN(goalId) || goalId <= 0)
      return res.status(400).json({ success: false, message: 'Invalid goal ID.' });

    const amount = parseFloat(req.body.amount);
    if (isNaN(amount) || amount <= 0)
      return res.status(400).json({ success: false, message: 'Amount must be a positive number.' });
    if (amount > 99999999.99)
      return res.status(400).json({ success: false, message: 'Amount exceeds maximum allowed value.' });

    // ── Ownership check ───────────────────────────────────────
    const [existing] = await pool.execute(
      'SELECT id, saved_amount, target_amount FROM savings_goals WHERE id = ? AND user_id = ?',
      [goalId, userId]
    );
    if (existing.length === 0)
      return res.status(404).json({ success: false, message: 'Savings goal not found.' });

    const current   = parseFloat(existing[0].saved_amount);
    const target    = parseFloat(existing[0].target_amount);
    const newSaved  = Math.min(current + amount, target); // cap at target

    await pool.execute(
      'UPDATE savings_goals SET saved_amount = ? WHERE id = ? AND user_id = ?',
      [newSaved, goalId, userId]
    );

    const [rows] = await pool.execute(
      'SELECT id, name, target_amount, saved_amount, deadline, created_at FROM savings_goals WHERE id = ?',
      [goalId]
    );

    return res.status(200).json({
      success: true,
      message: newSaved >= target ? 'Goal reached! 🎉' : 'Funds added successfully.',
      goal: {
        id:           rows[0].id,
        name:         rows[0].name,
        targetAmount: parseFloat(rows[0].target_amount),
        savedAmount:  parseFloat(rows[0].saved_amount),
        deadline:     rows[0].deadline,
        createdAt:    rows[0].created_at,
      }
    });
  } catch (error) {
    console.error('Add funds error:', error);
    return res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
  }
};

// ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
// UPDATE SAVINGS GOAL
// PUT /api/savings/:id
// Body: { name?, target_amount?, deadline? }
// Only editable fields — saved_amount is managed via /funds
// ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
const updateSavingsGoal = async (req, res) => {
  try {
    const userId = req.userId;
    const goalId = parseInt(req.params.id, 10);

    if (isNaN(goalId) || goalId <= 0)
      return res.status(400).json({ success: false, message: 'Invalid goal ID.' });

    // ── Ownership check ───────────────────────────────────────
    const [existing] = await pool.execute(
      'SELECT id FROM savings_goals WHERE id = ? AND user_id = ?',
      [goalId, userId]
    );
    if (existing.length === 0)
      return res.status(404).json({ success: false, message: 'Savings goal not found.' });

    const fields = [];
    const values = [];

    if (req.body.name !== undefined) {
      const name = req.body.name;
      if (typeof name !== 'string' || name.trim().length === 0)
        return res.status(400).json({ success: false, message: 'Goal name cannot be empty.' });
      if (name.trim().length > 100)
        return res.status(400).json({ success: false, message: 'Goal name must be 100 characters or fewer.' });
      fields.push('name = ?');
      values.push(name.trim());
    }

    if (req.body.target_amount !== undefined) {
      const target = parseFloat(req.body.target_amount);
      if (isNaN(target) || target <= 0)
        return res.status(400).json({ success: false, message: 'Target amount must be a positive number.' });
      if (target > 99999999.99)
        return res.status(400).json({ success: false, message: 'Target amount exceeds maximum allowed value.' });
      fields.push('target_amount = ?');
      values.push(target);
    }

    if (req.body.deadline !== undefined) {
      const deadline = req.body.deadline;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline))
        return res.status(400).json({ success: false, message: 'Deadline must be a valid date (YYYY-MM-DD).' });
      if (new Date(deadline) <= new Date())
        return res.status(400).json({ success: false, message: 'Deadline must be a future date.' });
      fields.push('deadline = ?');
      values.push(deadline);
    }

    if (fields.length === 0)
      return res.status(400).json({ success: false, message: 'No valid fields provided for update.' });

    values.push(goalId, userId);
    await pool.execute(
      `UPDATE savings_goals SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
      values
    );

    const [rows] = await pool.execute(
      'SELECT id, name, target_amount, saved_amount, deadline, created_at FROM savings_goals WHERE id = ?',
      [goalId]
    );

    return res.status(200).json({
      success: true,
      message: 'Savings goal updated successfully.',
      goal: {
        id:           rows[0].id,
        name:         rows[0].name,
        targetAmount: parseFloat(rows[0].target_amount),
        savedAmount:  parseFloat(rows[0].saved_amount),
        deadline:     rows[0].deadline,
        createdAt:    rows[0].created_at,
      }
    });
  } catch (error) {
    console.error('Update savings goal error:', error);
    return res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
  }
};

// ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
// DELETE SAVINGS GOAL
// DELETE /api/savings/:id
// ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
const deleteSavingsGoal = async (req, res) => {
  try {
    const userId = req.userId;
    const goalId = parseInt(req.params.id, 10);

    if (isNaN(goalId) || goalId <= 0)
      return res.status(400).json({ success: false, message: 'Invalid goal ID.' });

    const [result] = await pool.execute(
      'DELETE FROM savings_goals WHERE id = ? AND user_id = ?',
      [goalId, userId]
    );

    if (result.affectedRows === 0)
      return res.status(404).json({ success: false, message: 'Savings goal not found.' });

    return res.status(200).json({
      success: true,
      message: 'Savings goal deleted successfully.',
      deletedId: goalId
    });
  } catch (error) {
    console.error('Delete savings goal error:', error);
    return res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
  }
};

module.exports = { getSavingsGoals, createSavingsGoal, addFunds, updateSavingsGoal, deleteSavingsGoal };