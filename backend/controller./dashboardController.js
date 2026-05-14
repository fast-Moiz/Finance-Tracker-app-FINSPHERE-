'use strict';

const db = require('../config/database');

/**
 * GET /api/dashboard/summary
 * Returns everything needed to render the main dashboard in one request:
 *   totalBalance, currentMonth, previousMonth, chart (6 months),
 *   sparkline, recentTransactions, upcomingBills, healthScore
 */
exports.summary = async (req, res) => {
  const userId = req.userId;

  try {
    /* ── 1. All-time balance ──────────────────────────────────── */
    const [[balRow]] = await db.execute(
      `SELECT
         SUM(CASE WHEN type='income'  THEN amount ELSE 0 END) -
         SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) AS total_balance
       FROM transactions
       WHERE user_id = ? AND status = 'completed'`,
      [userId]
    );
    const totalBalance = parseFloat(balRow.total_balance) || 0;

    /* ── 2. Current month ─────────────────────────────────────── */
    const [[cur]] = await db.execute(
      `SELECT
         SUM(CASE WHEN type='income'  THEN amount ELSE 0 END) AS income,
         SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) AS expenses
       FROM transactions
       WHERE user_id = ? AND status = 'completed'
         AND DATE_FORMAT(txn_date,'%Y-%m') = DATE_FORMAT(NOW(),'%Y-%m')`,
      [userId]
    );
    const curIncome   = parseFloat(cur.income)   || 0;
    const curExpenses = parseFloat(cur.expenses)  || 0;
    const curSaved    = curIncome - curExpenses;
    const savingsRate = curIncome > 0 ? +((curSaved / curIncome) * 100).toFixed(1) : 0;

    /* ── 3. Previous month ────────────────────────────────────── */
    const [[prev]] = await db.execute(
      `SELECT
         SUM(CASE WHEN type='income'  THEN amount ELSE 0 END) AS income,
         SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) AS expenses
       FROM transactions
       WHERE user_id = ? AND status = 'completed'
         AND DATE_FORMAT(txn_date,'%Y-%m') = DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 1 MONTH),'%Y-%m')`,
      [userId]
    );
    const prevIncome   = parseFloat(prev.income)   || 0;
    const prevExpenses = parseFloat(prev.expenses)  || 0;

    /* ── 4. Last 6 months — chart data ───────────────────────── */
    const [chartRows] = await db.execute(
      `SELECT
         DATE_FORMAT(txn_date,'%b')                                 AS label,
         DATE_FORMAT(txn_date,'%Y-%m')                              AS ym,
         SUM(CASE WHEN type='income'  THEN amount ELSE 0 END)       AS income,
         SUM(CASE WHEN type='expense' THEN amount ELSE 0 END)       AS expenses,
         SUM(CASE WHEN type='income'  THEN amount ELSE -amount END) AS net_savings
       FROM transactions
       WHERE user_id = ? AND status = 'completed'
         AND txn_date >= DATE_SUB(LAST_DAY(NOW()), INTERVAL 5 MONTH)
       GROUP BY ym, label
       ORDER BY ym`,
      [userId]
    );

    /* ── 5. Sparkline — cumulative rolling balance ────────────── */
    const [sparkRows] = await db.execute(
      `SELECT
         DATE_FORMAT(txn_date,'%Y-%m')                              AS ym,
         SUM(CASE WHEN type='income'  THEN amount ELSE -amount END) AS net
       FROM transactions
       WHERE user_id = ? AND status = 'completed'
         AND txn_date >= DATE_SUB(LAST_DAY(NOW()), INTERVAL 5 MONTH)
       GROUP BY ym
       ORDER BY ym`,
      [userId]
    );
    // Build cumulative balance going backwards from current total
    let running = totalBalance;
    const balByMonth = {};
    [...sparkRows].reverse().forEach(r => {
      balByMonth[r.ym] = running;
      running -= parseFloat(r.net);
    });
    const sparkline = sparkRows.map(r => balByMonth[r.ym]);

    /* ── 6. Recent transactions (last 6) ─────────────────────── */
    const [recentTxns] = await db.execute(
      `SELECT id, merchant, category, type, amount, txn_date
       FROM transactions
       WHERE user_id = ? AND status = 'completed'
       ORDER BY txn_date DESC, created_at DESC
       LIMIT 6`,
      [userId]
    );

    /* ── 7. Upcoming bills ────────────────────────────────────── */
    const [bills] = await db.execute(
      `SELECT id, name, amount, next_billing, cycle
       FROM subscriptions
       WHERE user_id = ? AND status = 'active'
       ORDER BY next_billing
       LIMIT 4`,
      [userId]
    );

    /* ── 8. Health score ─────────────────────────────────────── */
    const [[efRow]] = await db.execute(
      `SELECT fund FROM emergency_fund WHERE user_id = ? LIMIT 1`,
      [userId]
    );
    const efFund   = efRow ? parseFloat(efRow.fund) : 0;
    const efMonths = curExpenses > 0 ? efFund / curExpenses : 0;

    const srScore  = Math.min(40, (savingsRate / 100) * 80);
    const efScore  = Math.min(30, (efMonths / 6) * 30);
    const expRatio = curIncome > 0 ? curExpenses / curIncome : 1;
    const expScore = Math.max(0, 30 - expRatio * 30);
    const healthScore = Math.round(srScore + efScore + expScore);

    /* ── Response ────────────────────────────────────────────── */
    res.json({
      totalBalance,
      currentMonth: {
        income:      curIncome,
        expenses:    curExpenses,
        saved:       curSaved,
        savingsRate,
      },
      previousMonth: { income: prevIncome, expenses: prevExpenses },
      chart: {
        labels:     chartRows.map(r => r.label),
        income:     chartRows.map(r => parseFloat(r.income)),
        expenses:   chartRows.map(r => parseFloat(r.expenses)),
        netSavings: chartRows.map(r => parseFloat(r.net_savings)),
      },
      sparkline,
      recentTransactions: recentTxns,
      upcomingBills:      bills,
      healthScore,
    });

  } catch (err) {
    console.error('dashboard/summary:', err);
    res.status(500).json({ error: 'Could not load dashboard.' });
  }
};