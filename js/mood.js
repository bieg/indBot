let _canvas, _ctx, _micDot, _particles = [], _vigAlpha = 0, _vigMode = null;

class Particle {
  constructor(mood) {
    const w = _canvas.width, h = _canvas.height;
    this.mood = mood;
    if (mood === 'light') {
      this.x = -40; this.y = h * (0.1 + Math.random() * 0.8);
      this.vx = 3 + Math.random() * 4; this.vy = (Math.random() - 0.5) * 0.8;
      this.r = 1.5 + Math.random() * 3.5; this.life = 1; this.decay = 0.003 + Math.random() * 0.004;
    } else {
      this.x = Math.random() * w; this.y = Math.random() * h;
      this.vx = (Math.random() - 0.5) * 3; this.vy = (Math.random() - 0.5) * 3;
      this.r = 2 + Math.random() * 5; this.life = 1; this.decay = 0.015 + Math.random() * 0.02;
    }
  }
}

export function initMood() {
  _canvas = document.getElementById('mood-canvas');
  _ctx = _canvas.getContext('2d');
  _micDot = document.getElementById('mic-dot');
  const resize = () => { _canvas.width = window.innerWidth; _canvas.height = window.innerHeight; };
  resize(); window.addEventListener('resize', resize);
}

export function setMicActive(on) {
  if (!_micDot) return;
  _micDot.style.background = on ? '#ff4444' : 'rgba(255,255,255,0.2)';
  _micDot.style.boxShadow  = on ? '0 0 6px 2px rgba(255,60,60,0.6)' : 'none';
}

export function triggerDark() {
  for (let i = 0; i < 50; i++) _particles.push(new Particle('dark'));
  _vigAlpha = 0.65; _vigMode = 'dark';
}

export function triggerLight() {
  for (let i = 0; i < 60; i++) setTimeout(() => _particles.push(new Particle('light')), i * 35);
  _vigAlpha = 0.25; _vigMode = 'light';
}

export function updateMood() {
  if (!_ctx) return;
  const w = _canvas.width, h = _canvas.height;
  _ctx.clearRect(0, 0, w, h);

  if (_vigAlpha > 0.005) {
    if (_vigMode === 'dark') {
      const g = _ctx.createRadialGradient(w/2, h/2, h*0.25, w/2, h/2, h*0.9);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(90,0,10,${_vigAlpha})`);
      _ctx.fillStyle = g; _ctx.fillRect(0, 0, w, h);
    } else {
      const g = _ctx.createRadialGradient(w/2, h/2, 0, w/2, h/2, h*0.55);
      g.addColorStop(0, `rgba(255,220,100,${_vigAlpha * 0.35})`); g.addColorStop(1, 'rgba(255,200,60,0)');
      _ctx.fillStyle = g; _ctx.fillRect(0, 0, w, h);
    }
    _vigAlpha *= 0.94;
  }

  for (let i = _particles.length - 1; i >= 0; i--) {
    const p = _particles[i];
    p.x += p.vx; p.y += p.vy; p.life -= p.decay;
    if (p.life <= 0 || p.x > w + 80) { _particles.splice(i, 1); continue; }
    if (p.mood === 'light') {
      _ctx.beginPath(); _ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
      _ctx.fillStyle = `rgba(255,220,80,${p.life * 0.9})`; _ctx.fill();
      if (p.r > 2.5) {
        const arm = p.r * 2.2;
        _ctx.strokeStyle = `rgba(255,245,160,${p.life * 0.5})`; _ctx.lineWidth = 0.8;
        _ctx.beginPath();
        _ctx.moveTo(p.x-arm,p.y); _ctx.lineTo(p.x+arm,p.y);
        _ctx.moveTo(p.x,p.y-arm); _ctx.lineTo(p.x,p.y+arm); _ctx.stroke();
      }
    } else {
      const g = _ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r*4);
      g.addColorStop(0, `rgba(60,0,80,${p.life*0.7})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      _ctx.fillStyle = g; _ctx.beginPath(); _ctx.arc(p.x, p.y, p.r*4, 0, Math.PI*2); _ctx.fill();
    }
  }
}

