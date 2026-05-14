// Budgets Logic
let budgets = [
  { id: 1, category: 'Housing', icon: '🏠', color: 'var(--cyan)', spent: 1200, limit: 1500 },
  { id: 2, category: 'Food', icon: '🍔', color: 'var(--gold)', spent: 450, limit: 500 },
  { id: 3, category: 'Transport', icon: '🚗', color: 'var(--violet)', spent: 300, limit: 250 }
];

function renderBudgets() {
  const container = document.getElementById('budget-container');
  let totalL = 0, totalS = 0;
  
  container.innerHTML = budgets.map(b => {
    totalL += b.limit; totalS += b.spent;
    const pct = Math.min((b.spent / b.limit) * 100, 100);
    const isOver = b.spent > b.limit;
    const barColor = isOver ? 'var(--error)' : b.color;
    
    return `
      <div class="budget-card">
        <div class="b-card-header">
          <div class="b-cat-info">
            <div class="b-icon" style="background:rgba(255,255,255,0.05); color:${b.color}">${b.icon}</div>
            <div class="b-name">${b.category}</div>
          </div>
          <div class="b-status" style="background:${isOver ? 'rgba(244,63,94,0.1)' : 'rgba(16,185,129,0.1)'}; color:${isOver ? 'var(--error)' : 'var(--success)'}">
            ${isOver ? 'Over Budget' : 'On Track'}
          </div>
        </div>
        <div class="b-amounts">
          <span class="b-spent">$${b.spent}</span>
          <span class="b-limit">of $${b.limit}</span>
        </div>
        <div class="b-bar-track">
          <div class="b-bar-fill" style="width:${pct}%; background:${barColor}"></div>
        </div>
      </div>
    `;
  }).join('');

  document.getElementById('total-budget').textContent = `$${totalL}`;
  document.getElementById('total-spent').textContent = `$${totalS}`;
  document.getElementById('total-remaining').textContent = `$${totalL - totalS}`;
}

const openBudgetModal = () => document.getElementById('budget-modal').classList.add('open');
const closeBudgetModal = () => document.getElementById('budget-modal').classList.remove('open');

function saveBudget() {
  const cat = document.getElementById('b-category').value;
  const limit = parseFloat(document.getElementById('b-limit').value);
  if(!limit) return;
  budgets.push({ id: Date.now(), category: cat, icon: '🏷️', color: 'var(--cyan)', spent: 0, limit });
  closeBudgetModal();
  renderBudgets();
}

document.addEventListener('DOMContentLoaded', renderBudgets);