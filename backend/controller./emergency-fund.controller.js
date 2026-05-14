const pool = require('../config/database');

const VALID_COVERAGES = [3, 4, 6, 9, 12];

// Default expense categories matching the frontend EXPENSES array
const DEFAULT_EXPENSES = [
  { id: 'rent',          name: 'Rent / Mortgage',  val: 1800 },
  { id: 'utilities',     name: 'Utilities',         val: 280  },
  { id: 'groceries',     name: 'Groceries',         val: 600  },
  { id: 'transport',     name: 'Transport',         val: 450  },
  { id: 'insurance',     name: 'Insurance',         val: 320  },
  { id: 'healthcare',    name: 'Healthcare',        val: 200  },
  { id: 'phone',         name: 'Phone / Internet',  val: 150  },
  { id: 'subscriptions', name: 'Subscriptions',     val: 80   },
  { id: 'childcare',     name: 'Child / Pet Care',  val: 300  },
  { id: 'misc',          name: 'Misc / Emergency',  val: 770  },
];

// ── Helper: compute all derived values ───────────────────────────
function computeMetrics(fund, monthlySav, coverage, expenses) {
  const totalMonthly   = expenses.reduce((s, e) => s + (e.val || 0), 0);
  const target         = totalMonthly * coverage;
  const gap            = Math.max(0, target - fund);
  const monthsCovered  = totalMonthly > 0 ? fund / totalMonthly : 0;
  const pct            = target > 0 ? Math.min(100, (fund / target) * 100) : 0;
  const ttgMonths      = monthlySav > 0 && gap > 0 ? gap / monthlySav : 0;

  let score = 0;
  score += Math.min(60, pct * 0.60);
  score += fund > 0 ? 20 : 0;
  score += Math.min(20, (monthlySav / (totalMonthly || 1)) * 100 * 0.20);
  score  = Math.round(score);

  return {
    totalMonthly:  parseFloat(totalMonthly.toFixed(2)),
    target:        parseFloat(target.toFixed(2)),
    gap:           parseFloat(gap.toFixed(2)),
    monthsCovered: parseFloat(monthsCovered.toFixed(2)),
    pct:           parseFloat(pct.toFixed(2)),
    ttgMonths:     parseFloat(ttgMonths.toFixed(2)),
    score,
  };
}

// ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
// GET EMERGENCY FUND
// GET /api/emergency-fund
// Returns the user's saved settings + computed metrics.
// If no record exists yet, returns defaults.
// ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
const getEmergencyFund = async (req, res) => {
  try {
    const userId = req.userId;

    const [rows] = await pool.execute(
      'SELECT * FROM emergency_fund WHERE user_id = ?',
      [userId]
    );

    // No record yet — return defaults
    if (rows.length === 0) {
      const metrics = computeMetrics(14500, 500, 6, DEFAULT_EXPENSES);
      return res.status(200).json({
        success:  true,
        isDefault: true,
        data: {
          fund:        14500,
          monthlySav:  500,
          coverage:    6,
          currency:    '$',
          expenses:    DEFAULT_EXPENSES,
          metrics,
        }
      });
    }

    const row      = rows[0];
    const expenses = row.expenses;
    const metrics  = computeMetrics(
      parseFloat(row.fund),
      parseFloat(row.monthly_savings),
      row.coverage,
      expenses
    );

    return res.status(200).json({
      success:   true,
      isDefault: false,
      data: {
        fund:       parseFloat(row.fund),
        monthlySav: parseFloat(row.monthly_savings),
        coverage:   row.coverage,
        currency:   row.currency,
        expenses,
        metrics,
        updatedAt:  row.updated_at,
      }
    });
  } catch (error) {
    console.error('Get emergency fund error:', error);
    return res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
  }
};

// ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
// SAVE EMERGENCY FUND
// POST /api/emergency-fund
// Body: { fund, monthly_savings, coverage, currency, expenses[] }
// Upserts — creates on first save, updates on subsequent saves.
// ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
const saveEmergencyFund = async (req, res) => {
  try {
    const userId = req.userId;
    const { fund, monthly_savings, coverage, currency = '$', expenses } = req.body;

    // ── Validate ──────────────────────────────────────────────
    const parsedFund = parseFloat(fund);
    if (isNaN(parsedFund) || parsedFund < 0)
      return res.status(400).json({ success: false, message: 'Fund must be a non-negative number.' });
    if (parsedFund > 99999999.99)
      return res.status(400).json({ success: false, message: 'Fund value exceeds maximum allowed.' });

    const parsedSav = parseFloat(monthly_savings);
    if (isNaN(parsedSav) || parsedSav < 0)
      return res.status(400).json({ success: false, message: 'Monthly savings must be a non-negative number.' });

    const parsedCov = parseInt(coverage, 10);
    if (!VALID_COVERAGES.includes(parsedCov))
      return res.status(400).json({ success: false, message: `Coverage must be one of: ${VALID_COVERAGES.join(', ')} months.` });

    const VALID_CURRENCIES = ['$', '£', '€', '₹'];
    if (!VALID_CURRENCIES.includes(currency))
      return res.status(400).json({ success: false, message: 'Invalid currency.' });

    if (!Array.isArray(expenses) || expenses.length === 0)
      return res.status(400).json({ success: false, message: 'Expenses array is required.' });

    // Validate each expense entry
    for (const e of expenses) {
      if (!e.id || typeof e.id !== 'string')
        return res.status(400).json({ success: false, message: 'Each expense must have a valid id.' });
      const v = parseFloat(e.val);
      if (isNaN(v) || v < 0)
        return res.status(400).json({ success: false, message: `Invalid value for expense "${e.id}".` });
      e.val = v; // sanitize
    }

    // ── Upsert ─────────────────────────────────────────────────
    await pool.execute(
      `INSERT INTO emergency_fund (user_id, fund, monthly_savings, coverage, currency, expenses)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         fund             = VALUES(fund),
         monthly_savings  = VALUES(monthly_savings),
         coverage         = VALUES(coverage),
         currency         = VALUES(currency),
         expenses         = VALUES(expenses),
         updated_at       = CURRENT_TIMESTAMP`,
      [userId, parsedFund, parsedSav, parsedCov, currency, JSON.stringify(expenses)]
    );

    const metrics = computeMetrics(parsedFund, parsedSav, parsedCov, expenses);

    return res.status(200).json({
      success: true,
      message: 'Emergency fund saved successfully.',
      data: {
        fund:       parsedFund,
        monthlySav: parsedSav,
        coverage:   parsedCov,
        currency,
        expenses,
        metrics,
      }
    });
  } catch (error) {
    console.error('Save emergency fund error:', error);
    return res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
  }
};

// ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
// RESET EMERGENCY FUND
// DELETE /api/emergency-fund
// Deletes the user's record — next GET returns defaults again.
// ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
const resetEmergencyFund = async (req, res) => {
  try {
    const userId = req.userId;

    await pool.execute(
      'DELETE FROM emergency_fund WHERE user_id = ?',
      [userId]
    );

    return res.status(200).json({
      success: true,
      message: 'Emergency fund reset to defaults.',
    });
  } catch (error) {
    console.error('Reset emergency fund error:', error);
    return res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
  }
};

module.exports = { getEmergencyFund, saveEmergencyFund, resetEmergencyFund };