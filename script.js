/**
 * FinSphere Auth — Shared JavaScript
 * Handles: particle canvas, validation, strength meter,
 *          password toggle, ripple, toast, form submit
 */

/* ============================================================
   PARTICLE CANVAS BACKGROUND
   Renders floating nodes and connecting lines
============================================================ */
(function initCanvas() {
  const canvas = document.getElementById('particle-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let W, H, particles;
  const COUNT = 55;
  const MAX_DIST = 130;

  // Color palette for particles
  const COLORS = [
    'rgba(56,189,248,',    // cyan
    'rgba(129,140,248,',   // violet
    'rgba(245,158,11,',    // gold (rare)
  ];

  function randomColor() {
    const idx = Math.random() < 0.15 ? 2 : (Math.random() < 0.5 ? 0 : 1);
    return COLORS[idx];
  }

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function makeParticle() {
    return {
      x:    Math.random() * W,
      y:    Math.random() * H,
      vx:   (Math.random() - 0.5) * 0.35,
      vy:   (Math.random() - 0.5) * 0.35,
      r:    Math.random() * 1.6 + 0.4,
      color: randomColor(),
      pulse: Math.random() * Math.PI * 2,  // phase
    };
  }

  function init() {
    resize();
    particles = Array.from({ length: COUNT }, makeParticle);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Update and draw particles
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.pulse += 0.02;

      // Wrap edges
      if (p.x < -10) p.x = W + 10;
      if (p.x > W + 10) p.x = -10;
      if (p.y < -10) p.y = H + 10;
      if (p.y > H + 10) p.y = -10;

      // Pulsing opacity
      const alpha = 0.45 + Math.sin(p.pulse) * 0.25;

      // Draw dot
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color + alpha + ')';
      ctx.fill();

      // Subtle glow
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 3, 0, Math.PI * 2);
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 3);
      grad.addColorStop(0, p.color + (alpha * 0.4) + ')');
      grad.addColorStop(1, p.color + '0)');
      ctx.fillStyle = grad;
      ctx.fill();
    });

    // Draw connecting lines between close particles
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const a = particles[i], b = particles[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < MAX_DIST) {
          const alpha = (1 - dist / MAX_DIST) * 0.2;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = `rgba(56,189,248,${alpha})`;
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }
      }
    }

    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', () => { resize(); });
  init();
  draw();
})();


/* ============================================================
   DATA-LINE BACKGROUND ELEMENTS
   Generates animated horizontal scan lines
============================================================ */
(function initDataLines() {
  const container = document.querySelector('.data-lines');
  if (!container) return;
  const positions = [12, 25, 38, 55, 68, 80, 92];
  const durations = [9, 12, 7, 14, 10, 8, 11];
  const delays    = [0, -3, -6, -2, -8, -5, -1];

  positions.forEach((top, i) => {
    const line = document.createElement('div');
    line.className = 'data-line';
    line.style.top = top + '%';
    line.style.setProperty('--dur', durations[i] + 's');
    line.style.setProperty('--del', delays[i] + 's');
    container.appendChild(line);
  });
})();


/* ============================================================
   UTILITIES
============================================================ */

/** Set field input state and message */
function setFieldState(input, msgEl, text, state) {
  input.classList.remove('is-error', 'is-valid');
  if (state === 'error') input.classList.add('is-error');
  if (state === 'valid') input.classList.add('is-valid');
  if (msgEl) {
    msgEl.textContent = text;
    msgEl.className = 'field-msg ' + (state === 'error' ? 'err' : state === 'valid' ? 'ok' : '');
  }
}

/** Clear a field's state */
function clearFieldState(input, msgEl) {
  input.classList.remove('is-error', 'is-valid');
  if (msgEl) { msgEl.textContent = ''; msgEl.className = 'field-msg'; }
}

/** Email format check */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** Calculate password strength score (0–5) */
function getPasswordStrength(pw) {
  let s = 0;
  if (pw.length >= 8)           s++;
  if (pw.length >= 12)          s++;
  if (/[A-Z]/.test(pw))        s++;
  if (/[0-9]/.test(pw))        s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}

/** Attach live email validation */
function attachEmailValidation(inputId, msgId) {
  const input = document.getElementById(inputId);
  const msg   = document.getElementById(msgId);
  if (!input) return;
  input.addEventListener('input', () => {
    if (!input.value) { clearFieldState(input, msg); return; }
    if (isValidEmail(input.value)) {
      setFieldState(input, msg, '✓ Valid email address', 'valid');
    } else {
      setFieldState(input, msg, 'Please enter a valid email address', 'error');
    }
  });
}

/** Attach password strength meter */
function attachStrengthMeter(inputId, barsId, textId, msgId) {
  const input = document.getElementById(inputId);
  const barsEl= document.getElementById(barsId);
  const textEl= document.getElementById(textId);
  const msgEl = document.getElementById(msgId);
  if (!input || !barsEl) return;
  const bars  = barsEl.querySelectorAll('.strength-bar');

  input.addEventListener('input', () => {
    const pw    = input.value;
    const score = getPasswordStrength(pw);

    // Reset bar classes
    bars.forEach(b => b.className = 'strength-bar');

    if (!pw) {
      if (textEl) { textEl.textContent = ''; textEl.className = 'strength-text'; }
      clearFieldState(input, msgEl);
      return;
    }

    let tier, cls, label, msg;
    if (score <= 1)      { tier = 1; cls = 'weak';   label = 'Weak';   msg = 'Too simple — add length, numbers or symbols'; }
    else if (score <= 3) { tier = 2; cls = 'fair';   label = 'Fair';   msg = 'Getting stronger, keep going'; }
    else                 { tier = 3; cls = 'strong';  label = 'Strong'; msg = '✓ Great password!'; }

    // Fill bars: 1 bar, 2 bars, or all 4 bars
    const fillCount = [0, 1, 2, 4][tier];
    bars.forEach((b, i) => {
      if (i < fillCount) b.classList.add(cls);
    });

    if (textEl) { textEl.textContent = label; textEl.className = 'strength-text ' + cls; }

    const state = tier >= 3 ? 'valid' : (tier === 2 ? '' : 'error');
    setFieldState(input, msgEl, msg, state || (tier === 2 ? '' : 'error'));

    // For fair state, clear border tinting
    if (tier === 2) { input.classList.remove('is-error', 'is-valid'); }
  });
}

/** Attach show/hide password toggle */
function attachPassToggle(toggleId, inputId) {
  const btn   = document.getElementById(toggleId);
  const input = document.getElementById(inputId);
  if (!btn || !input) return;
  btn.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.innerHTML = show
      ? '<i class="fa-regular fa-eye-slash"></i>'
      : '<i class="fa-regular fa-eye"></i>';
  });
}

/** Ripple effect on button */
function triggerRipple(btn, e) {
  const rect = btn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const r    = document.createElement('span');
  r.className = 'ripple-el';
  r.style.cssText = `
    width:${size}px; height:${size}px;
    left:${e.clientX - rect.left - size/2}px;
    top:${e.clientY  - rect.top  - size/2}px;
  `;
  btn.appendChild(r);
  r.addEventListener('animationend', () => r.remove());
}

/** Loading state on submit button */
function setLoading(btnId, loading, label) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  btn.innerHTML = loading
    ? `<span class="spinner"></span> Verifying…`
    : label;
}

/* ============================================================
   TOAST NOTIFICATION
============================================================ */
function showToast(title, message, type) {
  // Remove existing
  const old = document.getElementById('fs-toast');
  if (old) old.remove();

  const t = document.createElement('div');
  t.id = 'fs-toast';
  t.className = 'toast';
  t.style.borderColor = type === 'success'
    ? 'rgba(16,185,129,0.45)'
    : 'rgba(244,63,94,0.45)';
  t.innerHTML = `
    <div class="toast-icon">${type === 'success' ? '✦' : '⚠'}</div>
    <div class="toast-body">
      <div class="toast-title">${title}</div>
      <div class="toast-msg">${message}</div>
    </div>
    <div class="toast-bar"></div>
  `;
  document.body.appendChild(t);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => t.classList.add('show'));
  });

  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 500);
  }, 4200);
}


/* ============================================================
   LOGIN FORM
============================================================ */
function initLogin() {
  attachEmailValidation('l-email', 'l-email-msg');
  attachPassToggle('l-pass-toggle', 'l-pass');

  // Live password validation
  const lPass    = document.getElementById('l-pass');
  const lPassMsg = document.getElementById('l-pass-msg');
  if (lPass) {
    lPass.addEventListener('input', () => {
      if (!lPass.value) { clearFieldState(lPass, lPassMsg); return; }
      if (lPass.value.length < 6) {
        setFieldState(lPass, lPassMsg, 'Password must be at least 6 characters', 'error');
      } else {
        setFieldState(lPass, lPassMsg, '✓ Password entered', 'valid');
      }
    });
  }

  // Form submit
  const form = document.getElementById('login-form');
  if (!form) return;

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    triggerRipple(document.getElementById('login-btn'), e);

    const email    = document.getElementById('l-email');
    const pass     = document.getElementById('l-pass');
    const emailMsg = document.getElementById('l-email-msg');
    const passMsg  = document.getElementById('l-pass-msg');
    let valid = true;

    // Validate email
    if (!email.value.trim()) {
      setFieldState(email, emailMsg, 'Email address is required', 'error'); valid = false;
    } else if (!isValidEmail(email.value)) {
      setFieldState(email, emailMsg, 'Please enter a valid email', 'error'); valid = false;
    }

    // Validate password
    if (!pass.value) {
      setFieldState(pass, passMsg, 'Password is required', 'error'); valid = false;
    } else if (pass.value.length < 6) {
      setFieldState(pass, passMsg, 'Password is too short', 'error'); valid = false;
    }

    // if (!valid) return;

    // // Simulate API call
    // setLoading('login-btn', true, 'Sign In');
    // setTimeout(() => {
    //   setLoading('login-btn', false, 'Sign In');
    //   showToast('Welcome Back!', 'You\'ve signed in to FinSphere. Redirecting to your dashboard…', 'success');
    // }, 1900);
  });
}


/* ============================================================
   SIGNUP FORM
============================================================ */
function initSignup()
 {
  attachEmailValidation('s-email', 's-email-msg');
  attachPassToggle('s-pass-toggle', 's-pass');
  attachPassToggle('s-conf-toggle', 's-conf');
  attachStrengthMeter('s-pass', 'strength-bars', 'strength-text', 's-pass-msg');

  // Name validation
  const sName    = document.getElementById('s-name');
  const sNameMsg = document.getElementById('s-name-msg');
  if (sName) {
    sName.addEventListener('input', () => {
      if (!sName.value) { clearFieldState(sName, sNameMsg); return; }
      if (sName.value.trim().length < 2) {
        setFieldState(sName, sNameMsg, 'Name must be at least 2 characters', 'error');
      } else {
        setFieldState(sName, sNameMsg, '✓ Looks great!', 'valid');
      }
    });
  }

  // Confirm password
  const sConf    = document.getElementById('s-conf');
  const sConfMsg = document.getElementById('s-conf-msg');
  if (sConf) {
    sConf.addEventListener('input', () => {
      const pw = document.getElementById('s-pass').value;
      if (!sConf.value) { clearFieldState(sConf, sConfMsg); return; }
      if (sConf.value !== pw) {
        setFieldState(sConf, sConfMsg, 'Passwords do not match', 'error');
      } else {
        setFieldState(sConf, sConfMsg, '✓ Passwords match', 'valid');
      }
    });
  }

  // Form submit
  const form = document.getElementById('signup-form');
  if (!form)
     return;

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    triggerRipple(document.getElementById('signup-btn'), e);

    const name     = document.getElementById('s-name');
    const email    = document.getElementById('s-email');
    const pass     = document.getElementById('s-pass');
    const conf     = document.getElementById('s-conf');
    const nameMsg  = document.getElementById('s-name-msg');
    const emailMsg = document.getElementById('s-email-msg');
    const passMsg  = document.getElementById('s-pass-msg');
    const confMsg  = document.getElementById('s-conf-msg');
    let valid = true;

    if (!name.value.trim() || name.value.trim().length < 2) {
      setFieldState(name, nameMsg, 'Please enter your full name', 'error'); valid = false;
    }
    if (!email.value.trim()) {
      setFieldState(email, emailMsg, 'Email address is required', 'error'); valid = false;
    } else if (!isValidEmail(email.value)) {
      setFieldState(email, emailMsg, 'Please enter a valid email', 'error'); valid = false;
    }
    if (!pass.value) {
      setFieldState(pass, passMsg, 'Please create a password', 'error'); valid = false;
    } else if (getPasswordStrength(pass.value) < 2) {
      setFieldState(pass, passMsg, 'Password is too weak — please strengthen it', 'error'); valid = false;
    }
    if (!conf.value) {
      setFieldState(conf, confMsg, 'Please confirm your password', 'error'); valid = false;
    } else if (conf.value !== pass.value) {
      setFieldState(conf, confMsg, 'Passwords do not match', 'error'); valid = false;
    }

    if (!valid) return;

    const firstName = name.value.trim().split(' ')[0];
    setLoading('signup-btn', true, 'Create Account');
    setTimeout(() => {
      setLoading('signup-btn', false, 'Create Account');
      // Account created — redirect to login page
      window.location.href = 'login.html';
    }, 2100);
  });
}


/* ============================================================
   BOOT — detect page and wire up
============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('login-form'))  initLogin();
  if (document.getElementById('signup-form')) initSignup();
});


/* ============================================================
   SMOOTH PAGE TRANSITIONS
   Intercept internal link clicks — fade out, then navigate
============================================================ */
document.addEventListener('click', function (e) {
  const link = e.target.closest('a[href]');
  if (!link) return;
  const href = link.getAttribute('href');
  if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('//') || href.startsWith('mailto')) return;
  e.preventDefault();
  document.body.classList.add('page-exit');
  setTimeout(() => { window.location.href = href; }, 190);
});

window.addEventListener('pageshow', function (e) {
  if (e.persisted) document.body.classList.remove('page-exit');
});
