'use strict';

/* ════════════════════════════════════════════════════════════════
   CONFIG — fix port to match your server.js
════════════════════════════════════════════════════════════════ */
const API = 'http://localhost:3000/api';

/* ── Token helper ───────────────────────────────────────────────── */
const getToken = () => localStorage.getItem('finsphere_token');

/* ── Auth guard (soft — won't redirect if no token, API calls handle it) ── */

/* Page transitions handled by nav-transition.js */

/* toggleSidebar is defined in nav-transition.js */

/* ════════════════════════════════════════════════════════════════
   NAV ACTIVE STATE
════════════════════════════════════════════════════════════════ */
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', function () {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    this.classList.add('active');
  });
});

/* ════════════════════════════════════════════════════════════════
   PARTICLE CANVAS
════════════════════════════════════════════════════════════════ */
(function initCanvas() {
  const canvas = document.getElementById('particle-canvas');
  if (!canvas) return;
  const ctx    = canvas.getContext('2d');
  let W, H, particles;
  const COUNT    = 50;
  const MAX_DIST = 120;
  const COLORS   = ['rgba(56,189,248,', 'rgba(129,140,248,', 'rgba(245,158,11,'];

  function randomColor() {
    const i = Math.random() < 0.12 ? 2 : (Math.random() < 0.5 ? 0 : 1);
    return COLORS[i];
  }
  function resize() { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; }
  function makeParticle() {
    return { x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3, r: Math.random() * 1.4 + 0.4, color: randomColor(), pulse: Math.random() * Math.PI * 2 };
  }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.pulse += 0.02;
      if (p.x < -10) p.x = W + 10; if (p.x > W + 10) p.x = -10;
      if (p.y < -10) p.y = H + 10; if (p.y > H + 10) p.y = -10;
      const a = 0.45 + Math.sin(p.pulse) * 0.2;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color + a + ')'; ctx.fill();
    });
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const a = particles[i], b = particles[j];
        const dx = a.x - b.x, dy = a.y - b.y, d = Math.sqrt(dx * dx + dy * dy);
        if (d < MAX_DIST) {
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = `rgba(56,189,248,${(1 - d / MAX_DIST) * 0.15})`; ctx.lineWidth = 0.5; ctx.stroke();
        }
      }
    }
    requestAnimationFrame(draw);
  }
  window.addEventListener('resize', resize);
  resize();
  particles = Array.from({ length: COUNT }, makeParticle);
  draw();
})();

/* ════════════════════════════════════════════════════════════════
   API LAYER
════════════════════════════════════════════════════════════════ */
async function apiFetch(path) {
  const token = getToken();
  if (!token) { window.location.href = 'login.html'; return null; }

  const res = await fetch(API + path, {
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${token}`,
    },
  });

  if (res.status === 401) { window.location.href = 'login.html'; return null; }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
  return res.json();
}

/* ════════════════════════════════════════════════════════════════
   HELPERS
════════════════════════════════════════════════════════════════ */
const fmt = (n, d = 2) =>
  parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

/* Today's date string e.g. "Tuesday, May 3, 2026" */
function todayString() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

/* Category → icon/color map */
const CAT = {
  salary:     { bg: 'rgba(56,189,248,0.1)',  clr: 'var(--cyan)',    icon: '💰' },
  freelance:  { bg: 'rgba(56,189,248,0.1)',  clr: 'var(--cyan)',    icon: '🎓' },
  investment: { bg: 'rgba(16,185,129,0.1)',  clr: 'var(--success)', icon: '📈' },
  food:       { bg: 'rgba(245,158,11,0.1)',  clr: 'var(--gold)',    icon: '☕' },
  transport:  { bg: 'rgba(129,140,248,0.1)', clr: 'var(--violet)',  icon: '🚗' },
  shopping:   { bg: 'rgba(239,68,68,0.1)',   clr: '#ef4444',        icon: '🛒' },
  health:     { bg: 'rgba(16,185,129,0.1)',  clr: 'var(--success)', icon: '🏥' },
  utilities:  { bg: 'rgba(245,158,11,0.1)',  clr: 'var(--gold)',    icon: '🔌' },
  entertain:  { bg: 'rgba(129,140,248,0.1)', clr: 'var(--violet)',  icon: '🎬' },
  travel:     { bg: 'rgba(129,140,248,0.1)', clr: 'var(--violet)',  icon: '✈️' },
  other:      { bg: 'rgba(120,155,195,0.1)', clr: '#789bc3',        icon: '💳' },
};

/* Budget bar color based on usage % */
function budgetBarColor(pct) {
  if (pct >= 90) return 'linear-gradient(90deg,var(--error),#f97316)';
  if (pct >= 70) return 'linear-gradient(90deg,var(--warning),var(--gold))';
  return 'linear-gradient(90deg,var(--success),var(--cyan))';
}

/* Budget icon map */
const BUDGET_ICONS = {
  food:        { icon: '🍔', bg: 'rgba(239,68,68,0.12)',   clr: '#ef4444'       },
  housing:     { icon: '🏠', bg: 'rgba(56,189,248,0.12)',  clr: 'var(--cyan)'   },
  transport:   { icon: '🚗', bg: 'rgba(129,140,248,0.12)', clr: 'var(--violet)' },
  health:      { icon: '💊', bg: 'rgba(16,185,129,0.12)',  clr: 'var(--success)'},
  entertain:   { icon: '🎭', bg: 'rgba(245,158,11,0.12)',  clr: 'var(--gold)'   },
  subscriptions:{ icon: '📱', bg: 'rgba(56,189,248,0.12)', clr: 'var(--cyan)'   },
  default:     { icon: '💳', bg: 'rgba(120,155,195,0.12)', clr: '#789bc3'       },
};

/* Health metric config — exact same keys as health.js DATA.healthScore */
const HEALTH_METRICS = [
  { key: 'savingsScore', label: 'Savings Rate',   icon: 'fa-piggy-bank', color: 'var(--success)', bg: 'rgba(16,185,129,0.1)'  },
  { key: 'budgetScore',  label: 'Budget Control', icon: 'fa-credit-card',color: 'var(--cyan)',    bg: 'rgba(56,189,248,0.1)'  },
  { key: 'efScore',      label: 'Emergency Fund', icon: 'fa-shield',     color: 'var(--gold)',    bg: 'rgba(245,158,11,0.1)'  },
  { key: 'goalScore',    label: 'Goal Progress',  icon: 'fa-chart-pie',  color: 'var(--violet)',  bg: 'rgba(129,140,248,0.1)' },
];

/* ════════════════════════════════════════════════════════════════
   RENDER — GREETING + DATE
════════════════════════════════════════════════════════════════ */
function renderGreeting(user) {
  const hour      = new Date().getHours();
  const greet     = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = user ? user.full_name.split(' ')[0] : 'there';

  /* Update greeting name span */
  const nameSpan = document.getElementById('greeting-name');
  if (nameSpan) nameSpan.textContent = firstName;

  /* Update greeting h2 prefix (Good morning / afternoon / evening) */
  const h2 = document.querySelector('.greeting h2');
  if (h2) {
    /* Preserve the <em> tag — only replace the text node before it */
    const textNode = [...h2.childNodes].find(n => n.nodeType === Node.TEXT_NODE);
    if (textNode) textNode.textContent = `${greet}, `;
  }

  /* Update date line */
  const dateEl = document.getElementById('greeting-date');
  if (dateEl) dateEl.textContent = `Here's what's happening with your finances today — ${todayString()}.`;
}

/* ════════════════════════════════════════════════════════════════
   RENDER — STAT CARDS (balance, income, expenses, savings rate)
════════════════════════════════════════════════════════════════ */
function renderStats(d) {
  const { totalBalance, currentMonth: cur, previousMonth: prev, healthScore } = d;

  /* ── Total balance ── */
  const balEl = document.querySelector('.balance-amount');
  if (balEl) {
    const whole = Math.floor(Math.abs(totalBalance));
    const cents = fmt(Math.abs(totalBalance) - whole, 2);
    const sign  = totalBalance < 0 ? '-' : '';
    balEl.innerHTML = `<span>${sign}$${fmt(whole, 0)}</span>.${cents.split('.')[1] || '00'}`;
  }

  /* ── Balance trend ── */
  const trendEl = document.querySelector('.balance-trend');
  if (trendEl) {
    const up = cur.saved >= 0;
    trendEl.innerHTML =
      `<i class="fa-solid fa-arrow-trend-${up ? 'up' : 'down'}"></i>
       ${up ? '+' : '-'}$${fmt(Math.abs(cur.saved), 0)} this month`;
    trendEl.style.color = up ? 'var(--success)' : 'var(--error)';
  }

  /* ── Balance card badge (% change vs prev month net) ── */
  const balBadge = document.querySelector('.balance-card .card-badge');
  if (balBadge && prev.income) {
    const prevNet = prev.income - prev.expenses;
    const curNet  = cur.saved;
    if (prevNet !== 0) {
      const pct = (((curNet - prevNet) / Math.abs(prevNet)) * 100).toFixed(1);
      balBadge.textContent = `${pct >= 0 ? '↑' : '↓'} ${Math.abs(pct)}%`;
      balBadge.className   = `card-badge ${pct >= 0 ? 'badge-up' : 'badge-down'}`;
    }
  }

  /* ── Income ── */
  const incValEl = document.querySelector('.stat-mini-val.income');
  if (incValEl) incValEl.textContent = `$${fmt(cur.income, 0)}`;

  const statMinis = document.querySelectorAll('.stat-mini');

  const incBadge = statMinis[0]?.querySelector('.card-badge');
  if (incBadge && prev.income) {
    const pct = prev.income
      ? (((cur.income - prev.income) / prev.income) * 100).toFixed(1)
      : 0;
    incBadge.textContent = `${pct >= 0 ? '↑' : '↓'} ${Math.abs(pct)}%`;
    incBadge.className   = `card-badge ${pct >= 0 ? 'badge-up' : 'badge-down'}`;
  }
  const incSub = statMinis[0]?.querySelector('.stat-mini-sub');
  if (incSub) incSub.textContent = `vs $${fmt(prev.income, 0)} last month`;

  /* ── Expenses ── */
  const expValEl = document.querySelector('.stat-mini-val.expense');
  if (expValEl) expValEl.textContent = `$${fmt(cur.expenses, 0)}`;

  const expBadge = statMinis[1]?.querySelector('.card-badge');
  if (expBadge && prev.expenses) {
    const pct = prev.expenses
      ? (((cur.expenses - prev.expenses) / prev.expenses) * 100).toFixed(1)
      : 0;
    expBadge.textContent = `${pct >= 0 ? '↑' : '↓'} ${Math.abs(pct)}%`;
    expBadge.className   = `card-badge ${pct >= 0 ? 'badge-down' : 'badge-up'}`;
  }
  const expSub = statMinis[1]?.querySelector('.stat-mini-sub');
  if (expSub) expSub.textContent = `vs $${fmt(prev.expenses, 0)} last month`;

  /* ── Savings rate ── */
  const savValEl = document.querySelector('.stat-mini-val.savings');
  if (savValEl) savValEl.textContent = `${cur.savingsRate}%`;

  const savBadge = statMinis[2]?.querySelector('.card-badge');
  if (savBadge) {
    const label = cur.savingsRate >= 30 ? 'Great' : cur.savingsRate >= 15 ? 'Fair' : 'Low';
    savBadge.textContent = label;
    savBadge.className   = `card-badge ${cur.savingsRate >= 20 ? 'badge-up' : 'badge-down'}`;
  }
  const savSub = statMinis[2]?.querySelector('.stat-mini-sub');
  if (savSub) savSub.textContent = `$${fmt(cur.saved, 0)} saved this month`;

  /* ── Health gauge score label ── */
  const gaugeEl = document.querySelector('.gauge-score');
  if (gaugeEl) gaugeEl.textContent = (healthScore && healthScore.score != null) ? healthScore.score : healthScore;
}

/* ════════════════════════════════════════════════════════════════
   RENDER — HEALTH METRICS (bars inside health card)
════════════════════════════════════════════════════════════════ */
function renderHealthMetrics(d) {
  /* Use the EXACT same data.healthScore object that health.js uses —
     { score, savingsScore, budgetScore, efScore, goalScore }
     This guarantees dashboard and health page always show identical values. */
  const hs = d.healthScore || {};
  const { score = 0, savingsScore = 0, budgetScore = 0, efScore = 0, goalScore = 0 } = hs;

  const metricsWrap = document.querySelector('.health-metrics');
  if (!metricsWrap) return;

  const values = { savingsScore, budgetScore, efScore, goalScore };

  metricsWrap.innerHTML = HEALTH_METRICS.map(m => {
    const val = Math.round(values[m.key] || 0);
    return `
      <div class="health-metric">
        <div class="hm-icon" style="background:${m.bg};color:${m.color};">
          <i class="fa-solid ${m.icon}"></i>
        </div>
        <div class="hm-info">
          <div class="hm-label">${m.label}</div>
          <div class="hm-bar-track">
            <div class="hm-bar-fill" style="width:${val}%;background:${m.color};transition:width 0.8s ease;"></div>
          </div>
        </div>
        <span class="hm-val" style="color:${m.color};">${val}%</span>
      </div>`;
  }).join('');

  /* ── Tips — same logic as health.js ── */
  const tipsWrap = document.querySelector('.health-tips');
  if (!tipsWrap) return;

  const efMonths = d.healthDetails?.efMonths;
  const tips = [];

  if (efScore < 100)
    tips.push({ icon: 'fa-circle-check', color: 'var(--success)',
      text: `Emergency fund covers ${efMonths != null ? efMonths.toFixed(1) : '?'} months — keep building to reach 6 months.` });
  if (budgetScore < 50)
    tips.push({ icon: 'fa-triangle-exclamation', color: 'var(--warning)',
      text: `Budget control is at ${Math.round(budgetScore)}%. Review your spending categories.` });
  if (savingsScore < 20)
    tips.push({ icon: 'fa-triangle-exclamation', color: 'var(--warning)',
      text: `Savings rate is low. Aim for at least 20% to improve your health score.` });
  if (tips.length === 0)
    tips.push({ icon: 'fa-circle-check', color: 'var(--success)',
      text: `Excellent financial health! Score: ${score}/100. Keep it up.` });

  tipsWrap.innerHTML = tips.slice(0, 2).map(t => `
    <div class="health-tip">
      <i class="fa-solid ${t.icon}" style="color:${t.color};"></i>
      ${t.text}
    </div>`).join('');
}

/* ════════════════════════════════════════════════════════════════
   RENDER — BUDGET BARS
════════════════════════════════════════════════════════════════ */
function renderBudgets(budgets) {
  /* budgets is an array from /api/budgets or embedded in summary */
  const wrap = document.querySelector('.budget-card > div[style]');
  if (!wrap) return;

  if (!budgets || budgets.length === 0) {
    wrap.innerHTML = `<p style="color:var(--text-500);font-size:12px;text-align:center;padding:20px 0;">No budgets set up yet. <a href="budgets.html" style="color:var(--cyan);">Add one →</a></p>`;
    return;
  }

  wrap.innerHTML = budgets.map(b => {
    const pct  = b.limit > 0 ? Math.min(100, Math.round((b.spent / b.limit) * 100)) : 0;
    const meta = BUDGET_ICONS[b.category?.toLowerCase()] || BUDGET_ICONS.default;
    const warn = pct >= 90 ? ` <span style="color:var(--error);font-size:10px;">▲</span>`
               : pct >= 70 ? ` <span style="color:var(--warning);font-size:10px;">▲</span>` : '';
    return `
      <div class="budget-item">
        <div class="budget-label-row">
          <div class="budget-name">
            <div class="budget-icon" style="background:${meta.bg};color:${meta.clr};">${meta.icon}</div>
            ${b.name || b.category}
          </div>
          <span class="budget-pct">${pct}%${warn}</span>
        </div>
        <div class="budget-bar-track">
          <div class="budget-bar-fill" style="width:${pct}%;background:${budgetBarColor(pct)};transition:width 0.8s ease;"></div>
        </div>
      </div>`;
  }).join('');
}

/* ════════════════════════════════════════════════════════════════
   RENDER — RECENT TRANSACTIONS
════════════════════════════════════════════════════════════════ */
function renderTransactions(txns) {
  const wrap = document.querySelector('.txn-card > div[style]');
  if (!wrap) return;

  if (!txns || txns.length === 0) {
    wrap.innerHTML = `<p style="color:var(--text-500);font-size:12px;text-align:center;padding:20px 0;">No transactions yet.</p>`;
    return;
  }

  wrap.innerHTML = txns.map(t => {
    const c       = CAT[t.category?.toLowerCase()] || CAT.other;
    const isInc   = t.type === 'income';
    const dateStr = new Date(t.txn_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const label   = t.category
      ? t.category.charAt(0).toUpperCase() + t.category.slice(1)
      : 'Other';
    return `
      <div class="txn-item">
        <div class="txn-icon" style="background:${c.bg};color:${c.clr};">${c.icon}</div>
        <div class="txn-info">
          <div class="txn-name">${t.merchant || 'Unknown'}</div>
          <div class="txn-cat">${label}</div>
        </div>
        <div>
          <div class="txn-amount ${isInc ? 'pos' : 'neg'}">
            ${isInc ? '+' : '−'}$${fmt(t.amount, 2)}
          </div>
          <div class="txn-date">${dateStr}</div>
        </div>
      </div>`;
  }).join('');
}

/* ════════════════════════════════════════════════════════════════
   RENDER — UPCOMING BILLS
════════════════════════════════════════════════════════════════ */
function renderBills(bills) {
  const wrap = document.querySelector('.bills-list');
  if (!wrap) return;

  if (!bills || bills.length === 0) {
    wrap.innerHTML = `<p style="color:var(--text-500);font-size:12px;text-align:center;padding:20px 0;">No upcoming bills.</p>`;
    return;
  }

  const today = Date.now();
  wrap.innerHTML = bills.map(b => {
    const due    = new Date(b.next_billing);
    const days   = Math.ceil((due - today) / 86_400_000);
    const dueStr = due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const urgStyle = days <= 3
      ? 'background:rgba(244,63,94,0.1);color:var(--error);border:1px solid rgba(244,63,94,0.2)'
      : days <= 7
        ? 'background:rgba(245,158,11,0.1);color:var(--gold);border:1px solid rgba(245,158,11,0.2)'
        : 'background:rgba(16,185,129,0.1);color:var(--success);border:1px solid rgba(16,185,129,0.2)';
    return `
      <div class="bill-item">
        <div class="bill-icon" style="background:rgba(56,189,248,0.08);color:var(--cyan);">
          <i class="fa-solid fa-receipt"></i>
        </div>
        <div class="bill-info">
          <div class="bill-name">${b.name}</div>
          <div class="bill-date">Due ${dueStr}</div>
        </div>
        <div><div class="bill-amount">$${fmt(b.amount)}</div></div>
        <span class="bill-status" style="${urgStyle}">${days}d</span>
      </div>`;
  }).join('');
}

/* ════════════════════════════════════════════════════════════════
   RENDER — SIDEBAR PROFILE
════════════════════════════════════════════════════════════════ */
function renderProfile(user) {
  /* ── Sidebar bottom profile ── */
  const nameEl   = document.querySelector('.profile-name');
  const avatarEl = document.querySelector('.profile-avatar');

  if (user && user.full_name) {
    const initials = user.full_name
      .split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

    if (nameEl)   nameEl.textContent   = user.full_name;
    if (avatarEl) avatarEl.textContent = initials;

    /* ── Topbar user chip (shown on mobile/tablet when sidebar is hidden) ── */
    const topbarAvatar   = document.getElementById('topbar-avatar');
    const topbarUsername = document.getElementById('topbar-username');
    if (topbarAvatar)   topbarAvatar.textContent   = initials;
    if (topbarUsername) topbarUsername.textContent = user.full_name.split(' ')[0]; // first name only
  } else {
    /* Fallback: clear placeholder */
    if (nameEl)   nameEl.textContent   = 'Guest';
    if (avatarEl) avatarEl.textContent = '?';
    const topbarAvatar   = document.getElementById('topbar-avatar');
    const topbarUsername = document.getElementById('topbar-username');
    if (topbarAvatar)   topbarAvatar.textContent   = '?';
    if (topbarUsername) topbarUsername.textContent = 'Guest';
  }
}

/* ════════════════════════════════════════════════════════════════
   CHARTS
════════════════════════════════════════════════════════════════ */
function initCharts(d) {
  if (typeof Chart === 'undefined') {
    console.warn('FinSphere: Chart.js not loaded.');
    return;
  }

  Chart.defaults.color       = 'rgba(120,155,195,0.6)';
  Chart.defaults.font.family = "'Plus Jakarta Sans', system-ui, sans-serif";
  Chart.defaults.font.size   = 11;

  const gridColor = 'rgba(56,189,248,0.06)';

  /* ── Sparkline ── */
  const sparkEl = document.getElementById('sparkline-canvas');
  if (sparkEl && d.sparkline?.length) {
    new Chart(sparkEl.getContext('2d'), {
      type: 'line',
      data: {
        labels:   d.chart.labels,
        datasets: [{
          data:            d.sparkline,
          borderColor:     '#38bdf8',
          borderWidth:     2,
          pointRadius:     0,
          tension:         0.45,
          fill:            true,
          backgroundColor: ctx => {
            const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, 42);
            g.addColorStop(0, 'rgba(56,189,248,0.25)');
            g.addColorStop(1, 'rgba(56,189,248,0)');
            return g;
          },
        }],
      },
      options: {
        plugins:   { legend: { display: false }, tooltip: { enabled: false } },
        scales:    { x: { display: false }, y: { display: false } },
        animation: { duration: 1200 },
      },
    });
  }

  /* ── Income vs Expenses bar chart ── */
  const barEl = document.getElementById('incomeExpenseChart');
  if (barEl && d.chart?.labels?.length) {
    new Chart(barEl.getContext('2d'), {
      type: 'bar',
      data: {
        labels: d.chart.labels,
        datasets: [
          {
            label:           'Income',
            data:            d.chart.income,
            backgroundColor: 'rgba(16,185,129,0.7)',
            borderRadius:    6,
            borderSkipped:   false,
          },
          {
            label:           'Expenses',
            data:            d.chart.expenses,
            backgroundColor: 'rgba(244,63,94,0.65)',
            borderRadius:    6,
            borderSkipped:   false,
          },
          {
            label:                'Net Savings',
            type:                 'line',
            data:                 d.chart.netSavings,
            borderColor:          'rgba(56,189,248,0.6)',
            borderWidth:          2,
            pointRadius:          3,
            pointBackgroundColor: '#38bdf8',
            tension:              0.4,
            fill:                 false,
            yAxisID:              'y',
          },
        ],
      },
      options: {
        responsive:  true,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(6,15,38,0.95)',
            borderColor:     'rgba(56,189,248,0.2)',
            borderWidth:     1,
            titleColor:      '#f0f6ff',
            bodyColor:       'rgba(176,200,230,0.8)',
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: $${ctx.parsed.y.toLocaleString()}`,
            },
          },
        },
        scales: {
          x: { grid: { color: gridColor }, ticks: { color: 'rgba(120,155,195,0.5)' } },
          y: {
            grid:  { color: gridColor },
            ticks: { color: 'rgba(120,155,195,0.5)', callback: v => '$' + v.toLocaleString() },
          },
        },
        animation: { duration: 1000, easing: 'easeOutCubic' },
      },
    });
  }

  /* ── Health Gauge ── */
  const gaugeEl = document.getElementById('gaugeChart');
  if (gaugeEl) {
    const scoreNum = (d.healthScore && d.healthScore.score != null) ? d.healthScore.score : (d.healthScore || 0);
    new Chart(gaugeEl.getContext('2d'), {
      type: 'doughnut',
      data: {
        datasets: [{
          data:            [scoreNum, 100 - scoreNum],
          backgroundColor: [
            ctx => {
              const g = ctx.chart.ctx.createLinearGradient(0, 0, 110, 110);
              g.addColorStop(0, '#38bdf8');
              g.addColorStop(1, '#818cf8');
              return g;
            },
            'rgba(255,255,255,0.04)',
          ],
          borderWidth:  0,
          borderRadius: 6,
          hoverOffset:  0,
        }],
      },
      options: {
        cutout:        '72%',
        rotation:      -100,
        circumference: 200,
        plugins:       { legend: { display: false }, tooltip: { enabled: false } },
        animation:     { animateRotate: true, duration: 1400, easing: 'easeOutCubic' },
      },
    });
  }
}

/* ════════════════════════════════════════════════════════════════
   PENDING TXN BADGE
════════════════════════════════════════════════════════════════ */
async function patchTxnBadge() {
  try {
    const data  = await apiFetch('/transactions?status=pending&limit=1');
    if (!data) return;
    const badge = document.querySelector('a[href="transactions.html"] .nav-badge');
    if (badge) badge.textContent = data.total > 0 ? data.total : '';
  } catch (_) {}
}

/* ════════════════════════════════════════════════════════════════
   MOCK FALLBACK DATA — used when API is unreachable
════════════════════════════════════════════════════════════════ */
const MOCK_DATA = {
  totalBalance: 84230.50,
  healthScore: { score: 78, savingsScore: 85, budgetScore: 75, efScore: 68, goalScore: 72 },
  healthDetails: { efMonths: 3.4 },
  currentMonth: {
    income:      12400,
    expenses:    6870,
    saved:       5530,
    savingsRate: 44.6,
  },
  previousMonth: {
    income:   11480,
    expenses: 6680,
  },
  sparkline: [72000, 74500, 77000, 79200, 81000, 84230],
  chart: {
    labels:     ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'],
    income:     [10800, 11200, 11000, 11480, 11900, 12400],
    expenses:   [6200,  6400,  6900,  6680,  6750,  6870],
    netSavings: [4600,  4800,  4100,  4800,  5150,  5530],
  },
  recentTransactions: [
    { merchant: 'Salary Deposit',    category: 'salary',     type: 'income',  amount: 6200,  txn_date: new Date().toISOString() },
    { merchant: 'Whole Foods Market',category: 'shopping',   type: 'expense', amount: 124.50,txn_date: new Date(Date.now()-86400000).toISOString() },
    { merchant: 'United Airlines',   category: 'travel',     type: 'expense', amount: 340,   txn_date: new Date(Date.now()-172800000).toISOString() },
    { merchant: 'Dividend Payment',  category: 'investment', type: 'income',  amount: 212,   txn_date: new Date(Date.now()-259200000).toISOString() },
    { merchant: 'Starbucks',         category: 'food',       type: 'expense', amount: 18.40, txn_date: new Date(Date.now()-259200000).toISOString() },
    { merchant: 'Freelance Project', category: 'freelance',  type: 'income',  amount: 850,   txn_date: new Date(Date.now()-432000000).toISOString() },
  ],
  upcomingBills: [
    { name: 'Netflix Premium',  amount: 22.99,   next_billing: new Date(Date.now()+172800000).toISOString() },
    { name: 'Electricity Bill', amount: 148.00,  next_billing: new Date(Date.now()+432000000).toISOString() },
    { name: 'Rent Payment',     amount: 2100.00, next_billing: new Date(Date.now()+691200000).toISOString() },
    { name: 'Spotify',          amount: 10.99,   next_billing: new Date(Date.now()+950400000).toISOString() },
  ],
};

const MOCK_BUDGETS = [
  { name: 'Food & Dining',  category: 'food',          limit: 900,  spent: 738  },
  { name: 'Housing',        category: 'housing',       limit: 2200, spent: 2100 },
  { name: 'Transport',      category: 'transport',     limit: 700,  spent: 637  },
  { name: 'Healthcare',     category: 'health',        limit: 500,  spent: 140  },
  { name: 'Entertainment',  category: 'entertain',     limit: 400,  spent: 228  },
  { name: 'Subscriptions',  category: 'subscriptions', limit: 300,  spent: 222  },
];

/* ════════════════════════════════════════════════════════════════
   BOOT — load everything in one API call, fall back to mock
════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {

  /* Fire badge & user info in parallel without blocking main data */
  patchTxnBadge();

  /* ── Try live API first ── */
  const hasToken = !!getToken();

  let data = null;
  let user = null;
  let budgets = null;

  if (hasToken) {
    try {
      try { user = await apiFetch('/auth/me'); } catch (_) {}
      data    = await apiFetch('/dashboard/summary');
      try {
        const bd = await apiFetch('/budgets');
        if (bd) budgets = bd.budgets || bd;
      } catch (_) {}
      /* Fetch /api/health — same endpoint health.js uses — and attach healthScore */
      try {
        const hd = await apiFetch('/health');
        if (hd && hd.healthScore) {
          data.healthScore    = hd.healthScore;   // { score, savingsScore, budgetScore, efScore, goalScore }
          data.healthDetails  = hd.healthDetails || {};
        }
      } catch (_) {}
    } catch (err) {
      console.warn('[FinSphere] API unavailable, using mock data.', err.message);
    }
  }

  /* ── Fall back to mock if API failed or no token ── */
  if (!data) {
    data    = MOCK_DATA;
    budgets = MOCK_BUDGETS;
    console.info('[FinSphere] Rendering with mock data.');
  }

  /* Supply a mock user object when there is no token / API is down */
  if (!user) {
    user = { full_name: 'Muhammad Bin Shahid' };
  }

  renderGreeting(user);
  renderProfile(user);
  renderStats(data);
  renderHealthMetrics(data);
  renderTransactions(data.recentTransactions);
  renderBills(data.upcomingBills);
  initCharts(data);
  if (budgets) renderBudgets(budgets);
});