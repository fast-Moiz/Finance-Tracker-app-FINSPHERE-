/* ================================================================
   FinSphere — Emergency Fund JS
   API base: /api/emergency-fund
   GET    → load saved data (or defaults)
   POST   → save & recalculate
   DELETE → reset to defaults
================================================================ */
'use strict';

const API_BASE = 'http://localhost:3000/api/emergency-fund';

/* ── Sidebar Toggle ──────────────────────────────────────────── */
function toggleSidebar() {
  const sb  = document.getElementById('sidebar');
  const ov  = document.getElementById('sidebar-overlay');
  const open = sb.classList.toggle('open');
  ov.classList.toggle('open', open);
}

/* ── Particles ───────────────────────────────────────────────── */
(function initParticles() {
  const canvas = document.getElementById('particle-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H, pts = [];

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  for (let i = 0; i < 55; i++) {
    pts.push({
      x: Math.random() * 1920, y: Math.random() * 1080,
      vx: (Math.random() - .5) * .3, vy: (Math.random() - .5) * .3,
      r: Math.random() * 1.5 + .4,
    });
  }

  function frame() {
    ctx.clearRect(0, 0, W, H);
    pts.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(56,189,248,0.5)';
      ctx.fill();
    });
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

/* ── Expense Definitions (UI-only meta: icon, cat, color) ────── */
const EXPENSES = [
  { id: 'rent',          icon: '🏠', name: 'Rent / Mortgage',  cat: 'Housing',   color: '56,189,248',  val: 1800 },
  { id: 'utilities',     icon: '⚡', name: 'Utilities',         cat: 'Housing',   color: '245,158,11',  val: 280  },
  { id: 'groceries',     icon: '🛒', name: 'Groceries',         cat: 'Food',      color: '16,185,129',  val: 600  },
  { id: 'transport',     icon: '🚗', name: 'Transport',         cat: 'Transport', color: '129,140,248', val: 450  },
  { id: 'insurance',     icon: '🛡️', name: 'Insurance',         cat: 'Health',    color: '45,212,191',  val: 320  },
  { id: 'healthcare',    icon: '💊', name: 'Healthcare',        cat: 'Health',    color: '251,146,60',  val: 200  },
  { id: 'phone',         icon: '📱', name: 'Phone / Internet',  cat: 'Bills',     color: '52,211,153',  val: 150  },
  { id: 'subscriptions', icon: '📺', name: 'Subscriptions',     cat: 'Bills',     color: '167,139,250', val: 80   },
  { id: 'childcare',     icon: '👶', name: 'Child / Pet Care',  cat: 'Family',    color: '244,63,94',   val: 300  },
  { id: 'misc',          icon: '💳', name: 'Misc / Emergency',  cat: 'Other',     color: '96,165,250',  val: 770  },
];

const COVERAGE_OPTIONS = [3, 4, 6, 9, 12];

/* ── State ──────────────────────────────────────────────────── */
const STATE = {
  expenses:   EXPENSES.map(e => ({ ...e })),
  fund:       14500,
  monthlySav: 500,
  coverage:   6,
  currency:   '$',
};

const TODAY_YEAR  = new Date().getFullYear();
const TODAY_MONTH = new Date().getMonth() + 1;

/* ── Auth helpers ───────────────────────────────────────────── */
function getAuthHeaders() {
  const token = localStorage.getItem('finsphere_token') || sessionStorage.getItem('finsphere_token') || '';
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': 'Bearer ' + token } : {}),
  };
}

/* ── Page loader ────────────────────────────────────────────── */
function showLoader()  { document.getElementById('page-loader').classList.remove('hidden'); }
function hideLoader()  { document.getElementById('page-loader').classList.add('hidden'); }

/* ── Utils ──────────────────────────────────────────────────── */
function getCur() { return document.getElementById('currency-sel').value; }

function fmt(v) {
  const c = getCur();
  if (v >= 1e6) return c + (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return c + (v / 1000).toFixed(1) + 'K';
  return c + Math.round(v).toLocaleString();
}

function fmtFull(v) { return getCur() + Math.round(v).toLocaleString(); }

function monthToDate(m) {
  const mo = TODAY_MONTH + m;
  const yr = TODAY_YEAR + Math.floor((mo - 1) / 12);
  const mn = ((mo - 1) % 12) + 1;
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return names[mn - 1] + ' ' + yr;
}

/* ── Safe JSON parser: never throws on empty/non-JSON body ──── */
async function safeJSON(res) {
  const text = await res.text();
  if (!text || !text.trim()) return {};          // empty body → {}
  try { return JSON.parse(text); } catch (_) {
    console.warn('Non-JSON response body:', text.slice(0, 200));
    return {};                                   // HTML error page etc → {}
  }
}

/* ── API: Load data from server ─────────────────────────────── */
async function loadFromAPI() {
  showLoader();
  try {
    const res  = await fetch(API_BASE, { headers: getAuthHeaders() });
    const json = await safeJSON(res);

    if (!res.ok) throw new Error(json.message || `Server error ${res.status}`);

    const d = json.data;
    if (!d) throw new Error('No data in response');

    STATE.fund       = d.fund       ?? STATE.fund;
    STATE.monthlySav = d.monthlySav ?? STATE.monthlySav;
    STATE.coverage   = d.coverage   ?? STATE.coverage;
    STATE.currency   = d.currency   ?? STATE.currency;

    // Merge API expenses into full expense list (preserving icon/cat/color)
    if (Array.isArray(d.expenses)) {
      d.expenses.forEach(saved => {
        const exp = STATE.expenses.find(e => e.id === saved.id);
        if (exp) exp.val = saved.val ?? exp.val;
      });
    }

    syncUIFromState();
    buildExpenseList();
    setCoverage(STATE.coverage);
    updateAll();

    if (json.isDefault) {
      showToast('ℹ️ Showing default values — save to persist your data');
    } else {
      const updated = d.updatedAt
        ? ' (last saved: ' + new Date(d.updatedAt).toLocaleDateString() + ')'
        : '';
      showToast('✅ Loaded your saved settings' + updated);
    }
  } catch (err) {
    console.error('Load error:', err);
    // Fall back to in-memory defaults, still render UI
    syncUIFromState();
    buildExpenseList();
    setCoverage(STATE.coverage);
    updateAll();
    showToast('⚠️ Could not reach server — using defaults');
  } finally {
    hideLoader();
  }
}

/* ── API: Save data to server ───────────────────────────────── */
async function saveToAPI() {
  // Sync expense inputs into state
  STATE.expenses.forEach(e => {
    const inp = document.getElementById('exp-' + e.id);
    if (inp) e.val = parseFloat(inp.value) || 0;
  });

  const payload = {
    fund:            STATE.fund,
    monthly_savings: STATE.monthlySav,
    coverage:        STATE.coverage,
    currency:        STATE.currency,
    expenses:        STATE.expenses.map(e => ({ id: e.id, val: e.val, name: e.name })),
  };

  const res  = await fetch(API_BASE, {
    method:  'POST',
    headers: getAuthHeaders(),
    body:    JSON.stringify(payload),
  });
  const json = await safeJSON(res);
  if (!res.ok) throw new Error(json.message || `Server error ${res.status}`);
  return json;
}

/* ── API: Reset data on server ──────────────────────────────── */
async function resetOnAPI() {
  const res  = await fetch(API_BASE, { method: 'DELETE', headers: getAuthHeaders() });
  const json = await safeJSON(res);
  if (!res.ok) throw new Error(json.message || `Server error ${res.status}`);
  return json;
}

/* ── Sync UI controls from STATE ────────────────────────────── */
function syncUIFromState() {
  document.getElementById('fi-fund').value            = STATE.fund;
  document.getElementById('ms-slider').value          = STATE.monthlySav;
  document.getElementById('currency-sel').value       = STATE.currency;
  document.getElementById('currency-pfx').textContent = STATE.currency;
  document.getElementById('ms-val-lbl').textContent   = STATE.currency + STATE.monthlySav + '/mo';
}

/* ── Build Expense List ─────────────────────────────────────── */
function buildExpenseList() {
  const list = document.getElementById('exp-list');
  list.innerHTML = STATE.expenses.map(e => `
    <div class="ef-exp-row">
      <div class="ef-exp-icon" style="background:rgba(${e.color},.12);color:rgba(${e.color},1)">${e.icon}</div>
      <div style="flex:1;min-width:0;">
        <div class="ef-exp-name">${e.name}</div>
        <div class="ef-exp-cat">${e.cat}</div>
      </div>
      <input class="ef-exp-inp" type="number" id="exp-${e.id}" value="${e.val}" min="0"
        oninput="onExpenseChange('${e.id}', this.value)"/>
      <span class="ef-exp-unit">/mo</span>
    </div>
  `).join('');
}

function onExpenseChange(id, val) {
  const exp = STATE.expenses.find(e => e.id === id);
  if (exp) exp.val = parseFloat(val) || 0;
  updateAll();
}

/* ── Coverage ───────────────────────────────────────────────── */
function setCoverage(n) {
  STATE.coverage = n;
  COVERAGE_OPTIONS.forEach(v => {
    const btn = document.getElementById('cov-' + v);
    if (btn) btn.classList.remove('active');
  });
  const active = document.getElementById('cov-' + n);
  if (active) active.classList.add('active');
  updateAll();
}

/* ── Calculations (mirrors backend computeMetrics) ──────────── */
function calc() {
  const totalMonthly  = STATE.expenses.reduce((s, e) => s + (e.val || 0), 0);
  const target        = totalMonthly * STATE.coverage;
  const fund          = STATE.fund;
  const monthlySav    = STATE.monthlySav;
  const gap           = Math.max(0, target - fund);
  const monthsCovered = totalMonthly > 0 ? fund / totalMonthly : 0;
  const pct           = target > 0 ? Math.min(100, (fund / target) * 100) : 0;
  const ttgMonths     = monthlySav > 0 && gap > 0 ? gap / monthlySav : 0;

  let score = 0;
  score += Math.min(60, pct * 0.60);
  score += fund > 0 ? 20 : 0;
  score += Math.min(20, (monthlySav / (totalMonthly || 1)) * 100 * 0.20);
  score  = Math.round(score);

  return { totalMonthly, target, fund, gap, monthsCovered, pct, ttgMonths, score };
}

/* ── Grade / Risk ───────────────────────────────────────────── */
function getGrade(score) {
  if (score >= 85) return {
    label: 'Fully Funded ✅', color: 'var(--success)',
    bg: 'rgba(16,185,129,.1)', border: 'rgba(16,185,129,.25)',
    icon: '🛡️', risk: 'Low Risk',
    riskDesc: `Your fund covers ${STATE.coverage} months. Well prepared.`,
    riskBg: 'rgba(16,185,129,.08)', riskBorder: 'rgba(16,185,129,.2)',
  };
  if (score >= 65) return {
    label: 'Good Coverage 👍', color: 'var(--cyan)',
    bg: 'rgba(56,189,248,.1)', border: 'rgba(56,189,248,.25)',
    icon: '🎯', risk: 'Low–Moderate',
    riskDesc: 'Slight gap remains. Stay on course.',
    riskBg: 'rgba(56,189,248,.08)', riskBorder: 'rgba(56,189,248,.2)',
  };
  if (score >= 45) return {
    label: 'Partially Funded ⚠️', color: 'var(--gold)',
    bg: 'rgba(245,158,11,.10)', border: 'rgba(245,158,11,.25)',
    icon: '⚠️', risk: 'Moderate Risk',
    riskDesc: 'A job loss could impact finances within 3 months.',
    riskBg: 'rgba(245,158,11,.08)', riskBorder: 'rgba(245,158,11,.2)',
  };
  if (score >= 25) return {
    label: 'Underfunded 🔶', color: '#fb923c',
    bg: 'rgba(251,146,60,.10)', border: 'rgba(251,146,60,.25)',
    icon: '🔶', risk: 'High Risk',
    riskDesc: 'Vulnerable to unexpected expenses. Prioritize building fund.',
    riskBg: 'rgba(251,146,60,.08)', riskBorder: 'rgba(251,146,60,.2)',
  };
  return {
    label: 'Critical ❌', color: 'var(--error)',
    bg: 'rgba(244,63,94,.10)', border: 'rgba(244,63,94,.25)',
    icon: '🚨', risk: 'Critical Risk',
    riskDesc: 'No financial safety net. Immediate action required.',
    riskBg: 'rgba(244,63,94,.08)', riskBorder: 'rgba(244,63,94,.2)',
  };
}

/* ── Main Update ────────────────────────────────────────────── */
function updateAll() {
  STATE.fund       = parseFloat(document.getElementById('fi-fund').value) || 0;
  STATE.monthlySav = parseInt(document.getElementById('ms-slider').value) || 0;
  STATE.currency   = getCur();

  document.getElementById('currency-pfx').textContent = STATE.currency;
  document.getElementById('ms-val-lbl').textContent    = STATE.currency + STATE.monthlySav + '/mo';

  const D = calc();
  const G = getGrade(D.score);
  const cur = STATE.currency;

  /* Stat Cards */
  document.getElementById('total-monthly').textContent  = fmtFull(D.totalMonthly);
  document.getElementById('gs-current').textContent     = fmtFull(D.fund);
  document.getElementById('gs-target').textContent      = fmtFull(D.target);
  document.getElementById('gs-target-sub').textContent  = STATE.coverage + ' months of expenses';
  document.getElementById('gs-gap').textContent         = D.gap > 0 ? fmtFull(D.gap) : '✅ Fully Funded';
  document.getElementById('gs-gap').style.color         = D.gap > 0 ? 'var(--error)' : 'var(--success)';
  document.getElementById('gs-gap-sub').textContent     = D.gap > 0 ? 'still needed' : '';
  document.getElementById('gs-monthly').textContent     = fmtFull(D.totalMonthly);
  document.getElementById('gs-pct').textContent         = D.pct.toFixed(1) + '%';
  document.getElementById('badge-pct').textContent      = Math.round(D.pct) + '% funded';

  const ttgTxt = D.ttgMonths > 0 ? D.ttgMonths.toFixed(1) + ' mo' : 'Funded! 🎉';
  document.getElementById('gs-ttg').textContent   = ttgTxt;
  document.getElementById('gs-ttg').style.cssText = D.ttgMonths > 0
    ? 'font-size:24px;margin-top:8px;background:linear-gradient(135deg,var(--violet),var(--cyan));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;'
    : 'font-size:24px;margin-top:8px;color:var(--success);';
  document.getElementById('gs-ttg-sub').textContent = 'at ' + cur + STATE.monthlySav + '/mo';

  document.getElementById('status-val').textContent    = G.label;
  document.getElementById('status-val').style.color    = G.color;
  document.getElementById('status-sub').textContent    = D.pct.toFixed(1) + '% of target funded';

  /* Gauge */
  const monthsNum = Math.min(D.monthsCovered, STATE.coverage * 1.2);
  drawGauge(monthsNum);
  document.getElementById('gauge-months-txt').textContent  = D.monthsCovered.toFixed(1);
  document.getElementById('gauge-months-txt').style.color  = G.color;
  document.getElementById('gauge-caption').textContent     = G.label;
  document.getElementById('gauge-caption').style.background = G.bg;
  document.getElementById('gauge-caption').style.color      = G.color;
  document.getElementById('gauge-caption').style.border     = '1px solid ' + G.border;
  document.getElementById('ttg-date').textContent = D.ttgMonths > 0 ? monthToDate(Math.ceil(D.ttgMonths)) : 'Now!';

  /* Meter + Rings */
  drawMonthMeter(D.monthsCovered);
  drawRingCards(D);

  /* Readiness */
  drawReadinessRing(D.score);
  document.getElementById('readiness-score').textContent = D.score;
  document.getElementById('readiness-score').style.color = G.color;
  document.getElementById('readiness-grade').textContent = G.label;
  document.getElementById('readiness-grade').style.color = G.color;

  const ri = document.getElementById('risk-indicator');
  document.getElementById('risk-icon').textContent  = G.icon;
  document.getElementById('risk-label').textContent = G.risk;
  document.getElementById('risk-label').style.color = G.color;
  document.getElementById('risk-desc').textContent  = G.riskDesc;
  ri.style.background  = G.riskBg;
  ri.style.borderColor = G.riskBorder;

  document.getElementById('plan-pct').textContent = Math.round(D.pct) + '%';
  document.getElementById('plan-bar').style.width = Math.min(100, D.pct) + '%';

  /* Savings Plan */
  document.getElementById('need-per-mo').textContent   = fmtFull(STATE.monthlySav);
  document.getElementById('annual-target').textContent = fmtFull(STATE.monthlySav * 12);
  const incPct = D.totalMonthly > 0
    ? (STATE.monthlySav / D.totalMonthly * 100).toFixed(1)
    : '0.0';
  document.getElementById('income-pct').textContent = incPct + '%';

  const maxSav = D.totalMonthly * 0.5 || 1;
  document.getElementById('pb-mo').style.width  = Math.min(100, STATE.monthlySav / maxSav * 100) + '%';
  document.getElementById('pb-yr').style.width  = Math.min(100, STATE.monthlySav * 12 / (D.target || 1) * 100) + '%';
  document.getElementById('pb-inc').style.width = Math.min(100, parseFloat(incPct) / 30 * 100) + '%';

  buildActionSteps(D, G);
}

/* ── Gauge Canvas ───────────────────────────────────────────── */
function drawGauge(monthsCovered) {
  const canvas = document.getElementById('gaugeCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const SIZE = 170;
  canvas.width  = SIZE * dpr;
  canvas.height = SIZE * dpr;
  canvas.style.width  = SIZE + 'px';
  canvas.style.height = SIZE + 'px';
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, SIZE, SIZE);

  const cx = SIZE / 2, cy = SIZE / 2, R = 68;
  const startA = Math.PI * 0.75, endA = Math.PI * 2.25;
  const totalA = endA - startA;
  const maxDisp = STATE.coverage * 1.2;

  ctx.beginPath();
  ctx.arc(cx, cy, R, startA, endA);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 12; ctx.lineCap = 'round'; ctx.stroke();

  const zones = [
    { end: 2,              color: '#f43f5e' },
    { end: 3,              color: '#fb923c' },
    { end: 4,              color: '#f59e0b' },
    { end: STATE.coverage, color: '#38bdf8' },
    { end: maxDisp,        color: '#10b981' },
  ];
  let prev = 0;
  zones.forEach(z => {
    const s = startA + (prev / maxDisp) * totalA;
    const e = startA + (Math.min(z.end, maxDisp) / maxDisp) * totalA;
    ctx.beginPath();
    ctx.arc(cx, cy, R, s, e);
    ctx.strokeStyle = z.color + '55';
    ctx.lineWidth = 12; ctx.lineCap = 'butt'; ctx.stroke();
    prev = z.end;
  });

  const fillFrac = Math.min(monthsCovered / maxDisp, 1);
  if (fillFrac > 0) {
    const grad = ctx.createLinearGradient(cx - R, cy, cx + R, cy);
    grad.addColorStop(0,   '#f43f5e');
    grad.addColorStop(0.4, '#f59e0b');
    grad.addColorStop(1,   '#38bdf8');
    ctx.beginPath();
    ctx.arc(cx, cy, R, startA, startA + fillFrac * totalA);
    ctx.strokeStyle = 'rgba(56,189,248,0.15)';
    ctx.lineWidth = 20; ctx.lineCap = 'round'; ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, R, startA, startA + fillFrac * totalA);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 12; ctx.lineCap = 'round'; ctx.stroke();
  }

  const targetFrac  = Math.min(STATE.coverage / maxDisp, 1);
  const targetAngle = startA + targetFrac * totalA;
  ctx.beginPath();
  ctx.arc(cx + R * Math.cos(targetAngle), cy + R * Math.sin(targetAngle), 5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
}

/* ── Month Meter ────────────────────────────────────────────── */
function drawMonthMeter(monthsCovered) {
  const maxMonths = Math.max(STATE.coverage * 1.5, 12);

  document.getElementById('mm-fill').style.width =
    Math.min(100, (monthsCovered / maxMonths) * 100) + '%';

  const zoneEl = document.getElementById('mm-zones');
  const zones  = [
    { end: 2,              color: '#f43f5e' },
    { end: 3,              color: '#fb923c' },
    { end: 4,              color: '#f59e0b' },
    { end: STATE.coverage, color: '#38bdf8' },
    { end: maxMonths,      color: '#10b981' },
  ];
  let prev = 0;
  zoneEl.innerHTML = zones.map(z => {
    const w = ((Math.min(z.end, maxMonths) - prev) / maxMonths) * 100;
    prev = z.end;
    return `<div class="ef-mm-zone" style="width:${w}%;background:${z.color}"></div>`;
  }).join('');

  document.getElementById('mm-target-marker').style.left =
    Math.min(100, (STATE.coverage / maxMonths) * 100) + '%';

  const tickVals = [0, 1, 2, 3, 4, 6, 9, 12].filter(t => t <= maxMonths);
  document.getElementById('mm-ticks').innerHTML = tickVals.map(t => {
    const pct = (t / maxMonths) * 100;
    const active = Math.abs(t - monthsCovered) < 0.5 ? 'active' : '';
    return `<div class="ef-mm-tick" style="left:${pct}%">
      <div class="ef-mm-tick-line"></div>
      <div class="ef-mm-tick-lbl ${active}">${t}mo</div>
    </div>`;
  }).join('');
}

/* ── Ring Cards ─────────────────────────────────────────────── */
function drawRingCards(D) {
  const total = D.totalMonthly || 1;

  document.getElementById('ring-grid').innerHTML = STATE.expenses.map(e => {
    const pct = Math.round((e.val / total) * 100);
    return `<div class="ef-ring-card">
      <div class="ef-rc-canvas-wrap">
        <canvas id="rc-${e.id}" width="52" height="52"></canvas>
        <div class="ef-rc-center" style="color:rgba(${e.color},1)">${e.icon}</div>
      </div>
      <div class="ef-rc-name">${e.name.split('/')[0].trim()}</div>
      <div class="ef-rc-val" style="color:rgba(${e.color},1)">${fmtFull(e.val)}</div>
      <div class="ef-rc-pct">${pct}% of total</div>
    </div>`;
  }).join('');

  STATE.expenses.forEach(e => {
    const canvas = document.getElementById('rc-' + e.id);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = 52 * dpr; canvas.height = 52 * dpr;
    canvas.style.width  = '52px'; canvas.style.height = '52px';
    ctx.scale(dpr, dpr);

    const pct = e.val / (D.totalMonthly || 1);
    ctx.beginPath();
    ctx.arc(26, 26, 20, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 4; ctx.stroke();
    if (pct > 0) {
      ctx.beginPath();
      ctx.arc(26, 26, 20, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2);
      ctx.strokeStyle = `rgba(${e.color}, 0.9)`;
      ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.stroke();
    }
  });
}

/* ── Readiness Ring ─────────────────────────────────────────── */
function drawReadinessRing(score) {
  const canvas = document.getElementById('readinessCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = 90 * dpr; canvas.height = 90 * dpr;
  canvas.style.width  = '90px'; canvas.style.height = '90px';
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, 90, 90);

  ctx.beginPath();
  ctx.arc(45, 45, 36, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 7; ctx.stroke();

  const frac = Math.min(score / 100, 1);
  const grad = ctx.createLinearGradient(9, 45, 81, 45);
  grad.addColorStop(0, '#38bdf8');
  grad.addColorStop(1, '#818cf8');
  ctx.beginPath();
  ctx.arc(45, 45, 36, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
  ctx.strokeStyle = grad;
  ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.stroke();
}

/* ── Action Steps ───────────────────────────────────────────── */
function buildActionSteps(D, G) {
  const steps = [];
  if (D.pct < 100) steps.push({
    color: 'var(--cyan)', bg: 'rgba(56,189,248,.12)',
    title: 'Automate Savings',
    desc: `Set up auto-transfer of ${getCur()}${STATE.monthlySav}/mo on payday.`,
  });
  if (D.pct < 50) steps.push({
    color: 'var(--error)', bg: 'rgba(244,63,94,.12)',
    title: 'Trim Top 2 Expenses',
    desc: `Cutting just 10% of top expenses adds ${getCur()}${Math.round(D.totalMonthly * 0.10)}/mo to fund.`,
  });
  if (D.ttgMonths > 18) steps.push({
    color: 'var(--gold)', bg: 'rgba(245,158,11,.12)',
    title: 'Boost Contribution',
    desc: `Doubling savings halves your timeline to ${(D.ttgMonths / 2).toFixed(0)} months.`,
  });
  if (D.pct >= 80) steps.push({
    color: 'var(--success)', bg: 'rgba(16,185,129,.12)',
    title: 'Consider HYSA',
    desc: 'Move emergency fund to a High-Yield Savings Account for 4–5% APY while staying liquid.',
  });
  if (D.pct >= 100) steps.push({
    color: 'var(--violet)', bg: 'rgba(129,140,248,.12)',
    title: 'Invest the Surplus',
    desc: 'Fund is complete! Route extra savings to index funds for wealth building.',
  }); else steps.push({
    color: 'var(--violet)', bg: 'rgba(129,140,248,.12)',
    title: 'Separate Account',
    desc: 'Keep emergency fund in a dedicated account to avoid accidental spending.',
  });

  document.getElementById('action-list').innerHTML = steps.slice(0, 4).map((s, i) => `
    <div class="ef-action-item">
      <div class="ef-act-num" style="background:${s.bg};color:${s.color}">${i + 1}</div>
      <div class="ef-act-body">
        <div class="ef-act-title" style="color:${s.color}">${s.title}</div>
        <div class="ef-act-desc">${s.desc}</div>
      </div>
    </div>
  `).join('');
}

/* ── Reset Defaults (API) ───────────────────────────────────── */
async function resetDefaults() {
  const btn = document.querySelector('.topbar-btn[onclick*="resetDefaults"]');
  if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; }

  try {
    await resetOnAPI();

    EXPENSES.forEach((e, i) => { STATE.expenses[i].val = e.val; });
    STATE.fund = 14500; STATE.monthlySav = 500;
    STATE.coverage = 6; STATE.currency = '$';

    syncUIFromState();
    buildExpenseList();
    setCoverage(6);
    updateAll();
    showToast('🔄 Reset to default values');
  } catch (err) {
    console.error('Reset error:', err);
    showToast('❌ Reset failed: ' + (err.message || 'Server error'));
  } finally {
    if (btn) { btn.disabled = false; btn.style.opacity = ''; }
  }
}

/* ── Save & Recalculate (API) ───────────────────────────────── */
async function saveAndRecalc() {
  const btn  = document.querySelector('.ef-save-btn');
  const icon = document.getElementById('save-icon');
  btn.disabled = true;
  icon.classList.add('spinning');

  try {
    const json = await saveToAPI();

    updateAll();
    const gm = document.getElementById('gauge-months-txt');
    gm.style.transform = 'scale(1.15)';
    setTimeout(() => { gm.style.transform = ''; }, 300);
    showToast('✅ Saved & recalculated successfully!');
  } catch (err) {
    console.error('Save error:', err);
    showToast('❌ Save failed: ' + (err.message || 'Server error'));
  } finally {
    icon.classList.remove('spinning');
    btn.disabled = false;
  }
}

/* ── Export Report ──────────────────────────────────────────── */
function exportReport() {
  const D = calc();
  const G = getGrade(D.score);
  const lines = [
    'FinSphere — Emergency Fund Report',
    '===================================',
    `Date: ${new Date().toLocaleDateString()}`,
    '',
    `Fund Status:          ${G.label}`,
    `Readiness Score:      ${D.score}/100`,
    `Risk Level:           ${G.risk}`,
    '',
    `Current Fund:         ${fmtFull(D.fund)}`,
    `Target Fund:          ${fmtFull(D.target)} (${STATE.coverage} months)`,
    `Gap to Close:         ${D.gap > 0 ? fmtFull(D.gap) : 'None — Fully Funded!'}`,
    `Months Covered:       ${D.monthsCovered.toFixed(1)}`,
    `% Complete:           ${D.pct.toFixed(1)}%`,
    '',
    `Monthly Expenses:     ${fmtFull(D.totalMonthly)}`,
    `Monthly Contribution: ${fmtFull(STATE.monthlySav)}`,
    `Time to Goal:         ${D.ttgMonths > 0 ? D.ttgMonths.toFixed(1) + ' months' : 'Already funded!'}`,
    '',
    'Expense Breakdown:',
    ...STATE.expenses.map(e => `  ${e.name.padEnd(22)} ${fmtFull(e.val)}/mo`),
  ];

  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = 'emergency-fund-report.txt';
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('📄 Report downloaded!');
}

/* ── Toast ──────────────────────────────────────────────────── */
let toastTimer;
function showToast(msg) {
  clearTimeout(toastTimer);
  const t = document.getElementById('toast');
  document.getElementById('toast-msg').textContent = msg;
  t.classList.add('show');
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}
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
// ✅ Correct full DOMContentLoaded
document.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('finsphere_token') || sessionStorage.getItem('finsphere_token') || '';
  const user  = JSON.parse(localStorage.getItem('finsphere_user') || 'null');

  if (!token) {
    showToast('⚠️ Session expired. Please log in again.');
    setTimeout(() => { window.location.href = 'login.html'; }, 1500);
    return;
  }

  let profileUser = user;
  try {
    const res = await fetch('http://localhost:3000/api/auth/me', {
      headers: getAuthHeaders()
    });
    if (res.ok) profileUser = await res.json();
  } catch (_) {}

  if (!profileUser) profileUser = { full_name: 'Guest' };
  renderProfile(profileUser);
  loadFromAPI();          // loadFromAPI shows its own toast — that's fine
});

