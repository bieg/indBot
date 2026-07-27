let moodCanvas, moodCtx;
let wordEl, micDot;

let _particles = [];
let _vigAlpha  = 0;
let _vigMode   = null; // 'dark' | 'light'

// ── particle pool ─────────────────────────────────────────────────────────────

class Particle {
  constructor(mood) {
    const w = moodCanvas ? moodCanvas.width  : window.innerWidth;
    const h = moodCanvas ? moodCanvas.height : window.innerHeight;

    if (mood === 'light') {
      // golden sparkle streaming left → right
      this.mood = 'light';
      this.x    = -30 - Math.random() * 60;
      this.y    = h * (0.1 + Math.random() * 0.8);
      this.vx   = 3 + Math.random() * 4;
      this.vy   = (Math.random() - 0.5) * 0.8;
      this.r    = 1.5 + Math.random() * 3.5;
      this.life = 1;
      this.decay = 0.003 + Math.random() * 0.004;
    } else {
      // dark smoke — burst from random points, expands and fades
      this.mood = 'dark';
      this.x    = Math.random() * w;
      this.y    = Math.random() * h;
      this.vx   = (Math.random() - 0.5) * 3;
      this.vy   = (Math.random() - 0.5) * 3;
      this.r    = 2 + Math.random() * 5;
      this.life = 1;
      this.decay = 0.015 + Math.random() * 0.02;
    }
  }
}

// ── public API ────────────────────────────────────────────────────────────────

export function initMood() {
  moodCanvas = document.getElementById('mood-canvas');
  moodCtx    = moodCanvas.getContext('2d');
  wordEl     = document.getElementById('mood-word');
  micDot     = document.getElementById('mic-dot');

  const resize = () => {
    moodCanvas.width  = window.innerWidth;
    moodCanvas.height = window.innerHeight;
  };
  resize();
  window.addEventListener('resize', resize);
}

export function setMicActive(active) {
  if (!micDot) return;
  micDot.style.background = active ? '#ff4444' : 'rgba(255,255,255,0.2)';
  micDot.style.boxShadow  = active ? '0 0 6px 2px rgba(255,60,60,0.6)' : 'none';
}

export function triggerDark(word) {
  // big burst of dark particles
  for (let i = 0; i < 50; i++) _particles.push(new Particle('dark'));
  _vigAlpha = 0.65;
  _vigMode  = 'dark';
  _showWord(word, '#ff3322');
}

export function triggerLight(word) {
  // staggered stream of golden sparkles
  const count = 60;
  for (let i = 0; i < count; i++) {
    setTimeout(() => _particles.push(new Particle('light')), i * 35);
  }
  _vigAlpha = 0.25;
  _vigMode  = 'light';
  _showWord(word, '#ffd76a');
}

export function updateMood() {
  if (!moodCtx) return;
  const w = moodCanvas.width, h = moodCanvas.height;
  moodCtx.clearRect(0, 0, w, h);

  // vignette / glow
  if (_vigAlpha > 0.005) {
    if (_vigMode === 'dark') {
      const g = moodCtx.createRadialGradient(w / 2, h / 2, h * 0.25, w / 2, h / 2, h * 0.9);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(90,0,10,${_vigAlpha})`);
      moodCtx.fillStyle = g;
      moodCtx.fillRect(0, 0, w, h);
    } else {
      const g = moodCtx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, h * 0.55);
      g.addColorStop(0, `rgba(255,220,100,${_vigAlpha * 0.35})`);
      g.addColorStop(1, 'rgba(255,200,60,0)');
      moodCtx.fillStyle = g;
      moodCtx.fillRect(0, 0, w, h);
    }
    _vigAlpha *= 0.94;
  }

  // particles
  for (let i = _particles.length - 1; i >= 0; i--) {
    const p = _particles[i];
    p.x    += p.vx;
    p.y    += p.vy;
    p.life -= p.decay;

    if (p.life <= 0 || p.x > w + 80) {
      _particles.splice(i, 1);
      continue;
    }

    const a = p.life;

    if (p.mood === 'light') {
      // glowing golden dot with cross sparkle
      moodCtx.beginPath();
      moodCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      moodCtx.fillStyle = `rgba(255,220,80,${a * 0.9})`;
      moodCtx.fill();

      if (p.r > 2.5) {
        const arm = p.r * 2.2;
        moodCtx.strokeStyle = `rgba(255,245,160,${a * 0.5})`;
        moodCtx.lineWidth   = 0.8;
        moodCtx.beginPath();
        moodCtx.moveTo(p.x - arm, p.y); moodCtx.lineTo(p.x + arm, p.y);
        moodCtx.moveTo(p.x, p.y - arm); moodCtx.lineTo(p.x, p.y + arm);
        moodCtx.stroke();
      }
    } else {
      // dark smoke puff
      const g = moodCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
      g.addColorStop(0, `rgba(60,0,80,${a * 0.7})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      moodCtx.fillStyle = g;
      moodCtx.beginPath();
      moodCtx.arc(p.x, p.y, p.r * 4, 0, Math.PI * 2);
      moodCtx.fill();
    }
  }
}

// ── internal ──────────────────────────────────────────────────────────────────

function _showWord(word, color) {
  if (!wordEl) return;
  wordEl.textContent  = word.toUpperCase();
  wordEl.style.color  = color;
  wordEl.style.opacity = '1';
  wordEl.style.transform = 'translateX(-50%) scale(1.1)';
  clearTimeout(wordEl._t);
  wordEl._t = setTimeout(() => {
    wordEl.style.opacity   = '0';
    wordEl.style.transform = 'translateX(-50%) scale(1)';
  }, 900);
}
