/* ================================================================
   FINSPHERE — Budgets Page  |  Full Frontend Logic
   Backend: Node.js + MySQL via /api/budgets (JWT protected)
================================================================ */

'use strict';

/* ── API CONFIG ─────────────────────────────────────────────── */
const API   = 'http://localhost:3000/api/budgets';
const token = localStorage.getItem('finsphere_token');
const user  = JSON.parse(localStorage.getItem('finsphere_user') || 'null');

/* ── CATEGORY META ──────────────────────────────────────────── */
const CAT_META = {
  food:      { icon: '🍽️', label: 'Food & Dining',  color: 'var(--gold)'    },
  transport: { icon: '🚗', label: 'Transport',       color: 'var(--violet)'  },
  shopping:  { icon: '🛍️', label: 'Shopping',        color: 'var(--cyan)'    },
  health:    { icon: '🏥', label: 'Health',           color: '#10b981'        },
  utilities: { icon: '⚡', label: 'Utilities',        color: '#f59e0b'        },
  entertain: { icon: '🎬', label: 'Entertainment',   color: '#8b5cf6'        },
  travel:    { icon: '✈️', label: 'Travel',           color: '#06b6d4'        },
  other:     { icon: '📦', label: 'Other',            color: '#64748b'        },
};

/* ── STATE ─────────────────────────────────────────────────── */
let budgets    = [];
let editingId  = null;
let deletingId = null;
let currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

/* ── HELPERS ────────────────────────────────────────────────── */
function $(id) { return document.getElementById(id); }
function fmt(n) {
  const abs = Math.abs(parseFloat(n) || 0);
  return '$' + abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function authHeaders() {
  return token ? { Authorization: 'Bearer ' + token } : {};
}
function escHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])
  );
}

/* ── INIT ───────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  if (!token) {
    showToast('error', 'Session Expired', 'Please log in again.');
    setTimeout(() => { window.location.href = 'login.html'; }, 1500);
    return;
  }

  // Fetch fresh user from API for profile
  let profileUser = user; // fallback to localStorage
  try {
    const res = await fetch('http://localhost:3000/api/auth/me', {
      headers: { Authorization: 'Bearer ' + token }
    });
    if (res.ok) profileUser = await res.json();
  } catch (_) {}

  if (!profileUser) profileUser = { full_name: 'Guest' };
  renderProfile(profileUser);

  // Set month picker to current month
  const picker = $('month-picker');
  if (picker) {
    picker.value = currentMonth;
    picker.addEventListener('change', e => {
      currentMonth = e.target.value;
      fetchBudgets();
    });
  }

  bindSidebar();
  fetchBudgets();
});

/* ──────────────────────────────────────────────────────────────
   DATA LAYER
────────────────────────────────────────────────────────────── */

async function fetchBudgets() {
  setLoading(true);
  try {
    const res  = await fetch(`${API}?month=${currentMonth}`, { headers: authHeaders() });
    const data = await res.json();

    if (res.status === 401 || res.status === 403) {
      showToast('error', 'Session Expired', 'Redirecting to login…');
      setTimeout(() => { window.location.href = 'login.html'; }, 1800);
      return;
    }
    if (!res.ok) throw new Error(data.message || `Server error (${res.status})`);

    budgets = data.budgets || [];
    renderBudgets();
  } catch (err) {
    console.error('Fetch budgets error:', err);
    showToast('error', 'Connection Error', err.message || 'Could not load budgets.');
  } finally {
    setLoading(false);
  }
}

async function apiCreateBudget(payload) {
  const res  = await fetch(API, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body:    JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `Server error (${res.status})`);
  return data;
}

async function apiUpdateBudget(id, payload) {
  const res  = await fetch(`${API}/${id}`, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body:    JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `Server error (${res.status})`);
  return data;
}

async function apiDeleteBudget(id) {
  const res  = await fetch(`${API}/${id}`, {
    method:  'DELETE',
    headers: authHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `Server error (${res.status})`);
  return data;
}

/* ──────────────────────────────────────────────────────────────
   RENDER
────────────────────────────────────────────────────────────── */

function renderBudgets() {
  const container = $('budget-container');
  if (!container) return;

  let totalLimit = 0, totalSpent = 0;

  if (budgets.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;display:flex;">
        <div class="empty-icon">💰</div>
        <div class="empty-title">No budgets yet</div>
        <div class="empty-sub">Create your first budget to start tracking your spending.</div>
        <button class="btn-add-txn" onclick="openAddModal()">
          <i class="fa fa-plus"></i> Create Budget
        </button>
      </div>`;
  } else {
    container.innerHTML = budgets.map(b => {
      totalLimit += b.limit;
      totalSpent += b.spent;

      const cat    = CAT_META[b.category] || CAT_META.other;
      const pct    = b.limit > 0 ? Math.min((b.spent / b.limit) * 100, 100) : 0;
      const isOver = b.spent > b.limit;
      const barColor = isOver ? 'var(--error)' : cat.color;
      const remaining = b.limit - b.spent;

      return `
        <div class="budget-card" data-id="${b.id}">
          <div class="b-card-header">
            <div class="b-cat-info">
              <div class="b-icon" style="background:rgba(255,255,255,0.05);color:${cat.color}">${cat.icon}</div>
              <div>
                <div class="b-name">${escHtml(cat.label)}</div>
                <div style="font-size:11px;color:var(--text-500);margin-top:2px;">${currentMonth}</div>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <div class="b-status" style="background:${isOver ? 'rgba(244,63,94,0.1)' : 'rgba(16,185,129,0.1)'};color:${isOver ? 'var(--error)' : 'var(--success)'}">
                ${isOver ? '⚠ Over' : '✓ On Track'}
              </div>
              <button class="action-btn action-btn-edit"   title="Edit limit"  onclick="openEditModal(${b.id})"><i class="fa fa-pen"></i></button>
              <button class="action-btn action-btn-delete" title="Delete"      onclick="openDeleteConfirm(${b.id})"><i class="fa fa-trash"></i></button>
            </div>
          </div>
          <div class="b-amounts">
            <span class="b-spent" style="color:${isOver ? 'var(--error)' : 'var(--text-100)'}">Spent: ${fmt(b.spent)}</span>
            <span class="b-limit">Limit: ${fmt(b.limit)}</span>
          </div>
          <div class="b-bar-track">
            <div class="b-bar-fill" style="width:${pct.toFixed(1)}%;background:${barColor}"></div>
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:12px;color:var(--text-500);">
            <span>${pct.toFixed(0)}% used</span>
            <span style="color:${remaining < 0 ? 'var(--error)' : 'var(--success)'}">
              ${remaining < 0 ? '−' : ''}${fmt(remaining)} ${remaining < 0 ? 'over' : 'left'}
            </span>
          </div>
        </div>`;
    }).join('');
  }

  // Update summary cards
  const remaining = totalLimit - totalSpent;
  $('total-budget').textContent    = fmt(totalLimit);
  $('total-spent').textContent     = fmt(totalSpent);
  $('total-remaining').textContent = fmt(remaining);
  $('total-remaining').style.color = remaining < 0 ? 'var(--error)' : '';
}

/* ──────────────────────────────────────────────────────────────
   MODAL — Add
────────────────────────────────────────────────────────────── */

function openAddModal() {
  editingId = null;
  $('modal-title').textContent      = 'Create Budget';
  $('modal-submit-btn').textContent = 'Create Budget';
  $('b-category').disabled          = false;
  $('b-limit').value                = '';
  $('b-category').value             = 'food';

  // Only show categories not already budgeted this month
  const usedCats = new Set(budgets.map(b => b.category));
  Array.from($('b-category').options).forEach(opt => {
    opt.disabled = usedCats.has(opt.value);
  });
  // Pick first available
  const firstFree = Array.from($('b-category').options).find(o => !o.disabled);
  if (firstFree) $('b-category').value = firstFree.value;

  openOverlay('budget-modal');
  setTimeout(() => $('b-limit').focus(), 300);
}

/* ──────────────────────────────────────────────────────────────
   MODAL — Edit
────────────────────────────────────────────────────────────── */

function openEditModal(id) {
  const b = budgets.find(x => x.id === id);
  if (!b) return;
  editingId = id;

  const cat = CAT_META[b.category] || CAT_META.other;
  $('modal-title').textContent      = `Edit — ${cat.label}`;
  $('modal-submit-btn').textContent = 'Save Changes';
  $('b-category').value             = b.category;
  $('b-category').disabled          = true;   // category is locked on edit
  $('b-limit').value                = b.limit;

  // Enable all options (category locked anyway)
  Array.from($('b-category').options).forEach(opt => opt.disabled = false);

  openOverlay('budget-modal');
  setTimeout(() => $('b-limit').focus(), 300);
}

function closeBudgetModal() {
  closeOverlay('budget-modal');
  editingId = null;
  $('b-category').disabled = false;
}

/* ──────────────────────────────────────────────────────────────
   SAVE (create or update)
────────────────────────────────────────────────────────────── */

async function saveBudget() {
  const limit = parseFloat($('b-limit').value);
  if (!limit || isNaN(limit) || limit <= 0) {
    shake($('b-limit'));
    return;
  }

  const btn = $('modal-submit-btn');
  btn.disabled    = true;
  btn.textContent = editingId ? 'Saving…' : 'Creating…';

  try {
    if (editingId) {
      await apiUpdateBudget(editingId, { monthly_limit: limit });
      showToast('success', 'Budget Updated', 'Your budget limit has been updated.');
    } else {
      const cat = $('b-category').value;
      await apiCreateBudget({ category: cat, monthly_limit: limit, month: currentMonth });
      showToast('success', 'Budget Created', `Budget for ${CAT_META[cat]?.label || cat} created.`);
    }
    closeBudgetModal();
    await fetchBudgets();
  } catch (err) {
    console.error(err);
    showToast('error', 'Save Failed', err.message || 'Could not save budget.');
  } finally {
    btn.disabled    = false;
    btn.textContent = editingId ? 'Save Changes' : 'Create Budget';
  }
}

/* ──────────────────────────────────────────────────────────────
   DELETE CONFIRM
────────────────────────────────────────────────────────────── */

function openDeleteConfirm(id) {
  deletingId = id;
  openOverlay('confirm-overlay');
}

function closeConfirm() {
  closeOverlay('confirm-overlay');
  deletingId = null;
}

async function executeDelete() {
  if (!deletingId) return;
  const b   = budgets.find(x => x.id === deletingId);
  const btn = $('confirm-delete');
  btn.disabled    = true;
  btn.textContent = 'Deleting…';

  try {
    await apiDeleteBudget(deletingId);
    showToast('success', 'Deleted', `Budget for "${CAT_META[b?.category]?.label || 'item'}" removed.`);
    closeConfirm();
    await fetchBudgets();
  } catch (err) {
    console.error(err);
    showToast('error', 'Delete Failed', err.message || 'Could not delete budget.');
  } finally {
    btn.disabled    = false;
    btn.innerHTML   = '<i class="fa fa-trash" style="margin-right:6px;"></i>Delete';
  }
}

/* ──────────────────────────────────────────────────────────────
   OVERLAY HELPERS
────────────────────────────────────────────────────────────── */

function openOverlay(id)  { $(id).classList.add('open');    document.body.style.overflow = 'hidden'; }
function closeOverlay(id) { $(id).classList.remove('open'); document.body.style.overflow = ''; }

/* ──────────────────────────────────────────────────────────────
   LOADING STATE
────────────────────────────────────────────────────────────── */

function setLoading(on) {
  const container = $('budget-container');
  if (!container) return;
  if (on) {
    container.innerHTML = Array(3).fill(0).map(() => `
      <div class="budget-card" style="opacity:0.5;pointer-events:none;">
        <div style="height:18px;border-radius:6px;background:rgba(56,189,248,0.06);margin-bottom:16px;animation:shimmerBtn 1.4s infinite linear;"></div>
        <div style="height:12px;border-radius:6px;background:rgba(56,189,248,0.04);margin-bottom:12px;width:60%;animation:shimmerBtn 1.4s infinite linear;"></div>
        <div style="height:8px;border-radius:4px;background:rgba(56,189,248,0.06);animation:shimmerBtn 1.4s infinite linear;"></div>
      </div>`).join('');
  }
}

/* ──────────────────────────────────────────────────────────────
   SIDEBAR
────────────────────────────────────────────────────────────── */

function bindSidebar() { /* hamburger wired via onclick in HTML */ }
function toggleSidebar() {
  const sidebar = $('sidebar');
  const overlay = $('sidebar-overlay');
  if (!sidebar) return;
  const open = sidebar.classList.toggle('open');
  if (overlay) overlay.classList.toggle('show', open);
}
/* ════════════════════════════════════════════════════════════════
   RENDER — SIDEBAR PROFILE
════════════════════════════════════════════════════════════════ */
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
/* ──────────────────────────────────────────────────────────────
   PAGE TRANSITIONS
────────────────────────────────────────────────────────────── */

document.addEventListener('click', function(e) {
  const link = e.target.closest('a[href]');
  if (!link) return;
  const href = link.getAttribute('href');
  if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('//')) return;
  e.preventDefault();
  document.body.classList.add('page-exit');
  setTimeout(() => { window.location.href = href; }, 190);
});

/* ──────────────────────────────────────────────────────────────
   TOAST
────────────────────────────────────────────────────────────── */

function showToast(type, title, msg) {
  let container = $('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <div class="toast-icon-wrap">${icons[type] || icons.info}</div>
    <div class="toast-body">
      <div class="toast-title">${escHtml(title)}</div>
      <div class="toast-msg">${escHtml(msg)}</div>
    </div>
    <div class="toast-bar"></div>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity   = '0';
    toast.style.transform = 'translateX(320px)';
    toast.style.transition = 'opacity 0.3s,transform 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

/* ──────────────────────────────────────────────────────────────
   PARTICLES
────────────────────────────────────────────────────────────── */

function buildParticles() {
  const canvas = $('particle-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H, particles;
  function resize() { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; }
  function init() {
    particles = Array.from({ length: Math.floor((W * H) / 22000) }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      r: Math.random() * 1.2 + 0.3,
      vx: (Math.random() - 0.5) * 0.18, vy: (Math.random() - 0.5) * 0.18,
      a: Math.random() * 0.5 + 0.1
    }));
  }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(56,189,248,${p.a})`; ctx.fill();
    });
    requestAnimationFrame(draw);
  }
  resize(); init(); draw();
  window.addEventListener('resize', () => { resize(); init(); });
}

/* ──────────────────────────────────────────────────────────────
   UTILS
────────────────────────────────────────────────────────────── */

function shake(el) {
  el.style.borderColor = 'rgba(244,63,94,0.7)';
  el.style.boxShadow   = '0 0 0 3px rgba(244,63,94,0.15)';
  setTimeout(() => { el.style.borderColor = ''; el.style.boxShadow = ''; el.focus(); }, 600);
}

// Start particles after DOM ready
document.addEventListener('DOMContentLoaded', buildParticles);