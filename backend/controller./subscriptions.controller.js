const pool = require('../config/database');

const VALID_CYCLES    = ['daily', 'weekly', 'monthly', 'quarterly', 'annual'];
const VALID_STATUSES  = ['active', 'unused', 'paused', 'cancelled'];

// ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
// GET SUBSCRIPTIONS
// GET /api/subscriptions
// Returns all subscriptions for the logged-in user
// ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
const getSubscriptions = async (req, res) => {
  try {
    const userId = req.userId;

    const [rows] = await pool.execute(
      `SELECT id, name, cycle, next_billing, amount, status, created_at
       FROM subscriptions
       WHERE user_id = ?
       ORDER BY next_billing ASC`,
      [userId]
    );

    // Compute leakage: unused/paused subs monthly cost
    let leakageMonthly = 0;
    let leakageCount   = 0;

 const subscriptions = rows.map(r => {
  const amount = parseFloat(r.amount);
  const rawDate = r.next_billing instanceof Date
    ? r.next_billing.toISOString().split('T')[0]
    : String(r.next_billing).split('T')[0];

  // leakage calculation stays the same ...
   if (r.status === 'unused' || r.status === 'paused') {
    leakageCount++;
    leakageMonthly += toMonthly(amount, r.cycle);
  }

  return {
    id:          r.id,
    name:        r.name,
    cycle:       r.cycle,
    nextBilling: rawDate,        // ← clean date here too
    amount,
    status:      r.status,
    createdAt:   r.created_at,
  };
});

    return res.status(200).json({
      success: true,
      subscriptions,
      leakage: {
        count:          leakageCount,
        monthlyAmount:  parseFloat(leakageMonthly.toFixed(2)),
      }
    });
  } catch (error) {
    console.error('Get subscriptions error:', error);
    return res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
  }
};

// ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
// CREATE SUBSCRIPTION
// POST /api/subscriptions
// Body: { name, cycle, next_billing, amount, status? }
// ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
const createSubscription = async (req, res) => {
  try {
    const userId = req.userId;
    const { name, cycle, next_billing, amount, status = 'active' } = req.body;

    // ── Validate ──────────────────────────────────────────────
    if (!name || typeof name !== 'string' || name.trim().length === 0)
      return res.status(400).json({ success: false, message: 'Subscription name is required.' });
    if (name.trim().length > 100)
      return res.status(400).json({ success: false, message: 'Name must be 100 characters or fewer.' });

    if (!VALID_CYCLES.includes(cycle))
      return res.status(400).json({ success: false, message: `Cycle must be one of: ${VALID_CYCLES.join(', ')}.` });

    if (!next_billing || !/^\d{4}-\d{2}-\d{2}$/.test(next_billing))
      return res.status(400).json({ success: false, message: 'Next billing date must be a valid date (YYYY-MM-DD).' });

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0)
      return res.status(400).json({ success: false, message: 'Amount must be a positive number.' });
    if (parsedAmount > 99999999.99)
      return res.status(400).json({ success: false, message: 'Amount exceeds maximum allowed value.' });

    if (!VALID_STATUSES.includes(status))
      return res.status(400).json({ success: false, message: `Status must be one of: ${VALID_STATUSES.join(', ')}.` });

    // ── Insert ─────────────────────────────────────────────
    const [result] = await pool.execute(
      `INSERT INTO subscriptions (user_id, name, cycle, next_billing, amount, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, name.trim(), cycle, next_billing, parsedAmount, status]
    );
try {
  await pool.execute(
    `INSERT INTO transactions
     (user_id, merchant, description, category, type, amount, status, txn_date, txn_time)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      name.trim(),
      'Auto subscription created',
      'utilities',
      'expense',
      parsedAmount,
      'completed',
      new Date().toISOString().split('T')[0],
      new Date().toTimeString().split(' ')[0]
    ]
  );

  console.log("✔ Subscription transaction created");
} catch (err) {
  console.error("❌ Transaction insert failed:", err);
}

    const [rows] = await pool.execute(
      'SELECT id, name, cycle, next_billing, amount, status, created_at FROM subscriptions WHERE id = ?',
      [result.insertId]
    );

    return res.status(201).json({
      success: true,
      message: 'Subscription created successfully.',
      subscription: formatRow(rows[0])
    });
  } catch (error) {
    console.error('Create subscription error:', error);
    return res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
  }
};

// ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
// UPDATE SUBSCRIPTION
// PUT /api/subscriptions/:id
// Body: { name?, cycle?, next_billing?, amount?, status? }
// ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
const updateSubscription = async (req, res) => {
  try {
    const userId = req.userId;
    const subId  = parseInt(req.params.id, 10);

    if (isNaN(subId) || subId <= 0)
      return res.status(400).json({ success: false, message: 'Invalid subscription ID.' });

    const [existing] = await pool.execute(
      'SELECT id FROM subscriptions WHERE id = ? AND user_id = ?',
      [subId, userId]
    );
    if (existing.length === 0)
      return res.status(404).json({ success: false, message: 'Subscription not found.' });

    const fields = [];
    const values = [];

    if (req.body.name !== undefined) {
      const name = req.body.name;
      if (typeof name !== 'string' || name.trim().length === 0)
        return res.status(400).json({ success: false, message: 'Name cannot be empty.' });
      if (name.trim().length > 100)
        return res.status(400).json({ success: false, message: 'Name must be 100 characters or fewer.' });
      fields.push('name = ?'); values.push(name.trim());
    }

    if (req.body.cycle !== undefined) {
      if (!VALID_CYCLES.includes(req.body.cycle))
        return res.status(400).json({ success: false, message: `Cycle must be one of: ${VALID_CYCLES.join(', ')}.` });
      fields.push('cycle = ?'); values.push(req.body.cycle);
    }

    if (req.body.next_billing !== undefined) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(req.body.next_billing))
        return res.status(400).json({ success: false, message: 'Next billing date must be YYYY-MM-DD.' });
      fields.push('next_billing = ?'); values.push(req.body.next_billing);
    }

    if (req.body.amount !== undefined) {
      const amt = parseFloat(req.body.amount);
      if (isNaN(amt) || amt <= 0)
        return res.status(400).json({ success: false, message: 'Amount must be a positive number.' });
      if (amt > 99999999.99)
        return res.status(400).json({ success: false, message: 'Amount exceeds maximum allowed value.' });
      fields.push('amount = ?'); values.push(amt);
    }

    if (req.body.status !== undefined) {
      if (!VALID_STATUSES.includes(req.body.status))
        return res.status(400).json({ success: false, message: `Status must be one of: ${VALID_STATUSES.join(', ')}.` });
      fields.push('status = ?'); values.push(req.body.status);
    }

    if (fields.length === 0)
      return res.status(400).json({ success: false, message: 'No valid fields provided for update.' });

    values.push(subId, userId);
    await pool.execute(
      `UPDATE subscriptions SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
      values
    );

    const [rows] = await pool.execute(
      'SELECT id, name, cycle, next_billing, amount, status, created_at FROM subscriptions WHERE id = ?',
      [subId]
    );

    return res.status(200).json({
      success: true,
      message: 'Subscription updated successfully.',
      subscription: formatRow(rows[0])
    });
  } catch (error) {
    console.error('Update subscription error:', error);
    return res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
  }
};

// ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
// DELETE SUBSCRIPTION
// DELETE /api/subscriptions/:id
// ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
const deleteSubscription = async (req, res) => {
  try {
    const userId = req.userId;
    const subId  = parseInt(req.params.id, 10);

    if (isNaN(subId) || subId <= 0)
      return res.status(400).json({ success: false, message: 'Invalid subscription ID.' });

    const [result] = await pool.execute(
      'DELETE FROM subscriptions WHERE id = ? AND user_id = ?',
      [subId, userId]
    );

    if (result.affectedRows === 0)
      return res.status(404).json({ success: false, message: 'Subscription not found.' });

    return res.status(200).json({
      success: true,
      message: 'Subscription deleted successfully.',
      deletedId: subId
    });
  } catch (error) {
    console.error('Delete subscription error:', error);
    return res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
  }
};

// ── Helpers ───────────────────────────────────────────────────
function formatRow(r) {
  // Clean the date — strip time and timezone
  const rawDate = r.next_billing instanceof Date
    ? r.next_billing.toISOString().split('T')[0]
    : String(r.next_billing).split('T')[0];

  return {
    id:          r.id,
    name:        r.name,
    cycle:       r.cycle,
    nextBilling: rawDate,        // now always "YYYY-MM-DD"
    amount:      parseFloat(r.amount),
    status:      r.status,
    createdAt:   r.created_at,
  };
}

function toMonthly(amount, cycle) {
  switch (cycle) {
    case 'daily':     return amount * 30;
    case 'weekly':    return amount * 4.33;
    case 'monthly':   return amount;
    case 'quarterly': return amount / 3;
    case 'annual':    return amount / 12;
    default:          return amount;
  }
}

module.exports = { getSubscriptions, createSubscription, updateSubscription, deleteSubscription };