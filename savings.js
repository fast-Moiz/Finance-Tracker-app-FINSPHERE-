// Savings Logic
let goals = [
  { id: 1, name: 'Emergency Fund', saved: 5000, target: 10000, date: '2026-12-31' },
  { id: 2, name: 'New Laptop', saved: 800, target: 2500, date: '2026-08-15' }
];

function renderGoals() {
  document.getElementById('goals-container').innerHTML = goals.map(g => {
    const pct = Math.round((g.saved / g.target) * 100);
    const deg = (pct / 100) * 360;
    return `
      <div class="goal-card">
        <div class="g-header">
          <div><div class="g-title">${g.name}</div><div class="g-date">Target: ${g.date}</div></div>
        </div>
        <div class="g-progress-ring" style="background: conic-gradient(var(--cyan) ${deg}deg, rgba(255,255,255,0.05) 0deg)">
          <div class="g-pct">${pct}%</div>
        </div>
        <div class="g-amounts">$${g.saved} / $${g.target}</div>
        <button class="g-add-btn" onclick="addFunds(${g.id})">+ Add Funds</button>
      </div>
    `;
  }).join('');
}

const openGoalModal = () => document.getElementById('goal-modal').classList.add('open');
const closeGoalModal = () => document.getElementById('goal-modal').classList.remove('open');

function saveGoal() {
  const name = document.getElementById('g-name').value;
  const target = parseFloat(document.getElementById('g-target').value);
  const date = document.getElementById('g-date').value;
  if(!name || !target) return;
  goals.push({ id: Date.now(), name, saved: 0, target, date });
  closeGoalModal();
  renderGoals();
}

function addFunds(id) {
  const amount = prompt('Enter amount to add:');
  if(!amount) return;
  const goal = goals.find(g => g.id === id);
  goal.saved += parseFloat(amount);
  renderGoals();
}

document.addEventListener('DOMContentLoaded', renderGoals);