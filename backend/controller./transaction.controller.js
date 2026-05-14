const pool = require('../config/database');

// Allowed values — matches your frontend modal options exactly
const VALID_CATEGORIES = [
  'salary', 'freelance', 'investment', 'food', 'transport',
  'shopping', 'health', 'utilities', 'entertain', 'travel','other'
];
const VALID_TYPES    = ['income', 'expense'];
const VALID_STATUSES = ['completed', 'pending', 'failed'];

// ── Helper: convert "HH:MM:SS" → "hh:MM AM/PM" ────────────
function formatTime12h(time24) {
  if (!time24) return '';
  const [h, m] = time24.split(':');
  const hour   = parseInt(h, 10);
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${String(hour12).padStart(2, '0')}:${m} ${period}`;
}

// ── Helper: format DB row → frontend shape ────────────────
function formatTxnForFrontend(row) {
  return {
    id:       row.id,
    merchant: row.merchant,
    desc:     row.description || '',
    category: row.category,
    type:     row.type,
    amount:   parseFloat(row.amount),
    status:   row.status,
    date:     row.txn_date instanceof Date
                ? row.txn_date.toISOString().split('T')[0]
                : row.txn_date,
    time:     formatTime12h(row.txn_time)
  };
}

// ── Helper: advance a date by one billing cycle ───────────
function advanceByOneCycle(dateStr, cycle) {
  const d = new Date(dateStr);
  switch (cycle) {
    case 'daily':     d.setDate(d.getDate() + 1);        break;
    case 'weekly':    d.setDate(d.getDate() + 7);        break;
    case 'monthly':   d.setMonth(d.getMonth() + 1);      break;
    case 'quarterly': d.setMonth(d.getMonth() + 3);      break;
    case 'annual':    d.setFullYear(d.getFullYear() + 1); break;
  }
  return d.toISOString().split('T')[0];
}

// ── SMART SUBSCRIPTION AUTO-UPDATE ───────────────────────
async function autoUpdateSubscription(userId, merchant, type, status) {
  try {
    if (type !== 'expense' || status !== 'completed') return;

    const [subs] = await pool.execute(
      `SELECT id, name, cycle, next_billing
       FROM subscriptions
       WHERE user_id = ? AND status != 'cancelled'`,
      [userId]
    );

    if (subs.length === 0) return;

    const merchantLower = merchant.toLowerCase();

    for (const sub of subs) {
      const subNameLower = sub.name.toLowerCase();

      const isMatch =
        merchantLower.includes(subNameLower) ||
        subNameLower.includes(merchantLower);

      if (isMatch) {
        const newBillingDate = advanceByOneCycle(sub.next_billing, sub.cycle);

        await pool.execute(
          `UPDATE subscriptions
           SET next_billing = ?, status = 'active'
           WHERE id = ? AND user_id = ?`,
          [newBillingDate, sub.id, userId]
        );

        console.log(`✓ Updated "${sub.name}" → next billing: ${newBillingDate}`);
        break;
      }
    }
  } catch (err) {
    console.error('Auto-update subscription error:', err);
  }
}

// ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
// ADD TRANSACTION
// POST /api/transactions
// ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
const addTransaction = async (req, res) => {
  try {
    const userId = req.userId;
    const {
      merchant, amount, type, category, date,
      status = 'completed', desc = ''
    } = req.body;

    // Validation
    if (!merchant || !merchant.trim())
      return res.status(400).json({ success: false, message: 'Merchant / Title is required.' });
    if (merchant.trim().length > 150)
      return res.status(400).json({ success: false, message: 'Merchant name is too long (max 150 characters).' });

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0)
      return res.status(400).json({ success: false, message: 'Amount must be a positive number.' });
    if (parsedAmount > 99999999.99)
      return res.status(400).json({ success: false, message: 'Amount exceeds maximum allowed value.' });

    if (!VALID_TYPES.includes(type))
      return res.status(400).json({ success: false, message: 'Type must be either "income" or "expense".' });
    if (!VALID_CATEGORIES.includes(category))
      return res.status(400).json({ success: false, message: 'Invalid category selected.' });
    if (!VALID_STATUSES.includes(status))
      return res.status(400).json({ success: false, message: 'Invalid status selected.' });

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(new Date(date).getTime()))
      return res.status(400).json({ success: false, message: 'Invalid date format. Use YYYY-MM-DD.' });

    if (desc && desc.length > 500)
      return res.status(400).json({ success: false, message: 'Description is too long (max 500 characters).' });

    // Capture current time server-side
    const txnTime = new Date().toTimeString().split(' ')[0];

    const [result] = await pool.execute(
      `INSERT INTO transactions
       (user_id, merchant, description, category, type, amount, status, txn_date, txn_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, merchant.trim(), desc.trim() || null, category, type, parsedAmount, status, date, txnTime]
    );

    const [rows] = await pool.execute(
      `SELECT id, merchant, description, category, type, amount, status, txn_date, txn_time
       FROM transactions WHERE id = ?`,
      [result.insertId]
    );

    // ── Smart subscription auto-update ────────────────────
    // Only runs for expense transactions (subscriptions are always expenses)
    // Runs after response is built so it never delays the API response
    if (type === 'expense' && status !== 'failed') {
      autoUpdateSubscription(userId, merchant.trim());
    }

    return res.status(201).json({
      success: true,
      message: 'Transaction added successfully.',
      transaction: formatTxnForFrontend(rows[0])
    });
  } catch (error) {
    console.error('Add transaction error:', error);
    return res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
  }
};

// ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
// GET ALL TRANSACTIONS (for the logged-in user)
// GET /api/transactions
// ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
const getTransactions = async (req, res) => {
  try {
    const userId = req.userId;

    const [rows] = await pool.execute(
      `SELECT id, merchant, description, category, type, amount, status, txn_date, txn_time
       FROM transactions
       WHERE user_id = ?
       ORDER BY txn_date DESC, txn_time DESC`,
      [userId]
    );

    return res.status(200).json({
      success: true,
      count: rows.length,
      transactions: rows.map(formatTxnForFrontend)
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    return res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
  }
};

// ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
// UPDATE TRANSACTION
// PUT /api/transactions/:id
// ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
const updateTransaction = async (req, res) => {
  try {
    const userId = req.userId;
    const txnId  = parseInt(req.params.id, 10);

    if (isNaN(txnId) || txnId <= 0)
      return res.status(400).json({ success: false, message: 'Invalid transaction ID.' });

    const {
      merchant, amount, type, category, date,
      status = 'completed', desc = ''
    } = req.body;

    // Same validation as add
    if (!merchant || !merchant.trim())
      return res.status(400).json({ success: false, message: 'Merchant / Title is required.' });
    if (merchant.trim().length > 150)
      return res.status(400).json({ success: false, message: 'Merchant name is too long (max 150 characters).' });

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0)
      return res.status(400).json({ success: false, message: 'Amount must be a positive number.' });
    if (parsedAmount > 99999999.99)
      return res.status(400).json({ success: false, message: 'Amount exceeds maximum allowed value.' });

    if (!VALID_TYPES.includes(type))
      return res.status(400).json({ success: false, message: 'Type must be either "income" or "expense".' });
    if (!VALID_CATEGORIES.includes(category))
      return res.status(400).json({ success: false, message: 'Invalid category selected.' });
    if (!VALID_STATUSES.includes(status))
      return res.status(400).json({ success: false, message: 'Invalid status selected.' });

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(new Date(date).getTime()))
      return res.status(400).json({ success: false, message: 'Invalid date format. Use YYYY-MM-DD.' });

    if (desc && desc.length > 500)
      return res.status(400).json({ success: false, message: 'Description is too long (max 500 characters).' });

    // ── Verify ownership ──────────────────────────────────
    const [existing] = await pool.execute(
      'SELECT id FROM transactions WHERE id = ? AND user_id = ?',
      [txnId, userId]
    );
    if (existing.length === 0)
      return res.status(404).json({ success: false, message: 'Transaction not found.' });

    // ── Update ────────────────────────────────────────────
    await pool.execute(
      `UPDATE transactions
       SET merchant    = ?,
           description = ?,
           category    = ?,
           type        = ?,
           amount      = ?,
           status      = ?,
           txn_date    = ?
       WHERE id = ? AND user_id = ?`,
      [merchant.trim(), desc.trim() || null, category, type, parsedAmount, status, date, txnId, userId]
    );

    const [rows] = await pool.execute(
      `SELECT id, merchant, description, category, type, amount, status, txn_date, txn_time
       FROM transactions WHERE id = ?`,
      [txnId]
    );

    return res.status(200).json({
      success: true,
      message: 'Transaction updated successfully.',
      transaction: formatTxnForFrontend(rows[0])
    });
  } catch (error) {
    console.error('Update transaction error:', error);
    return res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
  }
};

// ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
// DELETE TRANSACTION
// DELETE /api/transactions/:id
// ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
const deleteTransaction = async (req, res) => {
  try {
    const userId = req.userId;
    const txnId  = parseInt(req.params.id, 10);

    if (isNaN(txnId) || txnId <= 0)
      return res.status(400).json({ success: false, message: 'Invalid transaction ID.' });

    const [result] = await pool.execute(
      'DELETE FROM transactions WHERE id = ? AND user_id = ?',
      [txnId, userId]
    );

    if (result.affectedRows === 0)
      return res.status(404).json({ success: false, message: 'Transaction not found.' });

    return res.status(200).json({
      success: true,
      message: 'Transaction deleted successfully.',
      deletedId: txnId
    });
  } catch (error) {
    console.error('Delete transaction error:', error);
    return res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
  }
};

module.exports = {
  addTransaction,
  getTransactions,
  updateTransaction,
  deleteTransaction
};