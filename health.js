/* ================================================================
   FINSPHERE — Financial Health Page Logic
   health.js — API-driven, no mock data
================================================================ */

'use strict';

const API_BASE = 'http://localhost:3000/api';

function getToken() {
  return localStorage.getItem('finsphere_token') || sessionStorage.getItem('finsphere_token');
}
function authHeaders() {
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` };
}

/* ── Live DATA object (filled from API) ─────────────────────────── */
let DATA = null;

/* ── HELPERS ────────────────────────────────────────────────────── */
function fmt(n) {
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function scoreLabel(score) {
  if (score <= 40) return { text: 'Poor',      cls: 'badge-score-poor' };
  if (score <= 70) return { text: 'Average',   cls: 'badge-score-avg'  };
  return                   { text: 'Good',      cls: 'badge-score-good' };
}

function efLabel(months) {
  if (months < 3)  return { text: 'Low Coverage', cls: 'badge-score-poor', color: 'var(--error)',   icon: 'fa-circle-exclamation' };
  if (months < 6)  return { text: 'Moderate',     cls: 'badge-score-avg',  color: 'var(--gold)',    icon: 'fa-circle-half-stroke' };
  return                   { text: 'Strong',       cls: 'badge-score-good', color: 'var(--success)', icon: 'fa-circle-check'       };
}

/* ── DRAW RING CANVAS ───────────────────────────────────────────── */
function drawRing(canvasId, pct, colors, lineWidth = 14) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2;
  const r = (Math.min(W, H) - lineWidth * 2) / 2;

  ctx.clearRect(0, 0, W, H);

  // Track
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = lineWidth;
  ctx.stroke();

  // Fill
  const startAngle = -Math.PI / 2;
  const endAngle   = startAngle + (Math.PI * 2 * Math.min(pct, 1));
  const grad       = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
  if (Array.isArray(colors)) {
    grad.addColorStop(0, colors[0]);
    grad.addColorStop(1, colors[1]);
  }

  ctx.beginPath();
  ctx.arc(cx, cy, r, startAngle, endAngle);
  ctx.strokeStyle = Array.isArray(colors) ? grad : colors;
  ctx.lineWidth   = lineWidth;
  ctx.lineCap     = 'round';
  ctx.stroke();
}

/* ── ANIMATED COUNTER ───────────────────────────────────────────── */
function animateCount(el, start, end, duration, formatFn) {
  const startTime = performance.now();
  function step(now) {
    const elapsed  = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased    = 1 - Math.pow(1 - progress, 3);
    const value    = start + (end - start) * eased;
    el.textContent = formatFn(value);
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* ── RENDER FUNCTIONS ───────────────────────────────────────────── */

function renderHealthScore() {
  const { score, savingsScore, budgetScore, efScore, goalScore } = DATA.healthScore;
  const label = scoreLabel(score);

  const badge = document.getElementById('score-badge');
  badge.textContent = label.text;
  badge.className   = 'card-badge ' + label.cls;

  const numEl = document.getElementById('hs-score-num');
  animateCount(numEl, 0, score, 1200, v => Math.round(v).toString());

  const labelEl = document.getElementById('hs-score-label');
  labelEl.textContent = label.text;
  labelEl.style.color = score > 70 ? 'var(--success)' : score > 40 ? 'var(--gold)' : 'var(--error)';

  setTimeout(() => {
    drawRing('healthRingCanvas', score / 100, ['#38bdf8', '#818cf8'], 14);
  }, 100);

  const factors = [
    { id: 'hf-savings',   valId: 'hfv-savings',   pct: savingsScore },
    { id: 'hf-budget',    valId: 'hfv-budget',    pct: budgetScore  },
    { id: 'hf-emergency', valId: 'hfv-emergency', pct: efScore      },
    { id: 'hf-goals',     valId: 'hfv-goals',     pct: goalScore    },
  ];
  factors.forEach(f => {
    const bar = document.getElementById(f.id);
    const val = document.getElementById(f.valId);
    if (bar) setTimeout(() => { bar.style.width = f.pct.toFixed(0) + '%'; }, 300);
    if (val) val.textContent = Math.round(f.pct) + '%';
  });
}

function renderSummaryCards() {
  const { totalBalance, monthlyIncome, monthlyExpenses, prevExpenses, prevIncome, } = DATA.summary;
  document.getElementById('sm-balance').textContent  = fmt(totalBalance);
  document.getElementById('sm-income').textContent   = fmt(monthlyIncome);
  document.getElementById('sm-expenses').textContent = fmt(monthlyExpenses);
  document.getElementById('sm-income-sub').textContent   = `vs $${fmt(prevIncome, 0)} last month`
  document.getElementById('sm-expenses-sub').textContent = `vs $${fmt(prevExpenses, 0)} last month`
}

function renderSavingsRate() {
  const { monthlyIncome, monthlyExpenses, savingsRate } = DATA.summary;
  const saved = monthlyIncome - monthlyExpenses;

  const pctEl = document.getElementById('srb-percent');
  animateCount(pctEl, 0, savingsRate, 1200, v => v.toFixed(1) + '%');

  const bar = document.getElementById('srb-bar-fill');
  setTimeout(() => { bar.style.width = Math.min(savingsRate, 100).toFixed(1) + '%'; }, 200);

  document.getElementById('srb-saved').textContent = `${fmt(saved)} saved this month`;

  const badge = document.getElementById('sr-badge');
  if (savingsRate >= 30)      { badge.textContent = 'Great'; badge.className = 'card-badge badge-up';   }
  else if (savingsRate >= 15) { badge.textContent = 'Fair';  badge.className = 'card-badge badge-warn'; }
  else                        { badge.textContent = 'Low';   badge.className = 'card-badge badge-down'; }
}

function renderExpenseBreakdown() {
  const items = DATA.expenseBreakdown;
  const total = items.reduce((a, b) => a + b.amount, 0);
  document.getElementById('total-expense-badge').textContent = `${fmt(total)} total`;

  const chart = document.getElementById('eb-chart');
  chart.innerHTML = '';

  if (items.length === 0) {
    chart.innerHTML = '<div style="color:var(--text-500);padding:20px;text-align:center;">No expenses this month.</div>';
    return;
  }

  items.forEach(item => {
    const pct    = (item.amount / total * 100).toFixed(1);
    const barPct = (item.amount / total * 100);
    const el = document.createElement('div');
    el.className = 'eb-item';
    el.innerHTML = `
      <div class="eb-icon" style="background:${item.bg};color:${item.color}">${item.icon}</div>
      <div class="eb-name">${item.name}</div>
      <div class="eb-bar-track">
        <div class="eb-bar-fill" style="background:${item.color};width:0%" data-target="${barPct}"></div>
      </div>
      <div class="eb-amount">${fmt(item.amount)}</div>
      <div class="eb-pct">${pct}%</div>
    `;
    chart.appendChild(el);
  });

  setTimeout(() => {
    chart.querySelectorAll('.eb-bar-fill').forEach(bar => {
      bar.style.width = bar.dataset.target + '%';
    });
  }, 250);
}

function renderBudgetStatus() {
  const list = document.getElementById('bs-list');
  list.innerHTML = '';

  if (DATA.budgets.length === 0) {
    list.innerHTML = '<div style="color:var(--text-500);padding:20px;text-align:center;">No budgets set for this month.</div>';
    document.getElementById('budget-status-badge').textContent = 'No Budgets';
    document.getElementById('budget-status-badge').className   = 'card-badge badge-info';
    return;
  }

  let exceeded = 0;
  DATA.budgets.forEach(b => {
    const pct    = (b.used / b.limit * 100);
    const isOver = b.used > b.limit;
    const isWarn = !isOver && pct >= 80;
    if (isOver) exceeded++;

    let statusCls, statusText;
    if (isOver)       { statusCls = 'bs-status-over'; statusText = 'Over Budget'; }
    else if (isWarn)  { statusCls = 'bs-status-warn'; statusText = 'Near Limit';  }
    else              { statusCls = 'bs-status-ok';   statusText = 'On Track';    }

    const fillColor = isOver ? 'var(--error)' : isWarn ? 'var(--gold)' : b.color;
    const barWidth  = Math.min(pct, 100).toFixed(1);

    const el = document.createElement('div');
    el.className = 'bs-item';
    el.innerHTML = `
      <div class="bs-row">
        <div class="bs-name">
          <div class="bs-icon" style="background:${b.bg};color:${b.color}">${b.icon}</div>
          ${b.name}
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <div class="bs-amounts">
            <span class="bs-used" style="color:${isOver?'var(--error)':b.color}">${fmt(b.used)}</span>
            <span style="color:var(--text-700)">/ ${fmt(b.limit)}</span>
          </div>
          <span class="bs-status-tag ${statusCls}">${statusText}</span>
        </div>
      </div>
      <div class="bs-bar-track">
        <div class="bs-bar-fill" style="background:${fillColor};width:0%" data-target="${barWidth}"></div>
      </div>
    `;
    list.appendChild(el);
  });

  const badge = document.getElementById('budget-status-badge');
  if (exceeded === 0) { badge.textContent = 'All On Track'; badge.className = 'card-badge badge-up';   }
  else                { badge.textContent = `${exceeded} Exceeded`; badge.className = 'card-badge badge-down'; }

  setTimeout(() => {
    list.querySelectorAll('.bs-bar-fill').forEach(bar => {
      bar.style.width = bar.dataset.target + '%';
    });
  }, 250);
}

function renderSavingsGoals() {
  const grid = document.getElementById('sg-grid');
  grid.innerHTML = '';

  if (DATA.savingsGoals.length === 0) {
    grid.innerHTML = '<div style="color:var(--text-500);padding:20px;text-align:center;grid-column:1/-1;">No savings goals yet.</div>';
    document.getElementById('goals-summary-badge').textContent = '0 Goals';
    document.getElementById('goals-summary-badge').className   = 'card-badge badge-info';
    return;
  }

  let completed = 0;
  DATA.savingsGoals.forEach(g => {
    const pct        = Math.min(100, (g.saved / g.target * 100));
    const pctDisplay = pct.toFixed(0);
    if (pct >= 100) completed++;

    const badgeBg    = pct >= 100 ? 'rgba(16,185,129,0.12)' : 'rgba(56,189,248,0.10)';
    const badgeColor = pct >= 100 ? 'var(--success)' : 'var(--cyan)';

    const el = document.createElement('div');
    el.className = 'sg-item';
    el.innerHTML = `
      <div class="sg-icon-row">
        <div class="sg-icon" style="background:${g.bg};color:${g.color}">${g.icon}</div>
        <span class="sg-pct-badge" style="background:${badgeBg};color:${badgeColor};border:1px solid ${badgeColor}30">${pctDisplay}%</span>
      </div>
      <div class="sg-name">${g.name}</div>
      <div class="sg-amounts">
        <span class="sg-saved" style="background:linear-gradient(135deg,${g.color},var(--violet));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">${fmt(g.saved)}</span>
        <span class="sg-target">of ${fmt(g.target)}</span>
      </div>
      <div class="sg-bar-track">
        <div class="sg-bar-fill" style="background:${g.color};width:0%" data-target="${pct.toFixed(1)}"></div>
      </div>
    `;
    grid.appendChild(el);
  });

  const badge = document.getElementById('goals-summary-badge');
  badge.textContent = `${completed} of ${DATA.savingsGoals.length} Complete`;
  badge.className   = 'card-badge ' + (completed > 0 ? 'badge-up' : 'badge-info');

  setTimeout(() => {
    grid.querySelectorAll('.sg-bar-fill').forEach(bar => {
      bar.style.width = bar.dataset.target + '%';
    });
  }, 300);
}

function renderSubscriptions() {
  const subs  = DATA.subscriptions;
  const total = subs.reduce((a, b) => a + b.cost, 0);

  const amountEl = document.getElementById('sub-total-amount');
  animateCount(amountEl, 0, total, 1000, v => '$' + v.toFixed(2));

  const badge      = document.getElementById('sub-badge');
  const warningEl  = document.getElementById('sub-warning');
  const warningText = document.getElementById('sub-warning-text');
  const { monthlyIncome } = DATA.summary;
  const incomeRatio = monthlyIncome > 0 ? (total / monthlyIncome) * 100 : 0;

  if (DATA.leakage.count > 0) {
    badge.textContent = `${DATA.leakage.count} Unused`;
    badge.className   = 'card-badge badge-down';
    warningEl.style.display = 'flex';
    warningText.textContent = `${DATA.leakage.count} unused/paused subscription${DATA.leakage.count > 1 ? 's' : ''} costing $${DATA.leakage.monthlyAmount.toFixed(2)}/mo. Consider cancelling them.`;
  } else if (incomeRatio > 3) {
    badge.textContent = 'High Impact';
    badge.className   = 'card-badge badge-down';
    warningEl.style.display = 'flex';
    warningText.textContent = `Subscriptions consume ${incomeRatio.toFixed(1)}% of your monthly income (${fmt(total)}/mo). Consider reviewing.`;
  } else {
    badge.textContent = 'Reasonable';
    badge.className   = 'card-badge badge-up';
    warningEl.style.display = 'none';
  }

  const list = document.getElementById('sub-list');
  list.innerHTML = '';

  if (subs.length === 0) {
    list.innerHTML = '<div style="color:var(--text-500);padding:16px;text-align:center;">No active subscriptions.</div>';
    return;
  }

  subs.forEach(s => {
    const el = document.createElement('div');
    el.className = 'sub-item';
    el.innerHTML = `
      <div class="sub-icon" style="background:${s.bg};color:${s.color}">${s.icon}</div>
      <div class="sub-info">
        <div class="sub-name">${s.name}</div>
        <div class="sub-cycle">${s.cycle}${s.status !== 'active' ? ' · <span style="color:var(--gold)">' + s.status + '</span>' : ''}</div>
      </div>
      <div class="sub-cost">$${s.cost.toFixed(2)}</div>
    `;
    list.appendChild(el);
  });
}

function renderEmergencyFund() {
  const ef      = DATA.emergencyFund;
  const months  = ef.current / (ef.monthlyExpenses || 1);
  const target  = ef.monthlyExpenses * ef.targetMonths;
  const pct     = Math.min(100, (ef.current / target) * 100);
  const label   = efLabel(months);

  document.getElementById('ef-current').textContent = fmt(ef.current);
  document.getElementById('ef-monthly').textContent = fmt(ef.monthlyExpenses);
  document.getElementById('ef-target').textContent  = fmt(target);

  const monthsEl = document.getElementById('ef-months');
  animateCount(monthsEl, 0, months, 1200, v => v.toFixed(1));

  const badge = document.getElementById('ef-badge');
  badge.textContent = label.text;
  badge.className   = 'card-badge ' + label.cls;

  const bar = document.getElementById('ef-bar');
  setTimeout(() => {
    bar.style.width      = pct.toFixed(1) + '%';
    bar.style.background = label.color;
  }, 200);

  const pctLabel = document.getElementById('ef-pct-label');
  pctLabel.textContent = pct.toFixed(0) + '% funded';
  pctLabel.style.color = label.color;

  const indicator     = document.getElementById('ef-indicator');
  const indicatorText = document.getElementById('ef-indicator-text');
  indicator.querySelector('i').className = `fa-solid ${label.icon}`;
  indicator.querySelector('i').style.color = label.color;

  if (months < 3)      indicatorText.textContent = `Only ${months.toFixed(1)} months covered. Aim for at least 3 months.`;
  else if (months < 6) indicatorText.textContent = `${months.toFixed(1)} months covered — Moderate. Keep saving to reach 6 months.`;
  else                 indicatorText.textContent = `${months.toFixed(1)} months covered — Strong. Your emergency fund is in excellent shape!`;

  setTimeout(() => {
    const colors = months < 3 ? ['#f43f5e','#f97316']
                 : months < 6 ? ['#f59e0b','#fbbf24']
                              : ['#10b981','#38bdf8'];
    drawRing('efRingCanvas', pct / 100, colors, 13);
  }, 100);
}

/* ── LOAD FROM API ──────────────────────────────────────────────── */
async function loadHealthData() {
  try {
    const res  = await fetch(`${API_BASE}/health`, { headers: authHeaders() });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to load health data.');
    DATA = json;
    renderAll();
  } catch (err) {
    console.error('Health load error:', err);
    // Show error state
    document.querySelector('.greeting p').textContent = '⚠️ Failed to load data. Please refresh.';
  }
}

function renderAll() {
  renderHealthScore();
  renderSummaryCards();
  renderSavingsRate();
  renderExpenseBreakdown();
  renderBudgetStatus();
  renderSavingsGoals();
  renderSubscriptions();
  renderEmergencyFund();
}

/* ── REFRESH BUTTON ─────────────────────────────────────────────── */
function refreshData() {
  loadHealthData();
}

/* ── SIDEBAR TOGGLE ─────────────────────────────────────────────── */
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (!sidebar || !overlay) return;
  sidebar.classList.toggle('open');
  overlay.classList.toggle('show');
}
/* ── SIDEBAR PROFILE ────────────────────────────────────────────── */
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

/* ── INIT ───────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  if (!getToken()) { window.location.href = 'login.html'; return; }
  loadHealthData();
});
/* ── INIT ───────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  if (!getToken()) { window.location.href = 'login.html'; return; }

  // Fetch user profile in parallel with health data
  let user = null;
  try {
    const res = await fetch(`${API_BASE}/auth/me`, { headers: authHeaders() });
    if (res.ok) user = await res.json();
  } catch (_) {}

  if (!user) user = { full_name: 'Guest' };

  renderProfile(user);
  loadHealthData();
});