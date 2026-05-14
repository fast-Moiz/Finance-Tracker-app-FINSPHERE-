/* ================================================================
   FINSPHERE — Dashboard JavaScript
   Handles: particle canvas, sidebar toggle, nav active state,
            sparkline chart, income vs expenses chart, gauge chart
================================================================ */

'use strict';

/* ── Smooth Page Transitions ────────────────────────────────────── */
document.addEventListener('click', function (e) {
  const link = e.target.closest('a[href]');
  if (!link) return;
  const href = link.getAttribute('href');
  // Only intercept same-directory .html links, skip anchors and external
  if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('//') || href.startsWith('mailto')) return;
  e.preventDefault();
  document.body.classList.add('page-exit');
  setTimeout(() => { window.location.href = href; }, 190);
});

// Ensure page is fully visible on back-navigation (bfcache)
window.addEventListener('pageshow', function (e) {
  if (e.persisted) document.body.classList.remove('page-exit');
});

/* ── Sidebar Toggle ─────────────────────────────────────────────── */
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  sidebar.classList.toggle('open');
  overlay.classList.toggle('show');
}

/* ── Nav Active State ───────────────────────────────────────────── */
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', function () {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    this.classList.add('active');
  });
});

/* ── Particle Canvas ────────────────────────────────────────────── */
(function initCanvas() {
  const canvas = document.getElementById('particle-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let W, H, particles;
  const COUNT    = 50;
  const MAX_DIST = 120;
  const COLORS   = ['rgba(56,189,248,', 'rgba(129,140,248,', 'rgba(245,158,11,'];

  function randomColor() {
    const i = Math.random() < 0.12 ? 2 : (Math.random() < 0.5 ? 0 : 1);
    return COLORS[i];
  }

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function makeParticle() {
    return {
      x:     Math.random() * W,
      y:     Math.random() * H,
      vx:    (Math.random() - 0.5) * 0.3,
      vy:    (Math.random() - 0.5) * 0.3,
      r:     Math.random() * 1.4 + 0.4,
      color: randomColor(),
      pulse: Math.random() * Math.PI * 2,
    };
  }

  function init() {
    resize();
    particles = Array.from({ length: COUNT }, makeParticle);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.pulse += 0.02;

      if (p.x < -10)   p.x = W + 10;
      if (p.x > W + 10) p.x = -10;
      if (p.y < -10)   p.y = H + 10;
      if (p.y > H + 10) p.y = -10;

      const a = 0.45 + Math.sin(p.pulse) * 0.2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color + a + ')';
      ctx.fill();
    });

    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const a = particles[i], b = particles[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const d  = Math.sqrt(dx * dx + dy * dy);
        if (d < MAX_DIST) {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = `rgba(56,189,248,${(1 - d / MAX_DIST) * 0.15})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }

    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize);
  init();
  draw();
})();

/* ── Chart.js Global Defaults ───────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function () {

  if (typeof Chart === 'undefined') {
    console.warn('FinSphere Dashboard: Chart.js not loaded.');
    return;
  }

  Chart.defaults.color       = 'rgba(120,155,195,0.6)';
  Chart.defaults.font.family = "'Plus Jakarta Sans', system-ui, sans-serif";
  Chart.defaults.font.size   = 11;

  const gridColor = 'rgba(56,189,248,0.06)';

  /* ── Sparkline (Balance mini chart) ──────────────────────────── */
  (function initSparkline() {
    const el = document.getElementById('sparkline-canvas');
    if (!el) return;
    const ctx = el.getContext('2d');
    new Chart(ctx, {
      type: 'line',
      data: {
        labels:   ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'],
        datasets: [{
          data:        [72400, 75100, 77800, 79200, 80818, 84230],
          borderColor: '#38bdf8',
          borderWidth: 2,
          pointRadius: 0,
          tension:     0.45,
          fill:        true,
          backgroundColor: function (context) {
            const g = context.chart.ctx.createLinearGradient(0, 0, 0, 42);
            g.addColorStop(0, 'rgba(56,189,248,0.25)');
            g.addColorStop(1, 'rgba(56,189,248,0)');
            return g;
          },
        }],
      },
      options: {
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales:  { x: { display: false }, y: { display: false } },
        animation: { duration: 1200 },
      },
    });
  })();

  /* ── Income vs Expenses Bar + Line Chart ─────────────────────── */
  (function initIncomeExpenseChart() {
    const el = document.getElementById('incomeExpenseChart');
    if (!el) return;
    const ctx = el.getContext('2d');
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'],
        datasets: [
          {
            label:           'Income',
            data:            [10800, 11200, 12900, 11480, 11800, 12400],
            backgroundColor: 'rgba(16,185,129,0.7)',
            borderRadius:    6,
            borderSkipped:   false,
          },
          {
            label:           'Expenses',
            data:            [7200, 6800, 8100, 6680, 7200, 6870],
            backgroundColor: 'rgba(244,63,94,0.65)',
            borderRadius:    6,
            borderSkipped:   false,
          },
          {
            label:                'Net Savings',
            type:                 'line',
            data:                 [3600, 4400, 4800, 4800, 4600, 5530],
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
          x: {
            grid:  { color: gridColor },
            ticks: { color: 'rgba(120,155,195,0.5)' },
          },
          y: {
            grid:  { color: gridColor },
            ticks: {
              color:    'rgba(120,155,195,0.5)',
              callback: v => '$' + v.toLocaleString(),
            },
          },
        },
        animation: { duration: 1000, easing: 'easeOutCubic' },
      },
    });
  })();

  /* ── Financial Health Doughnut Gauge ─────────────────────────── */
  (function initGaugeChart() {
    const el = document.getElementById('gaugeChart');
    if (!el) return;
    const ctx = el.getContext('2d');
    new Chart(ctx, {
      type: 'doughnut',
      data: {
        datasets: [{
          data: [78, 22],
          backgroundColor: [
            function (context) {
              const g = context.chart.ctx.createLinearGradient(0, 0, 110, 110);
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
        plugins: {
          legend:  { display: false },
          tooltip: { enabled: false },
        },
        animation: { animateRotate: true, duration: 1400, easing: 'easeOutCubic' },
      },
    });
  })();

}); /* end DOMContentLoaded */
