

const pool = require('../config/database');

// ── Helper: current month as "YYYY-MM" ───────────────────────────
function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

// ── Helper: clean MySQL date ─────────────────────────────────────
function cleanDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().split('T')[0];
  return String(val).split('T')[0];
}

// ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
// GET HEALTH SUMMARY
// GET /api/health
// Aggregates data from transactions, budgets, savings_goals,
// subscriptions, and emergency_fund into one response.
// ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
const getHealthSummary = async (req, res) => {
  try {
    const userId = req.userId;
    const month  = currentMonth();

    // ── 1. Monthly income & expenses from transactions ────────
    const [txnSummary] = await pool.execute(
         `SELECT
         SUM(CASE WHEN type='income'  THEN amount ELSE 0 END) AS income,
         SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) AS expenses
       FROM transactions
       WHERE user_id = ? AND status = 'completed'
         AND DATE_FORMAT(txn_date,'%Y-%m') = DATE_FORMAT(NOW(),'%Y-%m')`,
      [userId]
    );

    const monthlyIncome   = parseFloat(txnSummary[0].income)   || 0;
    const monthlyExpenses = parseFloat(txnSummary[0].expenses) || 0;

    // ── 2. Total balance (all time income - expenses) ─────────
    const [balanceSummary] = await pool.execute(
  `SELECT
         SUM(CASE WHEN type='income'  THEN amount ELSE 0 END) -
         SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) AS total_balance
       FROM transactions
       WHERE user_id = ? AND status = 'completed'`,
      [userId]
    );
    
    const totalBalance = parseFloat(balanceSummary[0].total_balance) 


    const [prev] = await pool.execute(
      `SELECT
         SUM(CASE WHEN type='income'  THEN amount ELSE 0 END) AS income,
         SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) AS expenses
       FROM transactions
       WHERE user_id = ? AND status = 'completed'
         AND DATE_FORMAT(txn_date,'%Y-%m') = DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 1 MONTH),'%Y-%m')`,
      [userId]
    );
    // ✅ Correct — access the first element
const prevIncome   = parseFloat(prev[0]?.income)   ;
const prevExpenses = parseFloat(prev[0]?.expenses) ;

    // ── 3. Expense breakdown by category (this month) ─────────
    const [expenseRows] = await pool.execute(
      `SELECT category, SUM(amount) AS total
       FROM transactions
       WHERE user_id = ?
         AND type = 'expense'
         AND status != 'failed'
         AND DATE_FORMAT(txn_date, '%Y-%m') = ?
       GROUP BY category
       ORDER BY total DESC`,
      [userId, month]
    );

    const CATEGORY_META = {
      food:       { name: 'Food',        icon: '🍔', color: 'var(--gold)',    bg: 'rgba(245,158,11,0.12)'  },
      transport:  { name: 'Transport',   icon: '🚗', color: 'var(--violet)',  bg: 'rgba(129,140,248,0.12)' },
      shopping:   { name: 'Shopping',    icon: '🛍️', color: '#f97316',        bg: 'rgba(249,115,22,0.12)'  },
      health:     { name: 'Healthcare',  icon: '💊', color: 'var(--success)', bg: 'rgba(16,185,129,0.12)'  },
      utilities:  { name: 'Utilities',   icon: '⚡', color: '#a78bfa',        bg: 'rgba(167,139,250,0.12)' },
      entertain:  { name: 'Entertainment',icon:'🎬', color: '#ef4444',        bg: 'rgba(239,68,68,0.12)'   },
      travel:     { name: 'Travel',      icon: '✈️', color: 'var(--cyan)',    bg: 'rgba(56,189,248,0.12)'  },
      other:      { name: 'Other',       icon: '📦', color: 'var(--text-300)','bg':'rgba(176,200,230,0.08)'},
    };

    const expenseBreakdown = expenseRows.map(r => ({
      name:   CATEGORY_META[r.category]?.name  || r.category,
      icon:   CATEGORY_META[r.category]?.icon  || '📦',
      color:  CATEGORY_META[r.category]?.color || 'var(--text-300)',
      bg:     CATEGORY_META[r.category]?.bg    || 'rgba(176,200,230,0.08)',
      amount: parseFloat(r.total),
    }));

    // ── 4. Budget status (this month) ─────────────────────────
    const [budgetRows] = await pool.execute(
      `SELECT
         b.id, b.category, b.monthly_limit,
         COALESCE(SUM(
           CASE WHEN t.type = 'expense'
                 AND DATE_FORMAT(t.txn_date,'%Y-%m') = b.month
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

    const budgets = budgetRows.map(r => ({
      name:  CATEGORY_META[r.category]?.name  || r.category,
      icon:  CATEGORY_META[r.category]?.icon  || '📦',
      color: CATEGORY_META[r.category]?.color || 'var(--text-300)',
      bg:    CATEGORY_META[r.category]?.bg    || 'rgba(176,200,230,0.08)',
      limit: parseFloat(r.monthly_limit),
      used:  parseFloat(r.spent),
    }));

    // ── 5. Savings goals ──────────────────────────────────────
    const [goalRows] = await pool.execute(
      `SELECT id, name, target_amount, saved_amount, deadline
       FROM savings_goals
       WHERE user_id = ?
       ORDER BY created_at ASC`,
      [userId]
    );

    const GOAL_COLORS = [
      { color: 'var(--cyan)',    bg: 'rgba(56,189,248,0.12)',  icon: '🎯' },
      { color: 'var(--gold)',    bg: 'rgba(245,158,11,0.12)',  icon: '⭐' },
      { color: 'var(--violet)',  bg: 'rgba(129,140,248,0.12)', icon: '🚀' },
      { color: '#f97316',        bg: 'rgba(249,115,22,0.12)',  icon: '💡' },
      { color: 'var(--success)', bg: 'rgba(16,185,129,0.12)',  icon: '✅' },
      { color: '#a78bfa',        bg: 'rgba(167,139,250,0.12)', icon: '💎' },
    ];

    const savingsGoals = goalRows.map((r, i) => {
      const palette = GOAL_COLORS[i % GOAL_COLORS.length];
      return {
        name:     r.name,
        icon:     palette.icon,
        color:    palette.color,
        bg:       palette.bg,
        target:   parseFloat(r.target_amount),
        saved:    parseFloat(r.saved_amount),
        deadline: cleanDate(r.deadline),
      };
    });

    // ── 6. Subscriptions ──────────────────────────────────────
    const [subRows] = await pool.execute(
      `SELECT id, name, amount, cycle, status, next_billing
       FROM subscriptions
       WHERE user_id = ? AND status != 'cancelled'
       ORDER BY amount DESC`,
      [userId]
    );

    const SUB_COLORS = [
      { color: '#ef4444',        bg: 'rgba(239,68,68,0.12)',   icon: '📺' },
      { color: 'var(--success)', bg: 'rgba(16,185,129,0.12)',  icon: '🎵' },
      { color: 'var(--gold)',    bg: 'rgba(245,158,11,0.12)',  icon: '☁️' },
      { color: '#f97316',        bg: 'rgba(249,115,22,0.12)',  icon: '🎨' },
      { color: 'var(--error)',   bg: 'rgba(244,63,94,0.12)',   icon: '▶️' },
      { color: 'var(--cyan)',    bg: 'rgba(56,189,248,0.12)',  icon: '💪' },
    ];

    const subscriptions = subRows.map((r, i) => {
      const palette = SUB_COLORS[i % SUB_COLORS.length];
      return {
        name:  r.name,
        icon:  palette.icon,
        color: palette.color,
        bg:    palette.bg,
        cost:  parseFloat(r.amount),
        cycle: r.cycle.charAt(0).toUpperCase() + r.cycle.slice(1),
        status: r.status,
        nextBilling: cleanDate(r.next_billing),
      };
    });

    // Leakage: unused/paused subs
    const unusedSubs       = subRows.filter(s => s.status === 'unused' || s.status === 'paused');
    const leakageMonthly   = unusedSubs.reduce((sum, s) => sum + parseFloat(s.amount), 0);

    // ── 7. Emergency fund ─────────────────────────────────────
    const [efRows] = await pool.execute(
      'SELECT fund, monthly_savings, coverage, expenses FROM emergency_fund WHERE user_id = ?',
      [userId]
    );

    let emergencyFund = { current: 0, monthlyExpenses: monthlyExpenses || 1, targetMonths: 6 };
    if (efRows.length > 0) {
      const ef       = efRows[0];
      const expenses = typeof ef.expenses === 'string' ? JSON.parse(ef.expenses) : ef.expenses;
      const totalExp = expenses.reduce((s, e) => s + (e.val || 0), 0);
      emergencyFund  = {
        current:         parseFloat(ef.fund),
        monthlyExpenses: totalExp || monthlyExpenses || 1,
        targetMonths:    ef.coverage,
      };
    }

    // ── 8. Compute health score ───────────────────────────────
    const savingsRate  = monthlyIncome > 0
      ? Math.max(0, Math.min(100, ((monthlyIncome - monthlyExpenses) / monthlyIncome) * 100))
      : 0;
    const savingsScore = Math.min(100, (savingsRate / 30) * 100);

    const budgetTotal  = budgets.reduce((a, b) => a + b.limit, 0);
    const budgetUsed   = budgets.reduce((a, b) => a + b.used, 0);
    const budgetScore  = budgetTotal > 0
      ? Math.min(100, Math.max(0, (1 - (budgetUsed - budgetTotal) / budgetTotal) * 100))
      : 50; // neutral if no budgets set

    const efMonths = emergencyFund.current / (emergencyFund.monthlyExpenses || 1);
    const efScore  = Math.min(100, (efMonths / 6) * 100);

    const goalPcts    = savingsGoals.length > 0
      ? savingsGoals.map(g => g.saved / g.target)
      : [0];
    const avgGoalPct  = goalPcts.reduce((a, b) => a + b, 0) / goalPcts.length;
    const goalScore   = Math.min(100, avgGoalPct * 100);

    const healthScore = Math.round(
      savingsScore * 0.30 +
      budgetScore  * 0.25 +
      efScore      * 0.25 +
      goalScore    * 0.20
    );

    // ── 9. Return everything ──────────────────────────────────
    return res.status(200).json({
      success: true,
      month,
      summary: {
        totalBalance,
        monthlyIncome,
        monthlyExpenses,
        prevExpenses,
        prevIncome,
        savingsRate: parseFloat(savingsRate.toFixed(2)),
      },
      healthScore: {
        score:        healthScore,
        savingsScore: parseFloat(savingsScore.toFixed(1)),
        budgetScore:  parseFloat(budgetScore.toFixed(1)),
        efScore:      parseFloat(efScore.toFixed(1)),
        goalScore:    parseFloat(goalScore.toFixed(1)),
      },
      expenseBreakdown,
      budgets,
      savingsGoals,
      subscriptions,
      leakage: {
        count:         unusedSubs.length,
        monthlyAmount: parseFloat(leakageMonthly.toFixed(2)),
      },
      emergencyFund,
    });
  } catch (error) {
    console.error('Get health summary error:', error);
    return res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
  }
};

module.exports = { getHealthSummary };