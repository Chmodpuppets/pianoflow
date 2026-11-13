// Attract-mode background for the welcome screen: glowing falling notes over a
// stylized keyboard, echoing the in-game playfield. Self-contained (own rAF),
// returns a stop() so the router can pause it when leaving the screen.

interface FallNote {
  lane: number; // white-key index
  y: number; // top, css px
  h: number;
  speed: number; // px per second
  color: string;
  glow: string;
}

const RIGHT = '#4ea1ff';
const LEFT = '#59d98e';

function isBlack(pc: number): boolean {
  return pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10;
}

export function startWelcome(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  let raf = 0;
  let running = true;
  let w = 0;
  let h = 0;
  let dpr = 1;
  let keyboardTop = 0;
  let whiteW = 0;
  let whiteCount = 0;
  const notes: FallNote[] = [];
  const pressed = new Map<number, number>(); // lane -> remaining seconds
  let spawnAcc = 0;
  let last = performance.now();

  function resize(): void {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    keyboardTop = h * 0.82;
    // ~52 white keys (a piano octave span repeated) across the width.
    whiteCount = 52;
    whiteW = w / whiteCount;
  }

  function laneX(lane: number): number {
    return lane * whiteW;
  }

  function spawn(): void {
    const lane = Math.floor(Math.random() * whiteCount);
    const right = Math.random() < 0.55;
    notes.push({
      lane,
      y: -80 - Math.random() * 120,
      h: 40 + Math.random() * 70,
      speed: h * (0.22 + Math.random() * 0.2),
      color: right ? RIGHT : LEFT,
      glow: right ? 'rgba(78,161,255,0.85)' : 'rgba(89,217,142,0.85)',
    });
  }

  function roundRect(x: number, y: number, rw: number, rh: number, r: number): void {
    const c = ctx!;
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + rw, y, x + rw, y + rh, r);
    c.arcTo(x + rw, y + rh, x, y + rh, r);
    c.arcTo(x, y + rh, x, y, r);
    c.arcTo(x, y, x + rw, y, r);
    c.closePath();
  }

  function drawKeyboard(): void {
    const c = ctx!;
    const kh = h - keyboardTop;
    // white keys
    for (let i = 0; i < whiteCount; i++) {
      const x = laneX(i);
      const p = pressed.get(i) ?? 0;
      const g = c.createLinearGradient(0, keyboardTop, 0, h);
      if (p > 0) {
        g.addColorStop(0, '#bfe0ff');
        g.addColorStop(1, '#7fb4e8');
      } else {
        g.addColorStop(0, '#e8e8ee');
        g.addColorStop(1, '#b9b9c4');
      }
      c.fillStyle = g;
      c.fillRect(x + 0.5, keyboardTop, whiteW - 1, kh);
    }
    // black keys (pattern per octave of 7 whites)
    const blackAfter = [0, 1, 3, 4, 5]; // white indices within octave that have a black to the right
    for (let i = 0; i < whiteCount; i++) {
      const oct = i % 7;
      if (!blackAfter.includes(oct)) continue;
      const bw = whiteW * 0.62;
      const x = laneX(i) + whiteW - bw / 2;
      const g = c.createLinearGradient(0, keyboardTop, 0, keyboardTop + kh * 0.62);
      g.addColorStop(0, '#2a2a33');
      g.addColorStop(1, '#101016');
      c.fillStyle = g;
      c.fillRect(x, keyboardTop, bw, kh * 0.62);
    }
    // top edge highlight
    c.fillStyle = 'rgba(255,255,255,0.10)';
    c.fillRect(0, keyboardTop, w, 1.5);
  }

  function frame(now: number): void {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const c = ctx!;

    // background
    const bg = c.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#10142a');
    bg.addColorStop(0.6, '#0a0d18');
    bg.addColorStop(1, '#070a12');
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);

    // ambient wash near the strike line
    const wash = c.createRadialGradient(w / 2, keyboardTop, 0, w / 2, keyboardTop, w * 0.7);
    wash.addColorStop(0, 'rgba(78,161,255,0.10)');
    wash.addColorStop(1, 'rgba(78,161,255,0)');
    c.fillStyle = wash;
    c.fillRect(0, 0, w, h);

    // spawn
    spawnAcc += dt;
    while (spawnAcc > 0.16 && notes.length < 26) {
      spawnAcc -= 0.16;
      spawn();
    }

    // notes
    for (let i = notes.length - 1; i >= 0; i--) {
      const n = notes[i];
      n.y += n.speed * dt;
      const bottom = n.y + n.h;
      if (bottom >= keyboardTop) {
        pressed.set(n.lane, 0.45);
        notes.splice(i, 1);
        continue;
      }
      const x = laneX(n.lane) + whiteW * 0.16;
      const nw = whiteW * 0.68;
      c.save();
      c.shadowColor = n.glow;
      c.shadowBlur = 18;
      const g = c.createLinearGradient(0, n.y, 0, bottom);
      g.addColorStop(0, n.color);
      g.addColorStop(1, n.color);
      c.fillStyle = g;
      c.globalAlpha = 0.95;
      roundRect(x, n.y, nw, n.h, Math.min(6, nw / 2));
      c.fill();
      c.restore();
      // bright core near the bottom
      c.save();
      c.globalAlpha = 0.5;
      c.fillStyle = '#ffffff';
      roundRect(x + nw * 0.25, bottom - 6, nw * 0.5, 4, 2);
      c.fill();
      c.restore();
    }

    // decay pressed glows
    for (const [lane, t] of pressed) {
      const nt = t - dt;
      if (nt <= 0) pressed.delete(lane);
      else pressed.set(lane, nt);
    }

    drawKeyboard();

    // strike-line glow
    c.save();
    c.globalAlpha = 0.5;
    const line = c.createLinearGradient(0, keyboardTop - 10, 0, keyboardTop + 2);
    line.addColorStop(0, 'rgba(255,255,255,0)');
    line.addColorStop(1, 'rgba(255,255,255,0.35)');
    c.fillStyle = line;
    c.fillRect(0, keyboardTop - 10, w, 12);
    c.restore();

    // vignette
    const vig = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.45)');
    c.fillStyle = vig;
    c.fillRect(0, 0, w, h);

    raf = requestAnimationFrame(frame);
  }

  resize();
  window.addEventListener('resize', resize);
  raf = requestAnimationFrame(frame);

  return () => {
    running = false;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
  };
}
