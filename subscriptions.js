// Subscriptions Logic
const subs = [
  { id: 1, name: 'Netflix Premium', cycle: 'Monthly', next: '2026-04-20', amount: 22.99, status: 'Active' },
  { id: 2, name: 'Gym Membership', cycle: 'Monthly', next: '2026-04-25', amount: 49.00, status: 'Unused' },
  { id: 3, name: 'Spotify', cycle: 'Monthly', next: '2026-04-12', amount: 13.99, status: 'Active' },
  { id: 4, name: 'Adobe CC', cycle: 'Annual', next: '2026-11-05', amount: 239.88, status: 'Unused' }
];

function renderSubs() {
  document.getElementById('subs-tbody').innerHTML = subs.map(s => {
    const isUnused = s.status === 'Unused';
    const statusClass = isUnused ? 'status-unused' : 'status-completed';
    return `
      <tr>
        <td><div class="sub-name">${s.name}</div></td>
        <td><span class="sub-tag">${s.cycle}</span></td>
        <td class="date-cell">${s.next}</td>
        <td class="amount-cell amount-expense">-$${s.amount}</td>
        <td><span class="status-badge ${statusClass}">${s.status}</span></td>
      </tr>
    `;
  }).join('');
}

document.addEventListener('DOMContentLoaded', renderSubs);