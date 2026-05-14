const pool = require('../config/database');

// Only expense categories make sense for budgeting
const VALID_CATEGORIES = [
  'food', 'transport', 'shopping', 'health',
  'utilities', 'entertain', 'travel', 'other'
];

// ── Helper: current month as "YYYY-MM" ──────────────────────
function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

// ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
// GET BUDGETS  (for logged-in user, for a given month)
// GET /api/budgets?month=YYYY-MM   (defaults to current month)
// Returns each budget with real "spent" pulled from transactions
// ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
const getBudgets = async (req, res) => {
  try {
    const userId = req.userId;
    const month  = (req.query.month && /^\d{4}-\d{2}$/.test(req.query.month))
                   ? req.query.month
                   : currentMonth();

    const [rows] = await pool.execute(
      `SELECT
         b.id,
         b.category,
         b.monthly_limit,
         b.month,
         COALESCE(SUM(
           CASE WHEN t.type = 'expense'
                 AND DATE_FORMAT(t.txn_date, '%Y-%m') = b.month
                 AND t.status != 'failed'
            THEN t.amount ELSE 0 END
         ), 0) AS spent
       FROM budgets b
       LEFT JOIN transactions t
         ON t.user_id = b.user_id AND t.category = b.category
       WHERE b.user_id = ? AND b.month = ?
       GROUP BY b.id
       ORDER BY b.category ASC`,
      [userId, month]
    );

    return res.status(200).json({
      success: true,
      month,
      budgets: rows.map(r => ({
        id:       r.id,
        category: r.category,
        limit:    parseFloat(r.monthly_limit),
        spent:    parseFloat(r.spent),
        month:    r.month,
      }))
    });
  } catch (error) {
    console.error('Get budgets error:', error);
    return res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
  }
};

// ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
// CREATE BUDGET
// POST /api/budgets
// Body: { category, monthly_limit, month? }
// One budget per category per month — returns 409 if duplicate
// ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
const createBudget = async (req, res) => {
  try {
    const userId = req.userId;
    const { category, monthly_limit, month } = req.body;

    // ── Validate ──────────────────────────────────────────────
    if (!VALID_CATEGORIES.includes(category))
      return res.status(400).json({ success: false, message: 'Invalid category.' });

    const limit = parseFloat(monthly_limit);
    if (isNaN(limit) || limit <= 0)
      return res.status(400).json({ success: false, message: 'Limit must be a positive number.' });
    if (limit > 99999999.99)
      return res.status(400).json({ success: false, message: 'Limit exceeds maximum allowed value.' });

    const targetMonth = (month && /^\d{4}-\d{2}$/.test(month)) ? month : currentMonth();

    // ── Check duplicate ───────────────────────────────────────
    const [existing] = await pool.execute(
      'SELECT id FROM budgets WHERE user_id = ? AND category = ? AND month = ?',
      [userId, category, targetMonth]
    );
    if (existing.length > 0)
      return res.status(409).json({
        success: false,
        message: `A budget for "${category}" already exists for ${targetMonth}. Edit it instead.`
      });

    // ── Insert ────────────────────────────────────────────────
    const [result] = await pool.execute(
      'INSERT INTO budgets (user_id, category, monthly_limit, month) VALUES (?, ?, ?, ?)',
      [userId, category, limit, targetMonth]
    );

    // Return with spent calculated
    const [rows] = await pool.execute(
      `SELECT b.id, b.category, b.monthly_limit, b.month,
              COALESCE(SUM(
                CASE WHEN t.type = 'expense'
                      AND DATE_FORMAT(t.txn_date,'%Y-%m') = b.month
                      AND t.status != 'failed'
                 THEN t.amount ELSE 0 END
              ), 0) AS spent
       FROM budgets b
       LEFT JOIN transactions t ON t.user_id = b.user_id AND t.category = b.category
       WHERE b.id = ?
       GROUP BY b.id`,
      [result.insertId]
    );

    return res.status(201).json({
      success: true,
      message: 'Budget created successfully.',
      budget: {
        id:       rows[0].id,
        category: rows[0].category,
        limit:    parseFloat(rows[0].monthly_limit),
        spent:    parseFloat(rows[0].spent),
        month:    rows[0].month,
      }
    });
  } catch (error) {
    console.error('Create budget error:', error);
    return res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
  }
};

// ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
// UPDATE BUDGET
// PUT /api/budgets/:id
// Body: { monthly_limit }
// Only the limit can be updated (category + month are fixed)
// ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
const updateBudget = async (req, res) => {
  try {
    const userId  = req.userId;
    const budgetId = parseInt(req.params.id, 10);

    if (isNaN(budgetId) || budgetId <= 0)
      return res.status(400).json({ success: false, message: 'Invalid budget ID.' });

    const limit = parseFloat(req.body.monthly_limit);
    if (isNaN(limit) || limit <= 0)
      return res.status(400).json({ success: false, message: 'Limit must be a positive number.' });
    if (limit > 99999999.99)
      return res.status(400).json({ success: false, message: 'Limit exceeds maximum allowed value.' });

    // ── Ownership check ───────────────────────────────────────
    const [existing] = await pool.execute(
      'SELECT id FROM budgets WHERE id = ? AND user_id = ?',
      [budgetId, userId]
    );
    if (existing.length === 0)
      return res.status(404).json({ success: false, message: 'Budget not found.' });

    await pool.execute(
      'UPDATE budgets SET monthly_limit = ? WHERE id = ? AND user_id = ?',
      [limit, budgetId, userId]
    );

    const [rows] = await pool.execute(
      `SELECT b.id, b.category, b.monthly_limit, b.month,
              COALESCE(SUM(
                CASE WHEN t.type = 'expense'
                      AND DATE_FORMAT(t.txn_date,'%Y-%m') = b.month
                      AND t.status != 'failed'
                 THEN t.amount ELSE 0 END
              ), 0) AS spent
       FROM budgets b
       LEFT JOIN transactions t ON t.user_id = b.user_id AND t.category = b.category
       WHERE b.id = ?
       GROUP BY b.id`,
      [budgetId]
    );

    return res.status(200).json({
      success: true,
      message: 'Budget updated successfully.',
      budget: {
        id:       rows[0].id,
        category: rows[0].category,
        limit:    parseFloat(rows[0].monthly_limit),
        spent:    parseFloat(rows[0].spent),
        month:    rows[0].month,
      }
    });
  } catch (error) {
    console.error('Update budget error:', error);
    return res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
  }
};

// ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
// DELETE BUDGET
// DELETE /api/budgets/:id
// ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
const deleteBudget = async (req, res) => {
  try {
    const userId   = req.userId;
    const budgetId = parseInt(req.params.id, 10);

    if (isNaN(budgetId) || budgetId <= 0)
      return res.status(400).json({ success: false, message: 'Invalid budget ID.' });

    const [result] = await pool.execute(
      'DELETE FROM budgets WHERE id = ? AND user_id = ?',
      [budgetId, userId]
    );

    if (result.affectedRows === 0)
      return res.status(404).json({ success: false, message: 'Budget not found.' });

    return res.status(200).json({
      success: true,
      message: 'Budget deleted successfully.',
      deletedId: budgetId
    });
  } catch (error) {
    console.error('Delete budget error:', error);
    return res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
  }
};

module.exports = { getBudgets, createBudget, updateBudget, deleteBudget };