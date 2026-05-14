// ■ FinSphere — Subscriptions
// Fully API-driven; replaces the local subs[] array.

const API_BASE = 'http://localhost:3000/api';

function getToken() {
  return localStorage.getItem('finsphere_token') || sessionStorage.getItem('finsphere_token');
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getToken()}`
  };
}

// ── Toast ─────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  let toast = document.getElementById('fs-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'fs-toast';
    toast.style.cssText = `
      position:fixed;bottom:24px;right:24px;z-index:9999;
      padding:12px 20px;border-radius:10px;font-size:14px;font-weight:500;
      transition:opacity 0.3s;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  toast.style.background = type === 'success' ? 'rgba(56,189,248,0.15)' : 'rgba(248,113,113,0.15)';
  toast.style.color       = type === 'success' ? 'var(--cyan)' : '#f87171';
  toast.style.border      = `1px solid ${type === 'success' ? 'rgba(56,189,248,0.3)' : 'rgba(248,113,113,0.3)'}`;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { toast.style.opacity = '0'; }, 3000);
}

// ── Leakage banner ────────────────────────────────────────────
function updateLeakageBanner(leakage) {
  const banner = document.getElementById('leakage-banner');
  if (!banner) return;
  if (leakage.count === 0) {
    banner.style.display = 'none';
    return;
  }
  banner.style.display = 'flex';
  banner.querySelector('div').innerHTML =
    `<strong>Subscription Leakage Detected:</strong> You have ${leakage.count} unused/paused subscription${leakage.count > 1 ? 's' : ''} costing <strong>$${leakage.monthlyAmount.toFixed(2)}/mo</strong>.`;
}

// ── Render table ──────────────────────────────────────────────
function renderSubs(subs) {
  const tbody = document.getElementById('subs-tbody');
  const empty = document.getElementById('subs-empty');

  if (!subs || subs.length === 0) {
    tbody.innerHTML = '';
    if (empty) empty.style.display = 'table-row';
    return;
  }

  if (empty) empty.style.display = 'none';

  tbody.innerHTML = subs.map(s => {
    const statusClass = s.status === 'unused'    ? 'status-unused'
                      : s.status === 'paused'    ? 'status-unused'
                      : s.status === 'cancelled' ? 'status-unused'
                      : 'status-completed';

    const statusLabel = s.status.charAt(0).toUpperCase() + s.status.slice(1);

    // Highlight upcoming billing (within 7 days)
    const daysUntil = Math.ceil((new Date(s.nextBilling) - new Date()) / (1000 * 60 * 60 * 24));
    const dateStyle = daysUntil >= 0 && daysUntil <= 7
      ? 'color:#fb923c;font-weight:600;'
      : '';

    return `
      <tr>
        <td><div class="sub-name">${escapeHtml(s.name)}</div></td>
        <td><span class="sub-tag">${capitalize(s.cycle)}</span></td>
        <td class="date-cell" style="${dateStyle}">
          ${s.nextBilling}
          ${daysUntil >= 0 && daysUntil <= 7 ? `<span style="font-size:11px;margin-left:6px;color:#fb923c;">(in ${daysUntil}d)</span>` : ''}
        </td>
        <td class="amount-cell amount-expense">-$${s.amount.toFixed(2)}</td>
        <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
        <td style="text-align:right;">
          <button class="icon-btn" title="Edit" onclick="openEditModal(${s.id})" style="margin-right:4px;">
            <i class="fa fa-pen" style="font-size:11px;"></i>
          </button>
          <button class="icon-btn danger" title="Delete" onclick="deleteSub(${s.id}, '${escapeHtml(s.name)}')">
            <i class="fa fa-trash" style="font-size:11px;"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// ── Fetch & render ────────────────────────────────────────────
async function loadSubscriptions() {
  try {
    const res  = await fetch(`${API_BASE}/subscriptions`, { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to load subscriptions.');
    renderSubs(data.subscriptions);
    updateLeakageBanner(data.leakage);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Modal state ───────────────────────────────────────────────
let editingSubId = null;

function openAddModal() {
  editingSubId = null;
  document.getElementById('sub-modal-title').textContent      = 'Add Subscription';
  document.getElementById('sub-modal-submit').textContent     = 'Save';
  document.getElementById('sub-modal-error').style.display   = 'none';
  document.getElementById('sub-name').value        = '';
  document.getElementById('sub-cycle').value       = 'monthly';
  document.getElementById('sub-billing').value     = '';
  document.getElementById('sub-amount').value      = '';
  document.getElementById('sub-status').value      = 'active';
  document.getElementById('sub-modal').classList.add('open');
}

// Store subs in memory so edit modal can pre-fill
let _subsCache = [];

function openEditModal(id) {
  const s = _subsCache.find(x => x.id === id);
  if (!s) return;
  editingSubId = id;
  document.getElementById('sub-modal-title').textContent      = 'Edit Subscription';
  document.getElementById('sub-modal-submit').textContent     = 'Update';
  document.getElementById('sub-modal-error').style.display   = 'none';
  document.getElementById('sub-name').value        = s.name;
  document.getElementById('sub-cycle').value       = s.cycle;
  document.getElementById('sub-billing').value     = s.nextBilling;
  document.getElementById('sub-amount').value      = s.amount;
  document.getElementById('sub-status').value      = s.status;
  document.getElementById('sub-modal').classList.add('open');
}

function closeSubModal() {
  document.getElementById('sub-modal').classList.remove('open');
  editingSubId = null;
}

async function saveSub() {
  const name        = document.getElementById('sub-name').value.trim();
  const cycle       = document.getElementById('sub-cycle').value;
  const next_billing = document.getElementById('sub-billing').value;
  const amount      = document.getElementById('sub-amount').value;
  const status      = document.getElementById('sub-status').value;
  const errEl       = document.getElementById('sub-modal-error');
  const btn         = document.getElementById('sub-modal-submit');

  errEl.style.display = 'none';

  if (!name)         { errEl.textContent = 'Name is required.';          errEl.style.display = 'block'; return; }
  if (!next_billing) { errEl.textContent = 'Billing date is required.';  errEl.style.display = 'block'; return; }
  if (!amount || parseFloat(amount) <= 0) { errEl.textContent = 'Enter a valid amount.'; errEl.style.display = 'block'; return; }

  btn.disabled = true;
  const origText = btn.textContent;
  btn.textContent = 'Saving...';

  try {
    const body = { name, cycle, next_billing, amount: parseFloat(amount), status };
    const url  = editingSubId ? `${API_BASE}/subscriptions/${editingSubId}` : `${API_BASE}/subscriptions`;
    const method = editingSubId ? 'PUT' : 'POST';

    const res  = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Something went wrong.');

    closeSubModal();
    showToast(data.message);
    await loadSubscriptions();
  } catch (err) {
    errEl.textContent   = err.message;
    errEl.style.display = 'block';
  } finally {
    btn.disabled    = false;
    btn.textContent = origText;
  }
}

async function deleteSub(id, name) {
  try {
    const res  = await fetch(`${API_BASE}/subscriptions/${id}`, { method: 'DELETE', headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to delete.');
    showToast(data.message);
    await loadSubscriptions();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Helpers ───────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function capitalize(str) { return str.charAt(0).toUpperCase() + str.slice(1); }

// Patch loadSubscriptions to cache subs
const _origLoad = loadSubscriptions;
async function loadSubscriptions() {
  try {
    const res  = await fetch(`${API_BASE}/subscriptions`, { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to load subscriptions.');
    _subsCache = data.subscriptions;
    renderSubs(data.subscriptions);
    updateLeakageBanner(data.leakage);
  } catch (err) {
    showToast(err.message, 'error');
  }
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
// ── Init ──────────────────────────────────────────────────────
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
  loadSubscriptions();
});