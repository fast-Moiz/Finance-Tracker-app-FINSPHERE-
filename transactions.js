/* ================================================================
   FINSPHERE — Transactions Page  |  Full Frontend Logic
   Works with: transactions.html + transactions.css
   Backend: Node.js + MySQL via /api/transactions (JWT protected)
================================================================ */

'use strict';

/* ── API CONFIG ─────────────────────────────────────────────── */
const API   = 'http://localhost:3000/api/transactions';
const token = localStorage.getItem('finsphere_token');
const user  = JSON.parse(localStorage.getItem('finsphere_user') || 'null');

/* ── CATEGORY META ──────────────────────────────────────────── */
const CAT_META = {
  salary:     { icon: '💼', label: 'Salary' },
  freelance:  { icon: '💻', label: 'Freelance' },
  investment: { icon: '📈', label: 'Investment' },
  food:       { icon: '🍽️', label: 'Food & Dining' },
  transport:  { icon: '🚗', label: 'Transport' },
  shopping:   { icon: '🛍️', label: 'Shopping' },
  health:     { icon: '🏥', label: 'Health' },
  utilities:  { icon: '⚡', label: 'Utilities' },
  entertain:  { icon: '🎬', label: 'Entertainment' },
  travel:     { icon: '✈️', label: 'Travel' },
  other:      { icon: '📦', label: 'Other' },
};

/* ── STATE ─────────────────────────────────────────────────── */
let state = {
  transactions: [],
  filtered:     [],
  currentPage:  1,
  perPage:      8,
  sortCol:      'date',
  sortDir:      'desc',
  editingId:    null,
  deletingId:   null,
  searchQ:      '',
  filterType:   'all',
  filterCat:    'all',
  filterStatus: 'all',
  dateFrom:     '',
  dateTo:       '',
  loading:      false,
};

/* ── HELPERS ────────────────────────────────────────────────── */
function $(id)         { return document.getElementById(id); }
function fmt(n)        { return '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtDate(d)    {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function escHtml(s)    { return String(s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

/* ── INIT ───────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  if (!token) {
    showToast('error', 'Session Expired', 'Please log in again.');
    setTimeout(() => { window.location.href = 'login.html'; }, 1500);
    return;
  }

  // Fetch fresh user from API for profile
  let profileUser = user; // fallback to localStorage user
  try {
    const res = await fetch('http://localhost:3000/api/auth/me', {
      headers: { Authorization: 'Bearer ' + token }
    });
    if (res.ok) profileUser = await res.json();
  } catch (_) {}

  if (!profileUser) profileUser = { full_name: 'Guest' };
  renderProfile(profileUser);

  buildParticles();
  bindSidebar();
  bindTopbarSearch();
  bindFilters();
  bindModal();
  bindConfirmModal();
  fetchTransactions();
});

/* ──────────────────────────────────────────────────────────────
   DATA LAYER  (CRUD)
────────────────────────────────────────────────────────────── */

async function fetchTransactions() {
  setLoading(true);
  try {
    const res  = await fetch(API, { headers: authHeaders() });

    // Parse body first so we can show the real server message
    const data = await res.json();

    if (res.status === 401 || res.status === 403) {
      showToast('error', 'Session Expired', 'Your session has expired. Redirecting to login…');
      setTimeout(() => { window.location.href = 'login.html'; }, 1800);
      return;
    }

    if (!res.ok) {
      throw new Error(data.message || `Server error (${res.status})`);
    }

    state.transactions = (data.transactions || []).map(t => ({
      id:       t.id,
      merchant: t.merchant,
      desc:     t.desc || '',
      category: t.category,
      type:     t.type,
      amount:   Number(t.amount),
      status:   t.status,
      date:     t.date,
      time:     t.time || '',
    }));

    applyFilters();
  } catch (err) {
    console.error('Fetch error:', err);
    showToast('error', 'Connection Error', err.message || 'Could not load transactions from server.');
  } finally {
    setLoading(false);
  }
}

async function createTransaction(payload) {
  const res  = await fetch(API, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body:    JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `Server error (${res.status})`);
  return data;
}

async function updateTransaction(id, payload) {
  const res  = await fetch(`${API}/${id}`, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body:    JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `Server error (${res.status})`);
  return data;
}

async function deleteTransaction(id) {
  const res  = await fetch(`${API}/${id}`, {
    method:  'DELETE',
    headers: authHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `Server error (${res.status})`);
  return data;
}

function authHeaders() {
  return token ? { Authorization: 'Bearer ' + token } : {};
}

/* ──────────────────────────────────────────────────────────────
   FILTERS & SORT
────────────────────────────────────────────────────────────── */

function applyFilters() {
  let list = [...state.transactions];

  const q = state.searchQ.toLowerCase();
  if (q) list = list.filter(t =>
    t.merchant.toLowerCase().includes(q) ||
    t.desc.toLowerCase().includes(q)
  );

  if (state.filterType   !== 'all') list = list.filter(t => t.type     === state.filterType);
  if (state.filterCat    !== 'all') list = list.filter(t => t.category === state.filterCat);
  if (state.filterStatus !== 'all') list = list.filter(t => t.status   === state.filterStatus);
  if (state.dateFrom) list = list.filter(t => t.date >= state.dateFrom);
  if (state.dateTo)   list = list.filter(t => t.date <= state.dateTo);

  /* Sort */
  list.sort((a, b) => {
    let av = a[state.sortCol], bv = b[state.sortCol];
    if (state.sortCol === 'amount') { av = Number(av); bv = Number(bv); }
    if (state.sortCol === 'date')   { av = av + (a.time || ''); bv = bv + (b.time || ''); }
    if (av < bv) return state.sortDir === 'asc' ? -1 :  1;
    if (av > bv) return state.sortDir === 'asc' ?  1 : -1;
    return 0;
  });

  state.filtered     = list;
  state.currentPage  = 1;
  renderSummary(list);
  renderTable();
}

function sortByCol(col) {
  if (state.sortCol === col) {
    state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    state.sortCol = col;
    state.sortDir = col === 'date' ? 'desc' : 'asc';
  }
  applyFilters();

  /* Update header icons */
  document.querySelectorAll('th.sortable').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset.col === col) {
      th.classList.add('sort-' + state.sortDir);
      const icon = th.querySelector('.sort-icon');
      if (icon) icon.className = `fa fa-sort-${state.sortDir === 'asc' ? 'up' : 'down'} sort-icon`;
    } else {
      const icon = th.querySelector('.sort-icon');
      if (icon) icon.className = 'fa fa-sort sort-icon';
    }
  });
}

/* ──────────────────────────────────────────────────────────────
   RENDER
────────────────────────────────────────────────────────────── */

function renderSummary(list) {
  const income = list
    .filter(t => t.type === 'income' && t.status === 'completed')
    .reduce((s, t) => s + t.amount, 0);
  const expense = list
    .filter(t => t.type === 'expense' && t.status === 'completed')
    .reduce((s, t) => s + t.amount, 0);
  const balance = income - expense;

  animateNumber($('summary-income'),  income);
  animateNumber($('summary-expense'), expense);
  animateNumber($('summary-balance'), balance);
}

function animateNumber(el, target) {
  if (!el) return;
  const start   = 0;
  const dur     = 600;
  const t0      = performance.now();
  const prefix  = target < 0 ? '-$' : '$';
  const abs     = Math.abs(target);

  function tick(now) {
    const progress = Math.min((now - t0) / dur, 1);
    const ease     = 1 - Math.pow(1 - progress, 3);
    const val      = abs * ease;
    el.textContent = prefix + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function renderTable() {
  const tbody   = $('txn-tbody');
  const empty   = $('empty-state');
  const wrap    = $('txn-table-wrap');
  const metaTop = $('pagination-meta');

  const { filtered, currentPage, perPage } = state;
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const page  = Math.min(currentPage, pages);
  state.currentPage = page;

  const start = (page - 1) * perPage;
  const slice = filtered.slice(start, start + perPage);

  /* Meta label */
  const metaText = total === 0
    ? 'No results'
    : `Showing ${start + 1}–${Math.min(start + perPage, total)} of ${total} transaction${total !== 1 ? 's' : ''}`;
  if (metaTop) metaTop.textContent = metaText;

  /* Empty state */
  if (total === 0) {
    wrap.style.display  = 'none';
    empty.style.display = 'flex';
    $('pagination').style.display = 'none';
    return;
  }
  wrap.style.display  = '';
  empty.style.display = 'none';
  $('pagination').style.display = '';

  /* Rows */
  tbody.innerHTML = slice.map((t, i) => {
    const cat  = CAT_META[t.category] || CAT_META.other;
    const sign = t.type === 'income' ? '+' : '−';
    return `
    <tr style="animation-delay:${i * 0.04}s" onclick="handleRowClick(${t.id})">
      <td>
        <div class="date-cell">${escHtml(fmtDate(t.date))}</div>
        ${t.time ? `<div class="date-time">${escHtml(t.time.slice(0,5))}</div>` : ''}
      </td>
      <td>
        <div class="merchant-cell">
          <div class="merchant-icon cat-${escHtml(t.category)}">${cat.icon}</div>
          <div class="merchant-info">
            <div class="merchant-name">${escHtml(t.merchant)}</div>
            ${t.desc ? `<div class="merchant-desc">${escHtml(t.desc)}</div>` : ''}
          </div>
        </div>
      </td>
      <td>
        <span class="cat-badge cat-${escHtml(t.category)}">${cat.icon} ${cat.label}</span>
      </td>
      <td style="text-align:right;">
        <span class="amount-cell amount-${escHtml(t.type)}">${sign}${fmt(t.amount)}</span>
      </td>
      <td>
        <span class="status-badge status-${escHtml(t.status)}">${cap(t.status)}</span>
      </td>
      <td>
        <div class="action-btns" onclick="event.stopPropagation()">
          <button class="action-btn action-btn-edit"   title="Edit"   onclick="openEditModal(${t.id})">
            <i class="fa fa-pen"></i>
          </button>
          <button class="action-btn action-btn-delete" title="Delete" onclick="openDeleteConfirm(${t.id})">
            <i class="fa fa-trash"></i>
          </button>
        </div>
      </td>
    </tr>`;
  }).join('');

  renderPagination(page, pages, total, start);
}

function renderPagination(page, pages, total, start) {
  const meta = $('pagination-meta-bottom');
  const btns = $('pagination-btns');

  if (meta) meta.textContent = `Page ${page} of ${pages}`;
  if (!btns) return;

  let html = `<button class="page-btn" onclick="goPage(${page - 1})" ${page <= 1 ? 'disabled' : ''}>
                <i class="fa fa-chevron-left" style="font-size:11px;"></i>
              </button>`;

  const WINDOW = 2;
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || (p >= page - WINDOW && p <= page + WINDOW)) {
      html += `<button class="page-btn${p === page ? ' active' : ''}" onclick="goPage(${p})">${p}</button>`;
    } else if (p === page - WINDOW - 1 || p === page + WINDOW + 1) {
      html += `<button class="page-btn" disabled style="border:none;background:none;color:var(--text-700);">…</button>`;
    }
  }

  html += `<button class="page-btn" onclick="goPage(${page + 1})" ${page >= pages ? 'disabled' : ''}>
             <i class="fa fa-chevron-right" style="font-size:11px;"></i>
           </button>`;
  btns.innerHTML = html;
}

function goPage(p) {
  const pages = Math.ceil(state.filtered.length / state.perPage);
  if (p < 1 || p > pages) return;
  state.currentPage = p;
  renderTable();
  $('txn-table-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function handleRowClick(id) {
  /* Optional: open edit on row click (currently just highlights row) */
}

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

/* ──────────────────────────────────────────────────────────────
   EXPORT CSV
────────────────────────────────────────────────────────────── */

function exportCSV() {
  const rows = [['Date', 'Merchant', 'Description', 'Category', 'Type', 'Amount', 'Status']];
  state.filtered.forEach(t => {
    rows.push([
      t.date, t.merchant, t.desc,
      CAT_META[t.category]?.label || t.category,
      t.type,
      (t.type === 'income' ? '' : '-') + t.amount.toFixed(2),
      t.status
    ]);
  });

  const csv  = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `finsphere-transactions-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('success', 'Export Ready', `${state.filtered.length} transactions exported as CSV.`);
}

/* ──────────────────────────────────────────────────────────────
   MODAL  (Add / Edit)
────────────────────────────────────────────────────────────── */

function bindModal() {
  $('btn-add-txn').addEventListener('click', openAddModal);
  $('modal-close').addEventListener('click', closeModal);
  $('modal-cancel').addEventListener('click', closeModal);
  $('modal-overlay').addEventListener('click', e => { if (e.target === $('modal-overlay')) closeModal(); });
  $('modal-form').addEventListener('submit', handleFormSubmit);
  $('modal-submit-btn').addEventListener('click', () => {
    $('modal-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  });

  /* Type toggle radios */
  document.querySelectorAll('.type-opt').forEach(opt => {
    opt.addEventListener('click', () => {
      const val = opt.dataset.value;
      $('modal-type-input').value = val;
      document.querySelectorAll('.type-opt').forEach(o => {
        o.classList.remove('selected-income', 'selected-expense');
      });
      opt.classList.add(`selected-${val}`);
      document.querySelector(`input[name="txn-type"][value="${val}"]`).checked = true;
    });
  });
}

function openAddModal() {
  state.editingId = null;
  $('modal-title').textContent    = 'Add Transaction';
  $('modal-submit-btn').textContent = 'Add Transaction';
  $('modal-form').reset();
  $('modal-type-input').value     = 'expense';
  $('modal-date').value           = new Date().toISOString().slice(0, 10);

  /* Reset toggle */
  document.querySelectorAll('.type-opt').forEach(o => o.classList.remove('selected-income', 'selected-expense'));
  document.querySelector('.type-opt[data-value="expense"]').classList.add('selected-expense');
  document.querySelector('input[name="txn-type"][value="expense"]').checked = true;

  openOverlay('modal-overlay');
  setTimeout(() => $('modal-merchant').focus(), 300);
}

function openEditModal(id) {
  const t = state.transactions.find(x => x.id === id);
  if (!t) return;
  state.editingId = id;

  $('modal-title').textContent    = 'Edit Transaction';
  $('modal-submit-btn').textContent = 'Save Changes';

  $('modal-merchant').value  = t.merchant;
  $('modal-amount').value    = t.amount;
  $('modal-category').value  = t.category;
  $('modal-date').value      = t.date;
  $('modal-status').value    = t.status;
  $('modal-desc').value      = t.desc;
  $('modal-type-input').value = t.type;

  /* Sync toggle */
  document.querySelectorAll('.type-opt').forEach(o => o.classList.remove('selected-income', 'selected-expense'));
  document.querySelector(`.type-opt[data-value="${t.type}"]`)?.classList.add(`selected-${t.type}`);
  const radio = document.querySelector(`input[name="txn-type"][value="${t.type}"]`);
  if (radio) radio.checked = true;

  openOverlay('modal-overlay');
  setTimeout(() => $('modal-merchant').focus(), 300);
}

function closeModal() {
  closeOverlay('modal-overlay');
  state.editingId = null;
}

async function handleFormSubmit(e) {
  e.preventDefault();

  const merchant = $('modal-merchant').value.trim();
  const amount   = parseFloat($('modal-amount').value);
  const txn_date = $('modal-date').value;

  if (!merchant) { shake($('modal-merchant')); return; }
  if (!amount || isNaN(amount) || amount <= 0) { shake($('modal-amount')); return; }
  if (!txn_date) { shake($('modal-date')); return; }

  const payload = {
    merchant,
    desc:     $('modal-desc').value.trim(),
    category: $('modal-category').value,
    type:     $('modal-type-input').value,
    amount,
    status:   $('modal-status').value,
    date:     txn_date,
  };

  const btn = $('modal-submit-btn');
  btn.disabled    = true;
  btn.textContent = state.editingId ? 'Saving…' : 'Adding…';

  try {
    if (state.editingId) {
      await updateTransaction(state.editingId, payload);
      showToast('success', 'Transaction Updated', `"${merchant}" has been updated.`);
    } else {
      await createTransaction(payload);
      showToast('success', 'Transaction Added', `"${merchant}" was added successfully.`);
    }
    closeModal();
    await fetchTransactions();
  } catch (err) {
    console.error(err);
    showToast('error', 'Save Failed', err.message || 'Could not save the transaction. Please try again.');
  } finally {
    btn.disabled = false;
    btn.textContent = state.editingId ? 'Save Changes' : 'Add Transaction';
  }
}

/* ──────────────────────────────────────────────────────────────
   DELETE CONFIRM MODAL
────────────────────────────────────────────────────────────── */

function bindConfirmModal() {
  $('confirm-cancel').addEventListener('click',  closeConfirm);
  $('confirm-delete').addEventListener('click',  executeDelete);
  $('confirm-overlay').addEventListener('click', e => { if (e.target === $('confirm-overlay')) closeConfirm(); });
}

function openDeleteConfirm(id) {
  state.deletingId = id;
  openOverlay('confirm-overlay');
}

function closeConfirm() {
  closeOverlay('confirm-overlay');
  state.deletingId = null;
}

async function executeDelete() {
  if (!state.deletingId) return;
  const id = state.deletingId;
  const t  = state.transactions.find(x => x.id === id);

  const btn = $('confirm-delete');
  btn.disabled    = true;
  btn.textContent = 'Deleting…';

  try {
    await deleteTransaction(id);
    showToast('success', 'Deleted', `"${t?.merchant || 'Transaction'}" was removed.`);
    closeConfirm();
    await fetchTransactions();
  } catch (err) {
    console.error(err);
    showToast('error', 'Delete Failed', 'Could not delete the transaction. Please try again.');
  } finally {
    btn.disabled    = false;
    btn.innerHTML   = '<i class="fa fa-trash" style="margin-right:6px;"></i>Delete';
  }
}

/* ──────────────────────────────────────────────────────────────
   OVERLAY HELPERS
────────────────────────────────────────────────────────────── */

function openOverlay(id) {
  const el = $(id);
  el.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeOverlay(id) {
  const el = $(id);
  el.classList.remove('open');
  document.body.style.overflow = '';
}

/* ──────────────────────────────────────────────────────────────
   FILTER BAR BINDINGS
────────────────────────────────────────────────────────────── */

function bindFilters() {
  const filterSearchInp = $('filter-search-inp');
  if (filterSearchInp) {
    filterSearchInp.addEventListener('input', debounce(e => {
      state.searchQ = e.target.value.trim().toLowerCase();
      applyFilters();
    }, 250));
  }

  const filterType = $('filter-type');
  if (filterType) filterType.addEventListener('change', e => { state.filterType = e.target.value; applyFilters(); });

  const filterCat = $('filter-cat');
  if (filterCat) filterCat.addEventListener('change', e => { state.filterCat = e.target.value; applyFilters(); });

  const filterStatus = $('filter-status');
  if (filterStatus) filterStatus.addEventListener('change', e => { state.filterStatus = e.target.value; applyFilters(); });

  const filterFrom = $('filter-date-from');
  if (filterFrom) filterFrom.addEventListener('change', e => { state.dateFrom = e.target.value; applyFilters(); });

  const filterTo = $('filter-date-to');
  if (filterTo) filterTo.addEventListener('change', e => { state.dateTo = e.target.value; applyFilters(); });

  const clearBtn = $('btn-clear-filters');
  if (clearBtn) clearBtn.addEventListener('click', clearFilters);
}

function clearFilters() {
  state.searchQ      = '';
  state.filterType   = 'all';
  state.filterCat    = 'all';
  state.filterStatus = 'all';
  state.dateFrom     = '';
  state.dateTo       = '';

  const ids = ['filter-search-inp', 'filter-type', 'filter-cat', 'filter-status', 'filter-date-from', 'filter-date-to'];
  ids.forEach(id => { const el = $(id); if (el) el.value = el.tagName === 'SELECT' ? 'all' : ''; });

  applyFilters();
  showToast('success', 'Filters Cleared', 'Showing all transactions.');
}

/* ──────────────────────────────────────────────────────────────
   TOPBAR SEARCH (syncs with filter bar)
────────────────────────────────────────────────────────────── */

function bindTopbarSearch() {
  const inp = $('topbar-search-inp');
  if (!inp) return;
  inp.addEventListener('input', debounce(e => {
    state.searchQ = e.target.value.trim().toLowerCase();
    const filterInp = $('filter-search-inp');
    if (filterInp) filterInp.value = e.target.value;
    applyFilters();
  }, 250));
}

/* ──────────────────────────────────────────────────────────────
   SIDEBAR
────────────────────────────────────────────────────────────── */

function bindSidebar() {
  /* Hamburger is wired inline in HTML via onclick="toggleSidebar()" */
}

function toggleSidebar() {
  const sidebar  = $('sidebar');
  const overlay  = $('sidebar-overlay');
  if (!sidebar) return;
  const open = sidebar.classList.toggle('open');
  if (overlay) overlay.classList.toggle('show', open);
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
/* ──────────────────────────────────────────────────────────────
   PAGE TRANSITIONS
────────────────────────────────────────────────────────────── */

document.addEventListener('click', function (e) {
  const link = e.target.closest('a[href]');
  if (!link) return;
  const href = link.getAttribute('href');
  if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('//') || href.startsWith('mailto')) return;
  e.preventDefault();
  document.body.classList.add('page-exit');
  setTimeout(() => { window.location.href = href; }, 190);
});
/* ── INIT ───────────────────────────────────────────────────────── */

window.addEventListener('pageshow', e => {
  if (e.persisted) document.body.classList.remove('page-exit');
});

/* ──────────────────────────────────────────────────────────────
   LOADING STATE
────────────────────────────────────────────────────────────── */

function setLoading(on) {
  state.loading = on;
  const tbody = $('txn-tbody');
  const meta  = $('pagination-meta');
  if (on) {
    if (meta) meta.textContent = 'Loading…';
    if (tbody) tbody.innerHTML = Array(4).fill(0).map(() => `
      <tr>
        ${Array(6).fill(0).map(() => `<td><div style="height:18px;border-radius:6px;background:rgba(56,189,248,0.06);animation:shimmerBtn 1.4s infinite linear;"></div></td>`).join('')}
      </tr>`).join('');
  }
}

/* ──────────────────────────────────────────────────────────────
   TOAST NOTIFICATIONS
────────────────────────────────────────────────────────────── */

function showToast(type, title, msg) {
  const container = $('toast-container');
  if (!container) return;

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
    toast.style.transition = 'opacity 0.3s, transform 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

/* ──────────────────────────────────────────────────────────────
   PARTICLES BACKGROUND
────────────────────────────────────────────────────────────── */

function buildParticles() {
  const canvas = $('particle-canvas');
  if (!canvas) return;
  const ctx    = canvas.getContext('2d');
  let W, H, particles;

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function initParticles() {
    const count = Math.floor((W * H) / 22000);
    particles   = Array.from({ length: count }, () => ({
      x:  Math.random() * W,
      y:  Math.random() * H,
      r:  Math.random() * 1.2 + 0.3,
      vx: (Math.random() - 0.5) * 0.18,
      vy: (Math.random() - 0.5) * 0.18,
      a:  Math.random() * 0.5 + 0.1,
    }));
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = W;
      if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H;
      if (p.y > H) p.y = 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(56,189,248,${p.a})`;
      ctx.fill();
    });
    requestAnimationFrame(draw);
  }

  resize();
  initParticles();
  draw();
  window.addEventListener('resize', () => { resize(); initParticles(); });
}

/* ──────────────────────────────────────────────────────────────
   MISC UTILITIES
────────────────────────────────────────────────────────────── */

function debounce(fn, delay) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

function shake(el) {
  el.style.animation = 'none';
  el.style.borderColor = 'rgba(244,63,94,0.7)';
  el.style.boxShadow  = '0 0 0 3px rgba(244,63,94,0.15)';
  setTimeout(() => {
    el.style.animation   = '';
    el.style.borderColor = '';
    el.style.boxShadow   = '';
    el.focus();
  }, 600);
}