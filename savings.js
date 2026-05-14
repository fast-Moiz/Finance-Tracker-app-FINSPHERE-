// ■ FinSphere — Savings Goals
// Fully API-driven; replaces the local goals[] array.

const API_BASE = 'http://localhost:3000/api';

// ── Auth token (same pattern as your other pages) ────────────
function getToken() {
  return localStorage.getItem('finsphere_token') || sessionStorage.getItem('finsphere_token');
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getToken()}`
  };
}

// ── Toast notification ────────────────────────────────────────
function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.style.display = 'block';
  toast.style.background = type === 'success'
    ? 'rgba(56,189,248,0.15)'
    : 'rgba(248,113,113,0.15)';
  toast.style.color     = type === 'success' ? 'var(--cyan)' : '#f87171';
  toast.style.border    = `1px solid ${type === 'success' ? 'rgba(56,189,248,0.3)' : 'rgba(248,113,113,0.3)'}`;
  toast.style.padding   = '12px 20px';
  toast.style.borderRadius = '10px';
  toast.style.marginBottom  = '20px';
  toast.style.fontSize  = '14px';
  toast.style.fontWeight = '500';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.display = 'none'; }, 3500);
}

// ── Render goals grid ─────────────────────────────────────────
function renderGoals(goals) {
  const container = document.getElementById('goals-container');
  const empty     = document.getElementById('goals-empty');

  if (!goals || goals.length === 0) {
    container.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  container.innerHTML = goals.map(g => {
    const pct        = Math.min(Math.round((g.savedAmount / g.targetAmount) * 100), 100);
    const deg        = (pct / 100) * 360;
    const remaining  = Math.max(g.targetAmount - g.savedAmount, 0).toFixed(2);
    const isComplete = pct >= 100;

    // Format deadline nicely
    const deadlineDate = new Date(g.deadline);
    const deadlineStr  = deadlineDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

    // Days remaining
    const today     = new Date();
    const diffMs    = deadlineDate - today;
    const diffDays  = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    const daysLabel = isComplete
      ? '<span style="color:#4ade80;font-size:11px;">✓ Completed</span>'
      : diffDays < 0
        ? `<span style="color:#f87171;font-size:11px;">Overdue by ${Math.abs(diffDays)}d</span>`
        : diffDays <= 30
          ? `<span style="color:#fb923c;font-size:11px;">${diffDays}d left</span>`
          : `<span style="color:var(--text-500);font-size:11px;">${diffDays}d left</span>`;

    const ringColor = isComplete ? '#4ade80' : 'var(--cyan)';

    return `
      <div class="goal-card" data-id="${g.id}">
        <div class="g-header">
          <div>
            <div class="g-title">${escapeHtml(g.name)}</div>
            <div class="g-date">Deadline: ${deadlineStr}</div>
            <div style="margin-top:4px;">${daysLabel}</div>
          </div>
          <div style="display:flex;gap:8px;align-items:flex-start;">
            <button class="icon-btn" title="Edit goal" onclick="openEditModal(${g.id})">
              <i class="fa fa-pen" style="font-size:12px;"></i>
            </button>
            <button class="icon-btn danger" title="Delete goal" onclick="deleteGoal(${g.id}, '${escapeHtml(g.name)}')">
              <i class="fa fa-trash" style="font-size:12px;"></i>
            </button>
          </div>
        </div>

        <div class="g-progress-ring"
             style="background: conic-gradient(${ringColor} ${deg}deg, rgba(255,255,255,0.05) 0deg)">
          <div class="g-pct" style="${isComplete ? 'color:#4ade80' : ''}">${pct}%</div>
        </div>

        <div class="g-amounts">
          <strong style="color:var(--text-100);">$${g.savedAmount.toFixed(2)}</strong>
          <span style="color:var(--text-500);"> / $${g.targetAmount.toFixed(2)}</span>
          ${!isComplete ? `<div style="font-size:12px;margin-top:4px;color:var(--text-500);">$${remaining} to go</div>` : ''}
        </div>

        ${isComplete
          ? `<div style="text-align:center;padding:10px;color:#4ade80;font-weight:600;font-size:14px;">🎉 Goal Reached!</div>`
          : `<button class="g-add-btn" onclick="openFundsModal(${g.id}, '${escapeHtml(g.name)}')">+ Add Funds</button>`
        }
      </div>
    `;
  }).join('');
}

// ── XSS guard ─────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Fetch & render all goals ──────────────────────────────────
async function loadGoals() {
  const loading   = document.getElementById('goals-loading');
  const container = document.getElementById('goals-container');
  loading.style.display   = 'block';
  container.innerHTML     = '';
  document.getElementById('goals-empty').style.display = 'none';

  try {
    const res  = await fetch(`${API_BASE}/savings`, { headers: authHeaders() });
    const data = await res.json();

    if (!res.ok) throw new Error(data.message || 'Failed to load goals.');
    renderGoals(data.goals);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    loading.style.display = 'none';
  }
}

// ── CREATE / EDIT MODAL ───────────────────────────────────────
let editingGoalId = null;

function openGoalModal() {
  editingGoalId = null;
  document.getElementById('modal-title').textContent      = 'Create Goal';
  document.getElementById('modal-submit-btn').textContent = 'Save Goal';
  document.getElementById('g-name').value   = '';
  document.getElementById('g-target').value = '';
  document.getElementById('g-date').value   = '';
  document.getElementById('modal-error').style.display = 'none';

  // Set min date to tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  document.getElementById('g-date').min = tomorrow.toISOString().split('T')[0];

  document.getElementById('goal-modal').classList.add('open');
}

function openEditModal(id) {
  // Find goal data from DOM data attributes would need a refetch,
  // so we read from the rendered card
  const card = document.querySelector(`.goal-card[data-id="${id}"]`);
  if (!card) return;

  editingGoalId = id;
  document.getElementById('modal-title').textContent      = 'Edit Goal';
  document.getElementById('modal-submit-btn').textContent = 'Update Goal';
  document.getElementById('modal-error').style.display   = 'none';

  // Pre-fill from card text (simple approach)
  document.getElementById('g-name').value = card.querySelector('.g-title').textContent;

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  document.getElementById('g-date').min = tomorrow.toISOString().split('T')[0];

  document.getElementById('goal-modal').classList.add('open');
}

function closeGoalModal() {
  document.getElementById('goal-modal').classList.remove('open');
  editingGoalId = null;
}

async function saveGoal() {
  const name   = document.getElementById('g-name').value.trim();
  const target = document.getElementById('g-target').value;
  const date   = document.getElementById('g-date').value;
  const errEl  = document.getElementById('modal-error');

  errEl.style.display = 'none';

  // Client-side validation
  if (!name) {
    errEl.textContent = 'Please enter a goal name.';
    errEl.style.display = 'block';
    return;
  }
  if (!editingGoalId && (!target || parseFloat(target) <= 0)) {
    errEl.textContent = 'Please enter a valid target amount.';
    errEl.style.display = 'block';
    return;
  }
  if (!editingGoalId && !date) {
    errEl.textContent = 'Please select a deadline.';
    errEl.style.display = 'block';
    return;
  }

  const btn = document.getElementById('modal-submit-btn');
  btn.disabled    = true;
  btn.textContent = 'Saving...';

  try {
    let res, data;

    if (editingGoalId) {
      // EDIT — only send changed fields
      const body = { name };
      if (target) body.target_amount = parseFloat(target);
      if (date)   body.deadline      = date;

      res  = await fetch(`${API_BASE}/savings/${editingGoalId}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(body)
      });
    } else {
      // CREATE
      res = await fetch(`${API_BASE}/savings`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ name, target_amount: parseFloat(target), deadline: date })
      });
    }

    data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Something went wrong.');

    closeGoalModal();
    showToast(data.message);
    await loadGoals();
  } catch (err) {
    errEl.textContent   = err.message;
    errEl.style.display = 'block';
  } finally {
    btn.disabled    = false;
    btn.textContent = editingGoalId ? 'Update Goal' : 'Save Goal';
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

// ── ADD FUNDS MODAL ───────────────────────────────────────────
let fundingGoalId = null;

function openFundsModal(id, name) {
  fundingGoalId = id;
  document.getElementById('funds-goal-name').textContent = `Adding funds to: ${name}`;
  document.getElementById('funds-amount').value          = '';
  document.getElementById('funds-error').style.display   = 'none';
  document.getElementById('funds-modal').classList.add('open');
}

function closeFundsModal() {
  document.getElementById('funds-modal').classList.remove('open');
  fundingGoalId = null;
}

async function submitFunds() {
  const amount = parseFloat(document.getElementById('funds-amount').value);
  const errEl  = document.getElementById('funds-error');
  errEl.style.display = 'none';

  if (isNaN(amount) || amount <= 0) {
    errEl.textContent   = 'Please enter a valid amount.';
    errEl.style.display = 'block';
    return;
  }

  try {
    const res  = await fetch(`${API_BASE}/savings/${fundingGoalId}/funds`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ amount })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to add funds.');

    closeFundsModal();
    showToast(data.message);
    await loadGoals();
  } catch (err) {
    errEl.textContent   = err.message;
    errEl.style.display = 'block';
  }
}

// ── DELETE ────────────────────────────────────────────────────
async function deleteGoal(id, name) {
  try {
    const res  = await fetch(`${API_BASE}/savings/${id}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to delete goal.');

    showToast(data.message);
    await loadGoals();
  } catch (err) {
    showToast(err.message, 'error');
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
  loadGoals();
});