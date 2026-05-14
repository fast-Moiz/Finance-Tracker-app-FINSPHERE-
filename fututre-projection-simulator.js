/**
 * FinSphere — Future Projection Simulator
 * ============================================================
 * Pure frontend financial simulation engine.
 * Handles:
 *   • Savings growth with halal profit rates (Base / Bull / Bear)
 *   • Debt payoff with three repayment methods
 *   • What-If scenario analysis
 *   • Live chart updates via Chart.js
 *   • KPI cards, milestone lists, and result panels
 * ============================================================
 */

/* ─────────────────────────────────────────────────
   GLOBAL STATE
   All slider values and UI selections live here.
───────────────────────────────────────────────── */
const S = {
  savings:    1200,   // monthly contribution ($)
  returnRate: 7,      // annual return rate (%)
  current:    24000,  // starting portfolio value ($)
  inflation:  2.5,    // annual inflation (%)
  raise:      3,      // annual salary raise (%)
  debt:       18500,  // total outstanding debt ($)
  payment:    650,    // monthly debt payment ($)
  interest:   14,     // average profit rate (%)
  method:     'snowball',   // repayment method
  horizon:    10,     // projection horizon (years)
  scenario:   'base', // chart scenario
  tab:        'savings',    // active tab
  whatifSel:  [],     // selected what-if scenario IDs
};

/* Reference year / month for date calculations */
const TODAY_YEAR  = new Date().getFullYear();
const TODAY_MONTH = new Date().getMonth() + 1; // 1-indexed

/* ─────────────────────────────────────────────────
   ISLAMIC CONSTANTS
───────────────────────────────────────────────── */
/** Nisab threshold (approx. 87.48g gold × ~$97/g). Update annually. */
const NISAB = 8500;
const ZAKAT_RATE = 0.025; // 2.5% of savings above nisab

/* ─────────────────────────────────────────────────
   STATIC ISLAMIC FINANCE BREAKDOWN (demo data)
   All products are Shariah-compliant — no riba.
   Rates shown are profit rates, not interest.
───────────────────────────────────────────────── */
const DEBTS = [
  { name: 'Murabaha Finance',    rate: 10.5, balance: 6200,  icon: '🏦', color: 'var(--error)',   colorRgb: '244,63,94'  },
  { name: 'Ijarah Car Finance',  rate: 7.5,  balance: 9800,  icon: '🚗', color: 'var(--orange)',  colorRgb: '251,146,60' },
  { name: 'Qard Hasan (Family)', rate: 0,    balance: 2500,  icon: '🤝', color: 'var(--gold)',    colorRgb: '245,158,11' },
];

/* ─────────────────────────────────────────────────
   WHAT-IF SCENARIO DEFINITIONS (Islamic Finance)
───────────────────────────────────────────────── */
const WHATIF_SCENARIOS = [
  { id: 'raise_savings', icon: '💰', name: 'Save +$300/mo',      desc: 'Increase monthly savings by $300',       impact: '+$68K',      delta: 68000, fireYrs: -2.1, color: 'green'  },
  { id: 'lower_debt',    icon: '🏦', name: 'Extra Payment $200', desc: 'Pay $200 extra on finance balance',       impact: '-1.2y',      delta: 22000, fireYrs: -0.8, color: 'cyan'   },
  { id: 'job_raise',     icon: '📈', name: '+10% Income',         desc: 'Simulate a 10% salary increase',          impact: '+$94K',      delta: 94000, fireYrs: -3.4, color: 'mint'   },
  { id: 'pay_zakat',     icon: '🌙', name: 'Zakat + Sadaqah',    desc: 'Early Zakat & charity brings barakah',     impact: '🤲 Barakah', delta: 18000, fireYrs: -1.0, color: 'gold'   },
  { id: 'side_hustle',   icon: '🚀', name: 'Side Income $500',   desc: 'Extra $500/mo from a side business',      impact: '+$82K',      delta: 82000, fireYrs: -2.8, color: 'violet' },
  { id: 'cut_expenses',  icon: '✂️', name: 'Cut Costs 15%',      desc: 'Reduce monthly expenses by 15%',          impact: '+$31K',      delta: 31000, fireYrs: -1.2, color: 'gold'   },
];

/* Chart.js instance (initialised on DOMContentLoaded) */
let mainChart = null;

/* ═══════════════════════════════════════════════════════════════
   UTILITY HELPERS
═══════════════════════════════════════════════════════════════ */

/**
 * Format a number as a compact currency string.
 * e.g. 1234567 → "$1.23M" | 84230 → "$84.2K"
 */
function fmt(n) {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000)     return '$' + (n / 1_000).toFixed(1) + 'K';
  return '$' + Math.round(n).toLocaleString();
}

/**
 * Convert a month offset from today into a readable date string.
 * @param {number} months - offset in months from today
 */
function monthToDate(months) {
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const total = (TODAY_MONTH - 1) + months;
  const yr = TODAY_YEAR + Math.floor(total / 12);
  const mo = total % 12;
  return `${MONTHS[mo]} ${yr}`;
}

/* ═══════════════════════════════════════════════════════════════
   FINANCIAL CALCULATIONS
═══════════════════════════════════════════════════════════════ */

/**
 * Compound the portfolio monthly for H years, deducting annual Zakat (2.5%
 * on savings above the nisab threshold) — an obligation in Islamic finance.
 * Returns the ending nominal value after Zakat. No riba (interest) involved.
 */
function calcFinalSavings() {
  const { savings: mo, returnRate: r, current: init, horizon: H, raise } = S;
  const mRate = r / 100 / 12;
  const rFac  = 1 + raise / 100;
  let val = init, moSav = mo;
  for (let y = 0; y < H; y++) {
    for (let m = 0; m < 12; m++) val = (val + moSav) * (1 + mRate);
    moSav *= rFac;
    // Deduct annual Zakat on savings above nisab (Islamic obligation)
    if (val > NISAB) val -= (val - NISAB) * ZAKAT_RATE;
  }
  return val;
}

/**
 * Total contributions over the horizon.
 */
function calcContributions() {
  const { savings: mo, horizon: H, raise } = S;
  let total = 0, moSav = mo;
  for (let y = 0; y < H; y++) { total += moSav * 12; moSav *= (1 + raise / 100); }
  return total;
}

/**
 * Financial Independence (Freedom) number = 25 × annual halal expenses.
 * Based on the 4% safe withdrawal rule, adapted for halal investments.
 */
function calcFire() {
  const annualExpenses = Math.max(S.savings * 12 * 0.7, 20000);
  return annualExpenses * 25;
}

/**
 * Calculate annual Zakat due on current savings.
 * Zakat = 2.5% of savings above nisab threshold.
 * Nisab ≈ value of 87.48g gold (updated annually).
 */
function calcZakat() {
  const taxable = Math.max(0, S.current - NISAB);
  return taxable * ZAKAT_RATE;
}

/**
 * Year Financial Independence is reached (portfolio >= Freedom target),
 * accounting for annual Zakat deductions. Returns null if beyond 60 years.
 */
function calcFireYear() {
  const { savings: mo, returnRate: r, current: init, raise } = S;
  const mRate = r / 100 / 12;
  const rFac  = 1 + raise / 100;
  const target = calcFire();
  let val = init, moSav = mo;
  for (let y = 1; y <= 60; y++) {
    for (let m = 0; m < 12; m++) val = (val + moSav) * (1 + mRate);
    moSav *= rFac;
    // Annual Zakat deduction
    if (val > NISAB) val -= (val - NISAB) * ZAKAT_RATE;
    if (val >= target) return TODAY_YEAR + y;
  }
  return null;
}

/**
 * Months until debt is paid off given monthly payment.
 * Returns { months, totalInterest }.
 */
function calcDebtPayoff() {
  const { debt, payment: pmt, interest: irate } = S;
  const monthly = irate / 100 / 12;
  let bal = debt, months = 0, totInt = 0;
  if (pmt <= bal * monthly) return { months: Infinity, totalInterest: Infinity }; // never paid
  while (bal > 0.01 && months < 600) {
    const intCharge = bal * monthly;
    totInt += intCharge;
    bal = Math.max(0, bal + intCharge - pmt);
    months++;
  }
  return { months, totalInterest: totInt };
}

/**
 * Estimate financing cost saved vs paying minimum (2% of balance or $25).
 * Fully Shariah-compliant — no riba. Uses profit rate, not interest.
 */
function calcFinancingCostSaved() {
  const { debt, interest: irate } = S;
  const monthly = irate / 100 / 12;
  const minPmt  = Math.max(25, debt * 0.02);
  let bal = debt, months = 0, totInt = 0;
  while (bal > 0.01 && months < 600) {
    const ic = bal * monthly;
    totInt += ic;
    bal = Math.max(0, bal + ic - minPmt);
    months++;
  }
  const { totalInterest } = calcDebtPayoff();
  return Math.max(0, totInt - totalInterest);
}

/* ═══════════════════════════════════════════════════════════════
   CHART DATA BUILDERS
═══════════════════════════════════════════════════════════════ */

/**
 * Build yearly data arrays for the Savings Growth chart.
 * Annual Zakat (2.5% above nisab) is deducted each year.
 */
function buildChartData() {
  const { savings: mo, returnRate: r, current: init, inflation: inf, horizon: H, raise } = S;
  const rBase = r / 100;
  const rBull = (r + 3) / 100;
  const rBear = Math.max(0, r - 3.5) / 100;
  const infR  = inf / 100;
  const raiseFactor = 1 + raise / 100;

  const labels = [], base = [], bull = [], bear = [], real = [], contribs = [];
  let bVal = init, buVal = init, beVal = init, moSav = mo;

  for (let yr = 0; yr <= H; yr++) {
    labels.push(yr === 0 ? 'Now' : `${TODAY_YEAR + yr}`);
    base.push(Math.round(bVal / 1000));
    bull.push(Math.round(buVal / 1000));
    bear.push(Math.round(beVal / 1000));
    real.push(Math.round(bVal / Math.pow(1 + infR, yr) / 1000));
    contribs.push(Math.round((init + moSav * 12 * yr) / 1000));

    // Compound monthly for the next year
    const nextMoSav = moSav * raiseFactor;
    for (let m = 0; m < 12; m++) {
      bVal  = (bVal  + moSav)     * (1 + rBase / 12);
      buVal = (buVal + nextMoSav) * (1 + rBull / 12);
      beVal = (beVal + moSav)     * (1 + rBear / 12);
    }
    // Deduct annual Zakat (2.5% above nisab) from each scenario
    if (bVal  > NISAB) bVal  -= (bVal  - NISAB) * ZAKAT_RATE;
    if (buVal > NISAB) buVal -= (buVal - NISAB) * ZAKAT_RATE;
    if (beVal > NISAB) beVal -= (beVal - NISAB) * ZAKAT_RATE;

    moSav = nextMoSav;
  }
  return { labels, base, bull, bear, real, contribs };
}

/**
 * Build monthly data arrays for the Debt Payoff chart.
 */
function buildDebtChartData() {
  const { debt: totalDebt, payment: pmt, interest: irate, horizon: H } = S;
  const monthly = irate / 100 / 12;
  const labels = [], balances = [], interestPaid = [];
  let bal = totalDebt, totInt = 0;

  const maxMonths = Math.min(H * 12, 120);
  for (let m = 0; m <= maxMonths; m++) {
    if (m % 4 === 0) { // sample every 4 months to keep chart readable
      labels.push(m === 0 ? 'Now' : `M${m}`);
      balances.push(+(bal / 1000).toFixed(2));
      interestPaid.push(Math.round(totInt));
    }
    if (bal <= 0) break;
    const ic = bal * monthly;
    totInt += ic;
    bal = Math.max(0, bal + ic - pmt);
  }
  return { labels, balances, interestPaid };
}

/**
 * Assemble a What-If overlay: base + adjusted lines per selected scenario.
 */
function buildWhatifChartData() {
  const base = buildChartData();
  const selected = WHATIF_SCENARIOS.filter(sc => S.whatifSel.includes(sc.id));
  const totalDelta = selected.reduce((s, sc) => s + sc.delta, 0);

  const adjusted = base.base.map((v, i) => {
    const progress = i / base.labels.length;
    return Math.max(0, Math.round(v + (totalDelta / 1000) * progress));
  });

  return { labels: base.labels, base: base.base, adjusted };
}

/* ═══════════════════════════════════════════════════════════════
   CHART.JS CONFIGURATION
═══════════════════════════════════════════════════════════════ */

/**
 * Shared axis/tooltip options for all chart types.
 */
function sharedChartOptions(yLabel) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    animation:   { duration: 600, easing: 'easeInOutQuart' },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(6,15,38,0.95)',
        borderColor:     'rgba(56,189,248,0.3)',
        borderWidth: 1,
        titleColor:  '#7a90b8',
        bodyColor:   '#eef2ff',
        padding: 10,
        callbacks: {
          label: ctx => ` ${ctx.dataset.label}: $${ctx.formattedValue}K`,
        },
      },
    },
    scales: {
      x: {
        grid:  { color: 'rgba(255,255,255,0.04)' },
        ticks: {
          color: 'rgba(80,110,155,0.6)', font: { size: 10 }, maxRotation: 0,
          callback(v, i, arr) {
            const max = arr.length - 1;
            const labels = this.chart.data.labels;
            return i === 0 || i === Math.floor(max / 2) || i === max
              ? (labels ? labels[i] : v) : '';
          },
        },
      },
      y: {
        grid:  { color: 'rgba(255,255,255,0.04)' },
        ticks: { color: 'rgba(80,110,155,0.6)', font: { size: 10 }, callback: v => `$${v}K` },
      },
    },
  };
}

/**
 * Build the full Chart.js config based on active tab + scenario.
 */
function getChartConfig() {
  const canvas = document.getElementById('mainChart');
  const ctx    = canvas.getContext('2d');

  /* ── Debt tab ── */
  if (S.tab === 'debt') {
    const data  = buildDebtChartData();
    const gradB = ctx.createLinearGradient(0, 0, 0, 300);
    gradB.addColorStop(0, 'rgba(244,63,94,0.18)');
    gradB.addColorStop(1, 'rgba(244,63,94,0)');
    return {
      type: 'line',
      data: {
        labels: data.labels,
        datasets: [{
          label: 'Remaining Balance ($K)',
          data: data.balances,
          borderColor: '#f43f5e',
          backgroundColor: gradB,
          fill: true, tension: 0.45, borderWidth: 2.5,
          pointRadius: 2, pointHoverRadius: 5,
        }],
      },
      options: sharedChartOptions('Debt Balance ($K)'),
    };
  }

  /* ── What-If tab ── */
  if (S.tab === 'whatif') {
    const data   = buildWhatifChartData();
    const gradB  = ctx.createLinearGradient(0, 0, 0, 280);
    gradB.addColorStop(0, 'rgba(56,189,248,0.15)');
    gradB.addColorStop(1, 'rgba(56,189,248,0)');
    const gradA  = ctx.createLinearGradient(0, 0, 0, 280);
    gradA.addColorStop(0, 'rgba(129,140,248,0.18)');
    gradA.addColorStop(1, 'rgba(129,140,248,0)');
    return {
      type: 'line',
      data: {
        labels: data.labels,
        datasets: [
          { label: 'Base Case ($K)',     data: data.base,     borderColor: '#38bdf8', backgroundColor: gradB, fill: false, tension: 0.45, borderWidth: 2,   pointRadius: 1, pointHoverRadius: 4 },
          { label: 'Adjusted Case ($K)', data: data.adjusted, borderColor: '#818cf8', backgroundColor: gradA, fill: true,  tension: 0.45, borderWidth: 2.5, pointRadius: 2, pointHoverRadius: 5 },
        ],
      },
      options: sharedChartOptions('Portfolio Value ($K)'),
    };
  }

  /* ── Savings tab (default) ── */
  const data = buildChartData();
  const grad = ctx.createLinearGradient(0, 0, 0, 280);
  grad.addColorStop(0, 'rgba(56,189,248,0.22)');
  grad.addColorStop(1, 'rgba(56,189,248,0)');

  const gradBull = ctx.createLinearGradient(0, 0, 0, 280);
  gradBull.addColorStop(0, 'rgba(16,185,129,0.14)');
  gradBull.addColorStop(1, 'rgba(16,185,129,0)');

  const gradBear = ctx.createLinearGradient(0, 0, 0, 280);
  gradBear.addColorStop(0, 'rgba(244,63,94,0.1)');
  gradBear.addColorStop(1, 'rgba(244,63,94,0)');

  const fireKNum = Math.round(calcFire() / 1000);
  const datasets = [];

  if (S.scenario === 'base' || S.scenario === 'all') {
    datasets.push({ label: 'Base Case ($K)',    data: data.base,    borderColor: '#38bdf8', backgroundColor: grad,     fill: S.scenario === 'base', tension: 0.45, borderWidth: 2.5, pointRadius: 2, pointHoverRadius: 5 });
  }
  if (S.scenario === 'bull' || S.scenario === 'all') {
    datasets.push({ label: 'Bull Case ($K)',    data: data.bull,    borderColor: '#10b981', backgroundColor: gradBull, fill: S.scenario === 'bull', tension: 0.45, borderWidth: 2,   pointRadius: 1, pointHoverRadius: 4 });
  }
  if (S.scenario === 'bear' || S.scenario === 'all') {
    datasets.push({ label: 'Bear Case ($K)',    data: data.bear,    borderColor: '#f43f5e', backgroundColor: gradBear, fill: S.scenario === 'bear', tension: 0.45, borderWidth: 2,   pointRadius: 1, pointHoverRadius: 4 });
  }
  datasets.push({ label: 'Contributions ($K)', data: data.contribs, borderColor: 'rgba(129,140,248,0.5)', backgroundColor: 'transparent', fill: false, tension: 0.3, borderWidth: 1.5, borderDash: [5, 4], pointRadius: 0 });
  datasets.push({ label: 'FIRE Target',         data: new Array(data.labels.length).fill(fireKNum), borderColor: 'rgba(245,158,11,0.5)', backgroundColor: 'transparent', fill: false, borderWidth: 1.5, borderDash: [7, 4], pointRadius: 0 });

  return {
    type: 'line',
    data: { labels: data.labels, datasets },
    options: sharedChartOptions('Portfolio Value ($K)'),
  };
}

/* ── Chart initialisation / update ────────────────────────────── */

function initChart() {
  mainChart = new Chart(document.getElementById('mainChart'), getChartConfig());
}

function updateChart() {
  if (!mainChart) return;
  const cfg = getChartConfig();
  mainChart.data    = cfg.data;
  mainChart.options = cfg.options;
  mainChart.update();
}

/* ═══════════════════════════════════════════════════════════════
   UI UPDATERS
   Called after every slider change or tab switch.
═══════════════════════════════════════════════════════════════ */

/** Master update — re-renders all panels based on current state S */
function updateUI() {
  updateSliderLabels();
  updateKPIs();
  updateChart();

  if (S.tab === 'savings')  updateSavingsPanel();
  if (S.tab === 'debt')     updateDebtPanel();
  if (S.tab === 'whatif')   buildWhatif();
}

/** Refresh the displayed values next to each slider */
function updateSliderLabels() {
  const { savings, returnRate, current, inflation, raise, debt, payment, interest } = S;
  document.getElementById('v-savings').innerHTML   = `$${savings.toLocaleString()} <span>/mo</span>`;
  document.getElementById('v-return').innerHTML    = `${returnRate.toFixed(1)}% <span>/yr</span>`;
  document.getElementById('v-current').textContent = `$${current.toLocaleString()}`;
  document.getElementById('v-inflation').innerHTML = `${inflation.toFixed(1)}% <span>/yr</span>`;
  document.getElementById('v-raise').innerHTML     = `+${raise.toFixed(1)}% <span>/yr</span>`;
  document.getElementById('v-debt').textContent    = `$${debt.toLocaleString()}`;
  document.getElementById('v-payment').innerHTML   = `$${payment.toLocaleString()} <span>/mo</span>`;
  document.getElementById('v-interest').innerHTML  = `${interest.toFixed(1)}% <span>/yr profit</span>`;
}

/** Update the five KPI cards at the top */
function updateKPIs() {
  const finalSav = calcFinalSavings();
  const fireNum  = calcFire();
  const fireYear = calcFireYear();
  const { months: debtMonths } = calcDebtPayoff();

  // KPI 1 — Projected Savings (after Zakat)
  document.getElementById('kpi-savings').textContent     = fmt(finalSav);
  document.getElementById('kpi-savings-sub').textContent = `in ${S.horizon} yrs @ ${S.returnRate}% profit rate`;

  // KPI 2 — Debt-Free Date
  if (debtMonths === Infinity) {
    document.getElementById('kpi-debtfree').textContent     = 'Never';
    document.getElementById('kpi-debtfree-sub').textContent = 'Payment too low';
  } else {
    const saved = calcFinancingCostSaved();
    document.getElementById('kpi-debtfree').textContent     = monthToDate(debtMonths);
    document.getElementById('kpi-debtfree-sub').textContent = `saves ${fmt(saved)} in financing cost`;
  }

  // KPI 3 — Retirement ready year
  document.getElementById('kpi-retire').textContent     = fireYear ? fireYear : '50+ yrs';
  document.getElementById('kpi-retire-sub').textContent = 'at 4% withdrawal rate';

  // KPI 4 — FIRE Number
  document.getElementById('kpi-fire').textContent     = fmt(fireNum);
  document.getElementById('kpi-fire-sub').textContent = '25× annual expenses';

  // KPI 5 — Annual Zakat Due
  const zakatDue = calcZakat();
  document.getElementById('kpi-emerg').textContent     = zakatDue > 0 ? fmt(zakatDue) : '$0 (Below Nisab)';
  document.getElementById('kpi-emerg-sub').textContent = zakatDue > 0
    ? `2.5% on savings above ${fmt(NISAB)} nisab`
    : `Nisab threshold: ${fmt(NISAB)}`;
}

/** Savings tab right panel */
function updateSavingsPanel() {
  const finalSav = calcFinalSavings();
  const contribs = calcContributions() + S.current;
  const returns  = finalSav - contribs;
  const fireNum  = calcFire();
  const firePct  = Math.min(100, Math.round((finalSav / fireNum) * 100));
  const realVal  = finalSav / Math.pow(1 + S.inflation / 100, S.horizon);
  const zakatNow = calcZakat();

  document.getElementById('rp-total10').textContent     = fmt(finalSav);
  document.getElementById('rp-total10-sub').textContent = `+${fmt(Math.max(0, returns))} from returns`;
  document.getElementById('pf-total10').style.width     = Math.min(95, Math.round(finalSav / (fireNum * 1.2) * 100)) + '%';

  document.getElementById('rp-interest').textContent     = fmt(Math.max(0, returns));
  document.getElementById('rp-interest-sub').textContent = `vs ${fmt(contribs)} contributed (halal profit)`;
  document.getElementById('pf-interest').style.width     = Math.min(95, Math.round((returns / finalSav) * 100)) + '%';

  document.getElementById('rp-fire-pct').textContent = `${firePct}%`;
  document.getElementById('rp-fire-sub').textContent  = `${fmt(finalSav)} of ${fmt(fireNum)} target`;
  document.getElementById('pf-fire').style.width      = firePct + '%';

  document.getElementById('rp-real').textContent     = fmt(realVal);
  document.getElementById('rp-real-sub').textContent = 'purchasing power today';
  document.getElementById('pf-real').style.width     = Math.min(95, Math.round((realVal / fireNum) * 100)) + '%';

  if (document.getElementById('rp-zakat')) {
    document.getElementById('rp-zakat').textContent     = zakatNow > 0 ? fmt(zakatNow) : 'Below Nisab';
    document.getElementById('rp-zakat-sub').textContent = zakatNow > 0
      ? `2.5% on savings above ${fmt(NISAB)} nisab`
      : `Savings below ${fmt(NISAB)} nisab — no Zakat yet`;
    document.getElementById('pf-zakat').style.width     = Math.min(95, Math.round((zakatNow / finalSav) * 200)) + '%';
  }

  buildSavingsMilestones(finalSav, fireNum);
}

/**
 * Generate halal savings milestones: Nisab, $50K, $100K, $250K, Freedom Goal.
 */
function buildSavingsMilestones(finalVal, fireNum) {
  const milestones = [
    { label: `Nisab (🌙 ${fmt(NISAB)})`, target: NISAB,   dot: '#10b981' },
    { label: '$50K',                      target: 50000,   dot: '#38bdf8' },
    { label: '$100K',                     target: 100000,  dot: '#818cf8' },
    { label: '$250K',                     target: 250000,  dot: '#f59e0b' },
    { label: 'Freedom Goal',              target: fireNum, dot: '#fb923c' },
  ];

  const { savings: mo, returnRate: r, current: init, raise } = S;
  const mRate = r / 100 / 12;
  const rFac  = 1 + raise / 100;

  const found = {};
  let val = init, moSav = mo, months = 0;
  while (months <= S.horizon * 12 + 1 && Object.keys(found).length < milestones.length) {
    milestones.forEach(ms => {
      if (!found[ms.label] && val >= ms.target) found[ms.label] = months;
    });
    val = val + moSav + val * mRate;
    if (months % 12 === 0) moSav *= rFac;
    months++;
  }

  const list = document.getElementById('ms-list');
  list.innerHTML = milestones.map(ms => {
    const date = found[ms.label]
      ? monthToDate(found[ms.label])
      : (finalVal >= ms.target ? 'Reached' : 'Beyond horizon');
    return `
      <div class="ms-item">
        <div class="ms-dot" style="background:${ms.dot}"></div>
        <div class="ms-text">${ms.label}</div>
        <div class="ms-year">${date}</div>
      </div>`;
  }).join('');
}

/** Debt tab right panel */
function updateDebtPanel() {
  const { months, totalInterest } = calcDebtPayoff();
  const saved = calcFinancingCostSaved();

  if (months === Infinity) {
    document.getElementById('ds-date').textContent     = 'Never';
    document.getElementById('ds-months').textContent   = 'Increase payment';
    document.getElementById('ds-interest').textContent = '—';
    document.getElementById('ds-isaved').textContent   = '—';
  } else {
    document.getElementById('ds-date').textContent     = monthToDate(months);
    document.getElementById('ds-months').textContent   = `${months} months`;
    document.getElementById('ds-interest').textContent = fmt(totalInterest); // Total Financing Cost
    document.getElementById('ds-isaved').textContent   = fmt(saved);         // Financing Cost Saved
  }
  document.getElementById('ds-after').textContent = `+${fmt(S.payment)}`;

  const totalBal = DEBTS.reduce((s, d) => s + d.balance, 0);
  document.getElementById('debt-items-list').innerHTML = DEBTS.map(d => `
    <div class="di">
      <div class="di-icon" style="background:rgba(${d.colorRgb},0.12);color:${d.color};">${d.icon}</div>
      <div class="di-info">
        <div class="di-name">${d.name}</div>
        <div class="di-rate">${d.rate > 0 ? d.rate + '% Profit Rate' : '0% — Qard Hasan'}</div>
      </div>
      <div class="di-amt" style="color:${d.color};">${fmt(d.balance)}</div>
      <div class="di-bar-wrap">
        <div class="di-pct">${Math.round(d.balance / totalBal * 100)}%</div>
        <div class="di-bar-t"><div class="di-bar-f" style="background:${d.color};width:${Math.round(d.balance / totalBal * 100)}%"></div></div>
      </div>
    </div>`).join('');

  buildDebtMilestones();
}

/** Generate debt payoff milestones (25%, 50%, 75%, 100% paid off) */
function buildDebtMilestones() {
  const { debt, payment: pmt, interest: irate } = S;
  const monthly     = irate / 100 / 12;
  const checkpoints = [25, 50, 75, 100];
  const found       = {};
  let bal = debt, months = 0;

  while (bal > 0.01 && months < 600) {
    months++;
    const ic = bal * monthly;
    bal = Math.max(0, bal + ic - pmt);
    checkpoints.forEach(pct => {
      if (!found[pct] && bal <= debt * (1 - pct / 100)) found[pct] = months;
    });
  }

  const colors = { 25: '#38bdf8', 50: '#f59e0b', 75: '#fb923c', 100: '#10b981' };

  document.getElementById('debt-ms-list').innerHTML = checkpoints.map(pct => `
    <div class="ms-item">
      <div class="ms-dot" style="background:${colors[pct]}"></div>
      <div class="ms-text" style="color:${colors[pct]}">${pct}% paid off</div>
      <div class="ms-year">${found[pct] ? monthToDate(found[pct]) : '—'}</div>
    </div>`).join('');
}

/** Render What-If scenario cards and summary cards */
function buildWhatif() {
  const colorMap = {
    green: 'var(--success)', cyan: 'var(--cyan)', mint: 'var(--mint)',
    rose: 'var(--error)', violet: 'var(--violet)', gold: 'var(--gold)',
  };

  document.getElementById('whatif-grid').innerHTML = WHATIF_SCENARIOS.map(sc => `
    <div class="wi-card ${S.whatifSel.includes(sc.id) ? 'selected' : ''}" onclick="toggleWhatif('${sc.id}')">
      <div class="wi-icon">${sc.icon}</div>
      <div class="wi-name">${sc.name}</div>
      <div class="wi-desc">${sc.desc}</div>
      <div class="wi-impact" style="color:${colorMap[sc.color]}">
        <i class="fa-solid ${sc.delta >= 0 ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'}"></i>
        ${sc.impact}
      </div>
    </div>`).join('');

  const selected    = WHATIF_SCENARIOS.filter(sc => S.whatifSel.includes(sc.id));
  const netGain     = selected.reduce((s, sc) => s + sc.delta, 0);
  const fireYrDelta = selected.reduce((s, sc) => s + sc.fireYrs, 0);

  const gainEl = document.getElementById('wi-netgain');
  gainEl.textContent = (netGain >= 0 ? '+' : '') + fmt(Math.abs(netGain));
  gainEl.style.color = netGain >= 0 ? 'var(--success)' : 'var(--error)';
  document.getElementById('wi-netgain-sub').textContent = `vs base case over ${S.horizon} years`;

  const deltaEl = document.getElementById('wi-fire-delta');
  deltaEl.textContent = (fireYrDelta >= 0 ? '+' : '') + fireYrDelta.toFixed(1) + ' yrs';
  deltaEl.style.color = fireYrDelta <= 0 ? 'var(--success)' : 'var(--error)';
  document.getElementById('wi-fire-sub').textContent = fireYrDelta <= 0 ? 'earlier retirement' : 'later retirement';

  const recs = selected.length === 0
    ? [{ icon: '💡', text: 'Select scenarios above to see combined impact', color: 'var(--text-500)' }]
    : selected.map(sc => ({ icon: sc.icon, text: `${sc.name}: ${sc.desc}`, color: 'var(--cyan)' }));

  document.getElementById('wi-recs').innerHTML = recs.map(r => `
    <div class="ms-item">
      <div style="font-size:13px;flex-shrink:0;">${r.icon}</div>
      <div class="ms-text" style="color:${r.color};font-size:10.5px;">${r.text}</div>
    </div>`).join('');
}

/* ═══════════════════════════════════════════════════════════════
   EVENT HANDLERS
═══════════════════════════════════════════════════════════════ */

/** Called by every range slider's oninput event */
function onInput() {
  S.savings    = +document.getElementById('s-savings').value;
  S.returnRate = +document.getElementById('s-return').value;
  S.current    = +document.getElementById('s-current').value;
  S.inflation  = +document.getElementById('s-inflation').value;
  S.raise      = +document.getElementById('s-raise').value;
  S.debt       = +document.getElementById('s-debt').value;
  S.payment    = +document.getElementById('s-payment').value;
  S.interest   = +document.getElementById('s-interest').value;
  updateUI();
}

/** Switch between Savings / Debt / What-If tabs */
function switchTab(tab) {
  S.tab = tab;

  ['savings', 'debt', 'whatif'].forEach(t => {
    document.getElementById('tab-' + t).classList.toggle('active', t === tab);
  });

  document.getElementById('rp-savings').style.display = tab === 'savings' ? 'contents' : 'none';

  const rpDebt   = document.getElementById('rp-debt');
  const rpWhatif = document.getElementById('rp-whatif');
  rpDebt.style.display   = tab === 'debt'   ? 'flex' : 'none';
  rpWhatif.style.display = tab === 'whatif' ? 'flex' : 'none';

  const titles = { savings: 'Savings Growth Forecast', debt: 'Debt Payoff Projection', whatif: 'What-If Scenario Analysis' };
  document.getElementById('chart-title').textContent = titles[tab];

  updateChart();
  if (tab === 'savings') updateSavingsPanel();
  if (tab === 'debt')    updateDebtPanel();
  if (tab === 'whatif')  buildWhatif();
}

/** Cycle active scenario (Base / Bull / Bear / All) */
function setScenario(sc) {
  S.scenario = sc;
  ['base', 'bull', 'bear', 'all'].forEach(id => {
    const el = document.getElementById('sc-' + id);
    el.classList.remove('active', 'sc-bull', 'sc-bear');
    if (id === 'bull') el.classList.add('sc-bull');
    if (id === 'bear') el.classList.add('sc-bear');
    if (id === sc) el.classList.add('active');
  });
  updateChart();
}

/** Update time horizon from the topbar select */
function onHorizonChange() {
  S.horizon = +document.getElementById('horizon-sel').value;
  document.getElementById('chart-badge').textContent = `${S.horizon}-Year Projection`;
  updateUI();
  showToast(`📅 Horizon set to ${S.horizon} years`);
}

/** Toggle a What-If scenario on/off */
function toggleWhatif(id) {
  const idx = S.whatifSel.indexOf(id);
  if (idx === -1) S.whatifSel.push(id);
  else S.whatifSel.splice(idx, 1);
  buildWhatif();
  updateChart();
}

/**
 * "Run Full Simulation" button handler.
 * Animates the icon, re-runs calculations, pulses KPI cards.
 */
function runSimulation() {
  const icon = document.getElementById('run-icon');
  icon.classList.add('spinning');
  onInput();
  setTimeout(() => {
    icon.classList.remove('spinning');
    document.querySelectorAll('.kpi').forEach(el => {
      el.classList.remove('pulse');
      void el.offsetWidth;
      el.classList.add('pulse');
    });
    showToast('🚀 Simulation complete!');
  }, 750);
}

/** Export placeholder — notify user */
function exportSim() {
  showToast('📄 Exporting projection report…');
}

/* ═══════════════════════════════════════════════════════════════
   TOAST NOTIFICATION
═══════════════════════════════════════════════════════════════ */
let toastTimer;

function showToast(msg) {
  clearTimeout(toastTimer);
  const toast = document.getElementById('toast');
  document.getElementById('toast-msg').textContent = msg;
  toast.classList.add('show');
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

/* ═══════════════════════════════════════════════════════════════
   SIDEBAR TOGGLE (mobile)
═══════════════════════════════════════════════════════════════ */
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('show');
}

/* ═══════════════════════════════════════════════════════════════
   SIDEBAR PROFILE
═══════════════════════════════════════════════════════════════ */
function renderProfile(user) {
  const nameEl   = document.querySelector('.profile-name');
  const avatarEl = document.querySelector('.profile-avatar');

  if (user && user.full_name) {
    const initials = user.full_name
      .split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

    if (nameEl)   nameEl.textContent   = user.full_name;
    if (avatarEl) avatarEl.textContent = initials;

    const topbarAvatar   = document.getElementById('topbar-avatar');
    const topbarUsername = document.getElementById('topbar-username');
    if (topbarAvatar)   topbarAvatar.textContent   = initials;
    if (topbarUsername) topbarUsername.textContent = user.full_name.split(' ')[0];
  } else {
    if (nameEl)   nameEl.textContent   = 'Guest';
    if (avatarEl) avatarEl.textContent = '?';
    const topbarAvatar   = document.getElementById('topbar-avatar');
    const topbarUsername = document.getElementById('topbar-username');
    if (topbarAvatar)   topbarAvatar.textContent   = '?';
    if (topbarUsername) topbarUsername.textContent = 'Guest';
  }
}

/* ═══════════════════════════════════════════════════════════════
   PARTICLE CANVAS BACKGROUND
═══════════════════════════════════════════════════════════════ */
function initParticles() {
  const cv = document.getElementById('particle-canvas');
  const cx = cv.getContext('2d');
  let W = cv.width  = window.innerWidth;
  let H = cv.height = window.innerHeight;

  const pts = Array.from({ length: 55 }, () => ({
    x:  Math.random() * W,
    y:  Math.random() * H,
    r:  Math.random() * 1.1 + 0.3,
    vx: (Math.random() - 0.5) * 0.22,
    vy: (Math.random() - 0.5) * 0.22,
    a:  Math.random() * 0.4 + 0.08,
  }));

  (function frame() {
    cx.clearRect(0, 0, W, H);
    pts.forEach(p => {
      cx.beginPath();
      cx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      cx.fillStyle = `rgba(56,189,248,${p.a})`;
      cx.fill();
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0)  p.x = W;
      if (p.x > W)  p.x = 0;
      if (p.y < 0)  p.y = H;
      if (p.y > H)  p.y = 0;
    });
    requestAnimationFrame(frame);
  })();

  window.addEventListener('resize', () => {
    W = cv.width  = window.innerWidth;
    H = cv.height = window.innerHeight;
  });
}

/* ═══════════════════════════════════════════════════════════════
   INITIALISATION  (single DOMContentLoaded — no duplicates)
═══════════════════════════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', async () => {
  // Guard: no token → redirect to login
  const token = localStorage.getItem('finsphere_token');
  if (!token) { window.location.href = 'login.html'; return; }

  // Fetch fresh user for sidebar profile
  let user = null;
  try {
    const res = await fetch('http://localhost:3000/api/auth/me', {
      headers: { Authorization: 'Bearer ' + token },
    });
    if (res.ok) user = await res.json();
  } catch (_) {}

  if (!user) user = { full_name: 'Guest' };
  renderProfile(user);

  // Boot simulator
  initParticles();
  initChart();
  updateUI();

  // Animate progress bar fills with a short delay so CSS transition plays
  setTimeout(() => {
    document.querySelectorAll('.proj-fill, .di-bar-f').forEach(el => {
      const target = el.style.width;
      el.style.width = '0';
      setTimeout(() => { el.style.width = target; }, 60);
    });
  }, 350);
});

window.addEventListener('pageshow', e => {
  if (e.persisted) document.body.classList.remove('page-exit');
});