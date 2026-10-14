// Icy Climb — an Icy Tower–style vertical platformer. Pure HTML5 canvas, no dependencies.
(() => {
  'use strict';

  // ---------- Constants ----------
  const W = 480, H = 640;
  const WALL = 36;              // side wall thickness
  const GAP = 80;               // vertical distance between floors
  const FLOOR_T = 18;           // floor thickness
  const GRAVITY = 0.5;
  const MAX_VX = 9.5;
  const COMBO_TIME = 170;       // frames until a combo expires
  const LEVEL_TIME = 30 * 60;   // speed-up every 30 s
  const MAX_LEVEL = 9;
  const STEP = 1000 / 60;

  const THEMES = [
    { name: 'Ice',      top: '#e6fbff', body: '#7fd6f5', edge: '#2f8fc2', icicles: true },
    { name: 'Wood',     top: '#f1c27d', body: '#b9793a', edge: '#6e4220' },
    { name: 'Stone',    top: '#d6d6d6', body: '#9a9a9a', edge: '#555b66' },
    { name: 'Bubblegum',top: '#ffd3ec', body: '#ff7fc4', edge: '#b83a85' },
    { name: 'Jungle',   top: '#c9f59a', body: '#5fb83a', edge: '#2e6b1d' },
    { name: 'Gold',     top: '#fff4b0', body: '#f2c230', edge: '#a07410' },
    { name: 'Neon',     top: '#b8fff6', body: '#2de2c8', edge: '#7a2df0' },
    { name: 'Lava',     top: '#ffd08a', body: '#ff6a2a', edge: '#8a1d0a' },
  ];

  const RATINGS = [
    [4, 'Good!'], [7, 'Sweet!'], [15, 'Great!'], [25, 'Super!'], [35, 'Wow!'],
    [50, 'Amazing!'], [70, 'Extreme!'], [100, 'Fantastic!'], [140, 'Splendid!'],
    [200, 'No Way!'], [Infinity, 'LEGENDARY!'],
  ];

  // Computer opponent levels
  //  react:     frames it waits after landing before choosing the next jump
  //  maxGain:   how many floors it is willing to jump at once
  //  noise:     randomness in its choices
  //  sloppy:    chance of picking a random (safe but weaker) jump instead of the best one
  //  mistake:   chance of mistiming a jump (may miss the floor)
  //  comboLove: how much it prefers combo jumps (2+ floors)
  const DIFFS = [
    { name: 'Easy',   react: 24, maxGain: 2,  noise: 0.8,  sloppy: 0.5,  mistake: 0.06, comboLove: 0 },
    { name: 'Medium', react: 10, maxGain: 4,  noise: 0.35, sloppy: 0.2,  mistake: 0.03, comboLove: 0.6 },
    { name: 'Hard',   react: 2,  maxGain: 99, noise: 0.05, sloppy: 0,    mistake: 0,    comboLove: 1.5 },
  ];

  const PALETTES = {
    you: { hoodie: '#e8463c', dark: '#c9352d', stripe: '#ffcf3f', hat: '#3a7bff', legs: '#28305a' },
    cpu: { hoodie: '#2fbf71', dark: '#1f8f52', stripe: '#ffffff', hat: '#ff9f1c', legs: '#3b2a1a' },
  };

  // ---------- Helpers ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
  };

  // ---------- Canvas ----------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  function resize() {
    const scale = Math.min(window.innerWidth / W, window.innerHeight / H) * 0.98;
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = Math.floor(W * scale) + 'px';
    canvas.style.height = Math.floor(H * scale) + 'px';
    canvas.width = Math.floor(W * scale * dpr);
    canvas.height = Math.floor(H * scale * dpr);
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    ctx.imageSmoothingEnabled = true;
  }
  window.addEventListener('resize', resize);

  // Pre-rendered tile patterns for background and walls
  function makePattern(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    return ctx.createPattern(c, 'repeat');
  }
  let bgPattern, wallPattern;
  function buildPatterns() {
    bgPattern = makePattern(96, 48, (c, w, h) => {
      c.fillStyle = '#1a2547'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#1f2c55';
      const bw = 48, bh = 24;
      for (let row = 0; row < 2; row++) {
        const off = row ? bw / 2 : 0;
        for (let x = -bw; x < w + bw; x += bw) {
          c.fillRect(x + off + 2, row * bh + 2, bw - 4, bh - 4);
        }
      }
    });
    wallPattern = makePattern(64, 64, (c, w, h) => {
      c.fillStyle = '#3c3f58'; c.fillRect(0, 0, w, h);
      const bh = 32;
      for (let row = 0; row < 2; row++) {
        const off = row ? 18 : 0;
        for (let x = -36; x < w + 36; x += 36) {
          c.fillStyle = row ? '#5a5e80' : '#53577a';
          c.fillRect(x + off + 2, row * bh + 2, 32, bh - 4);
          c.fillStyle = 'rgba(255,255,255,0.08)';
          c.fillRect(x + off + 2, row * bh + 2, 32, 4);
        }
      }
    });
  }

  // ---------- Audio (WebAudio synth, no files) ----------
  let actx = null;
  let muted = store.get('icyclimb.muted', false);
  function unlockAudio() {
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; }
    }
    if (actx && actx.state === 'suspended') actx.resume();
  }
  function tone(f1, f2, dur, type = 'square', vol = 0.06, delay = 0) {
    if (!actx || muted) return;
    const t = actx.currentTime + delay;
    const o = actx.createOscillator();
    const gn = actx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f1, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    gn.gain.setValueAtTime(vol, t);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gn).connect(actx.destination);
    o.start(t);
    o.stop(t + dur + 0.03);
  }
  const sfx = {
    jump: (p) => tone(260 + p * 220, 520 + p * 520, 0.14, 'square', 0.045),
    land: () => tone(160, 80, 0.07, 'triangle', 0.08),
    bounce: () => tone(500, 250, 0.08, 'sawtooth', 0.04),
    tick: () => tone(700, 900, 0.05, 'square', 0.04),
    comboStep: (n) => tone(500 + n * 60, 900 + n * 80, 0.1, 'triangle', 0.06),
    combo: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.12, 'square', 0.05, i * 0.07)); },
    cpuCombo: () => { [330, 392, 494].forEach((f, i) => tone(f, f, 0.1, 'triangle', 0.035, i * 0.06)); },
    hurry: () => { tone(880, 880, 0.12, 'square', 0.06); tone(880, 880, 0.12, 'square', 0.06, 0.18); },
    milestone: () => { [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, f * 1.01, 0.14, 'triangle', 0.07, i * 0.08)); },
    out: () => tone(600, 120, 0.4, 'sawtooth', 0.05),
    over: () => { [440, 349, 262, 196].forEach((f, i) => tone(f, f * 0.95, 0.22, 'sawtooth', 0.05, i * 0.16)); },
    win: () => { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, f, 0.16, 'square', 0.05, i * 0.11)); },
  };

  // ---------- Settings ----------
  const settings = Object.assign({ mode: 'solo', diff: 1 }, store.get('icyclimb.settings', {}));
  if (settings.mode !== 'vs') settings.mode = 'solo';
  settings.diff = clamp(settings.diff | 0, 0, DIFFS.length - 1);
  let menuRow = 0;
  function saveSettings() { store.set('icyclimb.settings', settings); }
  function setMode(m) {
    settings.mode = m;
    menuRow = 0;
    saveSettings();
    sfx.tick();
    newGame();
  }
  function setDiff(i) {
    settings.diff = clamp(i, 0, DIFFS.length - 1);
    settings.mode = 'vs';
    menuRow = 1;
    saveSettings();
    sfx.tick();
    newGame();
  }

  // ---------- Input ----------
  const keys = { left: false, right: false, jump: false };
  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'jump', KeyW: 'jump', Space: 'jump',
  };

  function menuKey(code) {
    if (code === 'ArrowUp' || code === 'KeyW') menuRow = 0;
    if (code === 'ArrowDown' || code === 'KeyS') menuRow = 1;
    const d = (code === 'ArrowLeft' || code === 'KeyA') ? -1 : (code === 'ArrowRight' || code === 'KeyD') ? 1 : 0;
    if (!d) return;
    if (menuRow === 0) setMode(d < 0 ? 'solo' : 'vs');
    else setDiff(settings.diff + d);
  }

  window.addEventListener('keydown', (e) => {
    unlockAudio();
    const k = KEYMAP[e.code];
    if (k) { keys[k] = true; e.preventDefault(); }
    if (e.repeat) return;
    if (state === 'title') menuKey(e.code);
    if (e.code === 'Space' || e.code === 'Enter') tryStart();
    if (e.code === 'KeyP') togglePause();
    if (e.code === 'Escape') {
      if (state === 'over') { if (g.overTimer > 45) toMenu(); }
      else togglePause();
    }
    if (e.code === 'KeyM') toggleMute();
  });
  window.addEventListener('keyup', (e) => {
    const k = KEYMAP[e.code];
    if (k) { keys[k] = false; e.preventDefault(); }
  });
  window.addEventListener('blur', () => {
    keys.left = keys.right = keys.jump = false;
    if (state === 'play') state = 'pause';
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === 'play') state = 'pause';
  });

  // Clickable buttons drawn on the canvas (rebuilt every frame)
  let uiButtons = [];

  canvas.addEventListener('pointerdown', (e) => {
    unlockAudio();
    if (state === 'pause') { state = 'play'; return; }
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width * W;
    const y = (e.clientY - r.top) / r.height * H;
    for (const b of uiButtons) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { b.action(); return; }
    }
    tryStart();
  });

  document.querySelectorAll('#touch button').forEach((btn) => {
    const k = btn.dataset.key;
    const down = (e) => {
      e.preventDefault();
      unlockAudio();
      keys[k] = true;
      btn.classList.add('down');
      if (btn.setPointerCapture && e.pointerId !== undefined) btn.setPointerCapture(e.pointerId);
      if (k === 'jump') tryStart();
      if (state === 'pause') state = 'play';
    };
    const up = (e) => { e.preventDefault(); keys[k] = false; btn.classList.remove('down'); };
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('lostpointercapture', up);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  function toggleMute() {
    muted = !muted;
    store.set('icyclimb.muted', muted);
    flash = { text: muted ? 'Sound OFF' : 'Sound ON', life: 60 };
  }
  function togglePause() {
    if (state === 'play') state = 'pause';
    else if (state === 'pause') state = 'play';
  }

  // ---------- Game state ----------
  let state = 'title'; // title | play | pause | over
  let g = null;
  let best = store.get('icyclimb.best', { score: 0, floor: 0, combo: 0 });
  let flash = null;
  let newRecord = false;
  let uiTime = 0;

  function makeFloor(i) {
    const y = -i * GAP;
    if (i === 0 || i % 50 === 0) return { i, x: WALL, w: W - 2 * WALL, y };
    const stage = Math.floor(i / 100);
    const maxW = Math.max(64, 230 - stage * 28 - (i % 100) * 0.35);
    const minW = Math.max(48, maxW - 100);
    const w = Math.round(rand(minW, maxW));
    const x = Math.round(rand(WALL, W - WALL - w));
    return { i, x, w, y };
  }

  function makePlayer(name, cpu, x) {
    return {
      name, cpu, pal: cpu ? PALETTES.cpu : PALETTES.you,
      x, y: -40, w: 28, h: 40, vx: 0, vy: 0,
      onGround: true, floor: 0, rot: 0, spin: false, facing: cpu ? -1 : 1, squash: 0, run: 0,
      alive: true, score: 0, bonus: 0, maxFloor: 0, bestCombo: 0,
      combo: { jumps: 0, floors: 0, timer: 0 },
      input: { left: false, right: false, jump: false },
      ai: cpu ? { plan: null, t: 0, wait: 30 } : null,
    };
  }

  function newGame() {
    const vs = settings.mode === 'vs';
    g = {
      floors: [], nextFloor: 0,
      cam: -(H - 60), scrolling: false, speed: 0, level: 0, levelTimer: 0, time: 0,
      vs, diff: DIFFS[settings.diff], players: [], result: null,
      particles: [], popups: [], shake: 0, overTimer: 0,
    };
    g.you = makePlayer('YOU', false, vs ? W / 2 - 60 : W / 2 - 14);
    g.players.push(g.you);
    g.cpu = null;
    if (vs) {
      g.cpu = makePlayer('CPU', true, W / 2 + 32);
      g.players.push(g.cpu);
    }
    ensureFloors();
  }

  function ensureFloors() {
    while (-g.nextFloor * GAP > g.cam - 120) g.floors.push(makeFloor(g.nextFloor++));
    while (g.floors.length && g.floors[0].y > g.cam + H + 120) g.floors.shift();
  }

  function startGame() {
    newGame();
    state = 'play';
    newRecord = false;
  }
  function tryStart() {
    if (state === 'title') startGame();
    else if (state === 'over' && g.overTimer > 45) startGame();
  }
  function toMenu() {
    newGame();
    state = 'title';
  }

  function popup(owner, text, sub, color = '#fff', size = 44) {
    g.popups.push({ cpu: !!(owner && owner.cpu), text, sub, color, size, life: 110, max: 110 });
  }

  function burst(x, y, n, colors, spread = 4) {
    for (let k = 0; k < n; k++) {
      g.particles.push({
        x, y, vx: rand(-spread, spread), vy: rand(-spread * 1.2, spread * 0.3),
        life: rand(30, 60), max: 60, size: rand(2, 5),
        color: colors[(Math.random() * colors.length) | 0], star: Math.random() < 0.5,
      });
    }
  }

  function rating(n) {
    for (const [t, word] of RATINGS) if (n <= t) return word;
    return RATINGS[RATINGS.length - 1][1];
  }

  // ---------- Physics (shared by players and by the computer's planning) ----------
  // Moves one player one frame using the given input. Returns what happened.
  function physics(p, input, floors) {
    const ev = { landed: null, jumped: -1, bounced: 0 };

    // Horizontal movement with icy momentum
    const acc = p.onGround ? 0.5 : 0.36;
    if (input.left) { p.vx -= acc; p.facing = -1; }
    if (input.right) { p.vx += acc; p.facing = 1; }
    if (!input.left && !input.right) {
      p.vx *= p.onGround ? 0.9 : 0.985;
      if (Math.abs(p.vx) < 0.05) p.vx = 0;
    }
    p.vx = clamp(p.vx, -MAX_VX, MAX_VX);

    // Jump: the faster you run, the higher you go
    if (input.jump && p.onGround) {
      const power = Math.abs(p.vx) / MAX_VX;
      p.vy = -(10.5 + Math.abs(p.vx) * 1.0);
      p.onGround = false;
      p.spin = power > 0.8;
      p.squash = -0.25;
      ev.jumped = power;
    }

    p.vy = Math.min(p.vy + GRAVITY, 17);

    // Walls: bounce off and keep your speed
    p.x += p.vx;
    if (p.x < WALL || p.x + p.w > W - WALL) {
      p.x = p.x < WALL ? WALL : W - WALL - p.w;
      ev.bounced = Math.abs(p.vx);
      p.vx = -p.vx * (p.onGround ? 0.35 : 1);
      p.facing = Math.sign(p.vx) || p.facing;
    }

    // Vertical movement and one-way floor collisions
    const prevBottom = p.y + p.h;
    p.y += p.vy;
    const wasGround = p.onGround;
    p.onGround = false;
    if (p.vy >= 0) {
      for (const f of floors) {
        if (prevBottom <= f.y + 1 && p.y + p.h >= f.y && p.x + p.w > f.x + 5 && p.x < f.x + f.w - 5) {
          p.y = f.y - p.h;
          p.vy = 0;
          p.onGround = true;
          if (!wasGround) { ev.landed = f; p.rot = 0; p.spin = false; }
          break;
        }
      }
    }

    if (!p.onGround && p.spin) p.rot += 0.26 * p.facing;
    p.squash *= 0.82;
    p.run += Math.abs(p.vx) * 0.06;
    return ev;
  }

  // ---------- Computer player ----------
  // A plan: run in runDir for runFrames frames, jump, then steer airDir until landing.
  // The computer tries many plans in a quick simulation and picks the best one.
  function simulate(p, pl, maxT) {
    const s = {
      x: p.x, y: p.y, w: p.w, h: p.h, vx: p.vx, vy: p.vy, onGround: p.onGround,
      rot: 0, spin: false, facing: p.facing, squash: 0, run: 0,
    };
    const inp = { left: false, right: false, jump: false };
    const camSpeed = g.scrolling ? g.speed : 0;
    for (let t = 0; t < maxT; t++) {
      const dir = t < pl.runFrames ? pl.runDir : pl.airDir;
      inp.left = dir < 0;
      inp.right = dir > 0;
      inp.jump = t === pl.runFrames;
      const ev = physics(s, inp, g.floors);
      if (t < pl.runFrames && !s.onGround) return null;    // ran off the edge
      if (t === pl.runFrames && ev.jumped < 0) return null;
      if (ev.landed) return { floor: ev.landed, t };
      if (s.y - (g.cam - camSpeed * t) > H) return null;   // would fall off the screen
    }
    return null;
  }

  function planMove(p) {
    const d = g.diff;
    const camSpeed = g.scrolling ? g.speed : 0;
    let bestPlan = null, bestV = -Infinity;
    const upward = [];
    for (const runDir of [-1, 1]) {
      for (let rf = 0; rf <= 48; rf += 4) {
        for (const airDir of [-1, 0, 1]) {
          const pl = { runDir, runFrames: rf, airDir };
          const r = simulate(p, pl, 180);
          if (!r) continue;
          const gain = r.floor.i - p.floor;
          if (gain >= 1 && gain <= d.maxGain) upward.push(pl);
          let v = Math.min(gain, d.maxGain) - Math.max(0, gain - d.maxGain) * 0.6;
          if (gain >= 2) v += d.comboLove;
          if (gain <= 0) v -= 2;
          if (r.floor.y - (g.cam - camSpeed * r.t) > H - 120) v -= 3; // too close to the bottom
          v -= (rf + r.t) * 0.004;
          v += Math.random() * d.noise;
          if (v > bestV) { bestV = v; bestPlan = pl; }
        }
      }
    }
    if (upward.length && Math.random() < d.sloppy) bestPlan = upward[(Math.random() * upward.length) | 0];
    if (bestPlan && Math.random() < d.mistake) {
      bestPlan = {
        runDir: bestPlan.runDir,
        runFrames: Math.max(0, bestPlan.runFrames + (Math.random() < 0.5 ? -4 : 4)),
        airDir: Math.random() < 0.5 ? bestPlan.airDir : 0,
      };
    }
    return bestPlan;
  }

  function aiThink(p) {
    const ai = p.ai, inp = p.input;
    inp.left = inp.right = inp.jump = false;
    if (ai.wait > 0) {
      ai.wait--;
      // While "thinking", brake if sliding would carry it off the edge of the ice
      const f = p.onGround && g.floors.find((fl) => fl.i === p.floor);
      if (f && Math.abs(p.vx) > 0.3) {
        const stop = p.x + p.vx * 10;
        if (stop < f.x + 4 || stop + p.w > f.x + f.w - 4) {
          if (p.vx > 0) inp.left = true; else inp.right = true;
        }
      }
      return;
    }
    if (!ai.plan) {
      if (!p.onGround) return;
      ai.plan = planMove(p);
      ai.t = 0;
      if (!ai.plan) { ai.wait = 8; return; }
    }
    const pl = ai.plan;
    let dir;
    if (ai.t < pl.runFrames) {
      dir = pl.runDir;
    } else {
      dir = pl.airDir;
      if (ai.t === pl.runFrames) inp.jump = true;
      else if (p.onGround) { ai.plan = null; return; }
    }
    inp.left = dir < 0;
    inp.right = dir > 0;
    ai.t++;
    if (ai.t > pl.runFrames + 240) ai.plan = null;
  }

  // ---------- Scoring ----------
  function endCombo(p) {
    const c = p.combo;
    if (c.jumps >= 2) {
      const pts = c.floors * c.floors;
      p.bonus += pts;
      p.bestCombo = Math.max(p.bestCombo, c.floors);
      popup(p, rating(c.floors), `${c.floors} floor combo  +${pts}`, p.cpu ? '#7bf1a8' : '#ffe45c',
        40 + Math.min(30, c.floors / 3));
      if (p.cpu) sfx.cpuCombo();
      else { g.shake = Math.min(14, 4 + c.floors / 6); sfx.combo(); }
    }
    c.jumps = 0; c.floors = 0; c.timer = 0;
    p.score = p.maxFloor * 10 + p.bonus;
  }

  function land(p, f) {
    p.squash = 0.28;
    const diff = f.i - p.floor;
    if (diff >= 2) {
      p.combo.jumps++;
      p.combo.floors += diff;
      p.combo.timer = COMBO_TIME;
      burst(p.x + p.w / 2, p.y + p.h, 10 + diff * 2, p.cpu ? ['#fff', '#7bf1a8', '#ffb35c'] : ['#fff', '#ffe45c', '#8ff0ff']);
      if (!p.cpu) sfx.comboStep(p.combo.jumps);
    } else {
      endCombo(p);
      if (!p.cpu) sfx.land();
    }
    p.floor = f.i;
    if (f.i > p.maxFloor) {
      p.maxFloor = f.i;
      if (f.i % 100 === 0) {
        popup(p, `Floor ${f.i}!`, `${THEMES[Math.floor(f.i / 100) % THEMES.length].name} zone`, '#8ff0ff', 46);
        if (!p.cpu) sfx.milestone();
      }
    }
    if (!g.scrolling && f.i >= 5) g.scrolling = true;
    if (p.cpu) { p.ai.plan = null; p.ai.wait = g.diff.react; }
  }

  function kill(p) {
    endCombo(p);
    p.alive = false;
    if (g.vs) {
      popup(null, p.cpu ? 'CPU fell!' : 'You fell!', '', p.cpu ? '#7bf1a8' : '#ff6b6b', 40);
      sfx.out();
    }
  }

  function checkEnd() {
    if (!g.vs) { if (!g.you.alive) gameOver(); return; }
    const alive = g.players.filter((p) => p.alive);
    if (alive.length === 0) { gameOver(); return; }
    // One player is out: the game ends as soon as the survivor has the higher score
    if (alive.length === 1) {
      const out = g.players.find((p) => !p.alive);
      if (alive[0].score > out.score) gameOver();
    }
  }

  function gameOver() {
    for (const p of g.players) if (p.alive) endCombo(p);
    state = 'over';
    g.overTimer = 0;
    const you = g.you;
    if (g.vs) {
      g.result = you.score > g.cpu.score ? 'win' : you.score < g.cpu.score ? 'lose' : 'tie';
      if (g.result === 'win') sfx.win(); else sfx.over();
    } else {
      sfx.over();
    }
    newRecord = you.score > best.score;
    best = {
      score: Math.max(best.score, you.score),
      floor: Math.max(best.floor, you.maxFloor),
      combo: Math.max(best.combo, you.bestCombo),
    };
    store.set('icyclimb.best', best);
  }

  // ---------- Update ----------
  function update() {
    g.time++;

    for (const p of g.players) {
      if (!p.alive) continue;
      if (p.cpu) aiThink(p);
      const ev = physics(p, p.cpu ? p.input : keys, g.floors);
      if (ev.jumped >= 0) {
        if (!p.cpu) sfx.jump(ev.jumped);
        if (ev.jumped > 0.6) burst(p.x + p.w / 2, p.y + p.h, 6, ['#dff8ff', '#ffffff'], 2);
      }
      if (ev.bounced > 3) {
        if (!p.cpu) sfx.bounce();
        burst(p.x < W / 2 ? WALL : W - WALL, p.y + p.h / 2, 6, ['#ffffff', '#c7d2ff'], 2.5);
      }
      if (ev.landed) land(p, ev.landed);
      if (p.combo.jumps > 0 && --p.combo.timer <= 0) endCombo(p);
      p.score = p.maxFloor * 10 + p.bonus;
    }

    // Camera: auto-scroll speeds up every 30 seconds, and chases the highest player
    if (g.scrolling) {
      if (++g.levelTimer >= LEVEL_TIME) {
        g.levelTimer = 0;
        if (g.level < MAX_LEVEL) {
          g.level++;
          popup(null, 'HURRY UP!', `Speed ${g.level + 1}`, '#ff6b6b', 48);
          sfx.hurry();
        }
      }
      g.speed = 0.6 + g.level * 0.45;
      g.cam -= g.speed;
    }
    let topY = Infinity;
    for (const p of g.players) if (p.alive) topY = Math.min(topY, p.y);
    const topZone = 180;
    if (topY - g.cam < topZone) g.cam += (topY - topZone - g.cam) * 0.18;

    ensureFloors();

    // Effects
    for (const pt of g.particles) { pt.x += pt.vx; pt.y += pt.vy; pt.vy += 0.15; pt.life--; }
    g.particles = g.particles.filter((pt) => pt.life > 0);
    for (const pu of g.popups) pu.life--;
    g.popups = g.popups.filter((pu) => pu.life > 0);
    if (g.shake > 0) g.shake *= 0.88;
    if (g.shake < 0.3) g.shake = 0;

    for (const p of g.players) if (p.alive && p.y - g.cam > H + 10) kill(p);
    checkEnd();
  }

  // ---------- Drawing ----------
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function mod(a, n) { return ((a % n) + n) % n; }

  function drawBackground() {
    ctx.save();
    ctx.fillStyle = bgPattern;
    const off = mod(-g.cam * 0.45, 48);
    ctx.translate(0, off);
    ctx.fillRect(0, -48, W, H + 96);
    ctx.restore();

    // Depth vignette
    const grad = ctx.createLinearGradient(WALL, 0, W - WALL, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0.45)');
    grad.addColorStop(0.18, 'rgba(0,0,0,0)');
    grad.addColorStop(0.82, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  function drawWalls() {
    ctx.save();
    ctx.fillStyle = wallPattern;
    const off = mod(-g.cam, 64);
    ctx.translate(0, off);
    ctx.fillRect(0, -64, WALL, H + 128);
    ctx.fillRect(W - WALL, -64, WALL, H + 128);
    ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(WALL - 4, 0, 4, H);
    ctx.fillRect(W - WALL, 0, 4, H);
  }

  function drawFloors() {
    for (const f of g.floors) {
      const sy = f.y - g.cam;
      if (sy < -40 || sy > H + 40) continue;
      const th = THEMES[Math.floor(f.i / 100) % THEMES.length];

      if (th.icicles) {
        ctx.fillStyle = 'rgba(200,240,255,0.75)';
        for (let x = f.x + 8; x < f.x + f.w - 8; x += 14) {
          const len = 6 + ((x * 7 + f.i * 13) % 9);
          ctx.beginPath();
          ctx.moveTo(x, sy + FLOOR_T - 2);
          ctx.lineTo(x + 6, sy + FLOOR_T - 2);
          ctx.lineTo(x + 3, sy + FLOOR_T + len);
          ctx.closePath();
          ctx.fill();
        }
      }

      roundRect(f.x, sy, f.w, FLOOR_T, 6);
      ctx.fillStyle = th.edge; ctx.fill();
      roundRect(f.x, sy, f.w, FLOOR_T - 4, 6);
      ctx.fillStyle = th.body; ctx.fill();
      roundRect(f.x + 3, sy + 2, f.w - 6, 5, 3);
      ctx.fillStyle = th.top; ctx.fill();

      if (f.i % 10 === 0) {
        const label = String(f.i);
        ctx.font = 'bold 13px system-ui, sans-serif';
        const tw = ctx.measureText(label).width + 14;
        const cx = f.x + f.w / 2;
        roundRect(cx - tw / 2, sy + FLOOR_T + 4, tw, 18, 4);
        ctx.fillStyle = '#20263f'; ctx.fill();
        ctx.strokeStyle = th.body; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(label, cx, sy + FLOOR_T + 13.5);
      }
    }
  }

  function drawPlayer(p) {
    const cx = p.x + p.w / 2;
    const cy = p.y - g.cam + p.h / 2;
    const s = p.squash;
    const pal = p.pal;

    ctx.save();
    ctx.translate(cx, cy + p.h / 2);
    ctx.scale(1 + s, 1 - s);
    ctx.translate(0, -p.h / 2);
    ctx.rotate(p.rot);
    ctx.scale(p.facing, 1);

    // Legs
    const moving = p.onGround && Math.abs(p.vx) > 0.5;
    const swing = moving ? Math.sin(p.run) * 5 : (p.onGround ? 0 : 3);
    ctx.fillStyle = pal.legs;
    roundRect(-9 + swing * 0.5, 8, 7, 12, 3); ctx.fill();
    roundRect(2 - swing * 0.5, 8, 7, 12, 3); ctx.fill();
    ctx.fillStyle = '#111';
    roundRect(-10 + swing * 0.5, 17, 9, 4, 2); ctx.fill();
    roundRect(2 - swing * 0.5, 17, 9, 4, 2); ctx.fill();

    // Body (hoodie)
    ctx.fillStyle = pal.hoodie;
    roundRect(-11, -6, 22, 17, 6); ctx.fill();
    ctx.fillStyle = pal.stripe;
    ctx.fillRect(-11, 3, 22, 3);

    // Arms
    const armUp = p.onGround ? 0 : -6;
    ctx.fillStyle = pal.dark;
    roundRect(-15, -4 + armUp, 6, 11, 3); ctx.fill();
    roundRect(9, -4 + armUp, 6, 11, 3); ctx.fill();

    // Head
    ctx.fillStyle = '#ffd7b0';
    ctx.beginPath(); ctx.arc(0, -13, 10, 0, Math.PI * 2); ctx.fill();
    // Eyes
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(3, -14, 3, 3.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-3, -14, 2.6, 3.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1b1b2b';
    ctx.beginPath(); ctx.arc(4.2, -13.6, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(-1.8, -13.6, 1.4, 0, Math.PI * 2); ctx.fill();
    // Mouth
    ctx.strokeStyle = '#a0522d'; ctx.lineWidth = 1.4;
    ctx.beginPath();
    if (p.onGround) ctx.arc(2, -9, 3, 0.15 * Math.PI, 0.85 * Math.PI);
    else ctx.arc(2, -8, 2, 0, Math.PI * 2);
    ctx.stroke();
    // Beanie
    ctx.fillStyle = pal.hat;
    ctx.beginPath(); ctx.arc(0, -16, 10.5, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-11, -17, 22, 4);
    ctx.beginPath(); ctx.arc(-4, -27, 3.5, 0, Math.PI * 2); ctx.fill();

    ctx.restore();

    if (g.vs) text(p.cpu ? 'CPU' : 'YOU', cx, p.y - g.cam - 18, 10, p.cpu ? '#7bf1a8' : '#ff9a90', 'center', '800');
  }

  function drawParticles() {
    for (const pt of g.particles) {
      ctx.globalAlpha = clamp(pt.life / pt.max, 0, 1);
      ctx.fillStyle = pt.color;
      const y = pt.y - g.cam;
      if (pt.star) {
        ctx.save();
        ctx.translate(pt.x, y);
        ctx.rotate(pt.life * 0.2);
        ctx.fillRect(-pt.size, -pt.size / 4, pt.size * 2, pt.size / 2);
        ctx.fillRect(-pt.size / 4, -pt.size, pt.size / 2, pt.size * 2);
        ctx.restore();
      } else {
        ctx.fillRect(pt.x - pt.size / 2, y - pt.size / 2, pt.size, pt.size);
      }
    }
    ctx.globalAlpha = 1;
  }

  function text(str, x, y, size, color = '#fff', align = 'center', weight = '800') {
    ctx.font = `${weight} ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, size / 7);
    ctx.strokeStyle = 'rgba(10,12,30,0.9)';
    ctx.strokeText(str, x, y);
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  function drawComboMeter(p, mx) {
    const my = 110, mh = 300, mw = 16;
    roundRect(mx, my, mw, mh, 8);
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fill();
    if (p.combo.jumps > 0) {
      const fill = (p.combo.timer / COMBO_TIME) * (mh - 4);
      const grad = ctx.createLinearGradient(0, my + mh, 0, my);
      grad.addColorStop(0, '#ff4d6d'); grad.addColorStop(0.5, '#ffd23f'); grad.addColorStop(1, '#7bf1a8');
      roundRect(mx + 2, my + mh - 2 - fill, mw - 4, fill, 6);
      ctx.fillStyle = grad; ctx.fill();
      text(String(p.combo.floors), mx + mw / 2 + 1, my - 14, 18, p.cpu ? '#7bf1a8' : '#ffe45c');
    }
    ctx.save();
    ctx.translate(mx + mw / 2, my + mh + 30);
    ctx.rotate(-Math.PI / 2);
    text(g.vs ? (p.cpu ? 'CPU' : 'YOU') : 'COMBO', 0, 0, 11, p.cpu ? '#7bf1a8' : '#c7d2ff', 'center', '800');
    ctx.restore();
  }

  function drawScoreBox(p, x, label, color) {
    text(p.alive ? label : `${label} · OUT`, x, 12, 11, color, 'center', '800');
    text(String(p.score), x, 32, 22, p.alive ? '#ffffff' : '#8890a8');
    text(`floor ${p.floor}`, x, 51, 11, '#bfe9ff', 'center', '700');
  }

  function drawHUD() {
    // Clock (speed timer)
    const cx = WALL + 26, cy = 30, r = 18;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#f4f1e6'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#8a6b2d'; ctx.stroke();
    if (g.scrolling) {
      const t = g.levelTimer / LEVEL_TIME;
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r - 3, -Math.PI / 2, -Math.PI / 2 + t * Math.PI * 2);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,90,90,0.45)'; ctx.fill();
      const a = -Math.PI / 2 + t * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * (r - 4), cy + Math.sin(a) * (r - 4));
      ctx.strokeStyle = '#222'; ctx.lineWidth = 2; ctx.stroke();
    }
    text(`x${g.level + 1}`, cx + r + 6, cy, 13, '#ffd7a0', 'left', '700');

    if (g.vs) {
      drawScoreBox(g.you, 196, 'YOU', '#ff9a90');
      drawScoreBox(g.cpu, 340, `CPU · ${g.diff.name}`, '#7bf1a8');
      drawComboMeter(g.you, 10);
      drawComboMeter(g.cpu, W - 26);
    } else {
      text(String(g.you.score), W / 2, 26, 26, '#ffffff');
      text(`FLOOR ${g.you.floor}`, W - WALL - 8, 26, 15, '#bfe9ff', 'right', '700');
      drawComboMeter(g.you, 10);
    }

    // Popups: yours (and global ones) in the upper area, the computer's smaller below
    let stackA = 0, stackB = 0;
    for (const pu of g.popups) {
      const age = pu.max - pu.life;
      const sc = (age < 10 ? 0.5 + age / 20 : 1) * (pu.cpu ? 0.6 : 1);
      const alpha = clamp(pu.life / 25, 0, 1);
      const y = pu.cpu ? 340 + stackB++ * 60 : 200 + stackA++ * 80;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(W / 2, y - age * 0.3);
      ctx.scale(sc, sc);
      ctx.rotate(Math.sin(age * 0.15) * 0.04);
      text(pu.cpu ? `CPU: ${pu.text}` : pu.text, 0, 0, pu.size, pu.color);
      if (pu.sub) text(pu.sub, 0, pu.size * 0.75, pu.cpu ? 22 : 16, '#ffffff', 'center', '700');
      ctx.restore();
    }

    if (flash && flash.life > 0) {
      ctx.globalAlpha = clamp(flash.life / 20, 0, 1);
      text(flash.text, W / 2, H - 30, 16, '#fff', 'center', '700');
      ctx.globalAlpha = 1;
      flash.life--;
    }
  }

  function panel(y, h) {
    ctx.fillStyle = 'rgba(6,10,28,0.62)';
    ctx.fillRect(0, 0, W, H);
    roundRect(56, y, W - 112, h, 18);
    ctx.fillStyle = 'rgba(24,34,72,0.95)'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#7fd6f5'; ctx.stroke();
  }

  function button(x, y, w, h, label, on, dim, action) {
    ctx.save();
    if (dim) ctx.globalAlpha = 0.45;
    roundRect(x, y, w, h, 10);
    ctx.fillStyle = on ? '#7fd6f5' : 'rgba(255,255,255,0.08)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = on ? '#e6fbff' : 'rgba(127,214,245,0.5)';
    ctx.stroke();
    ctx.font = `800 ${Math.round(h * 0.42)}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = on ? '#0b1530' : '#ffffff';
    ctx.fillText(label, x + w / 2, y + h / 2 + 1);
    ctx.restore();
    uiButtons.push({ x, y, w, h, action });
  }

  function blink() { return Math.floor(uiTime / 30) % 2 === 0; }

  function drawTitle() {
    panel(80, 486);
    const bob = Math.sin(uiTime * 0.05) * 4;
    text('ICY', W / 2, 124 + bob, 52, '#bff3ff');
    text('CLIMB', W / 2, 174 + bob, 52, '#7fd6f5');
    text('Jump as high as you can!', W / 2, 214, 15, '#fff', 'center', '600');

    // Game mode
    const vs = settings.mode === 'vs';
    if (menuRow === 0 || vs) text('▶', 84, menuRow === 0 ? 256 : 302, 14, '#ffe45c');
    button(96, 238, 140, 36, 'Solo', !vs, false, () => setMode('solo'));
    button(244, 238, 140, 36, 'vs Computer', vs, false, () => setMode('vs'));
    // Computer level
    DIFFS.forEach((d, i) => {
      button(96 + i * 98, 286, 92, 32, d.name, vs && settings.diff === i, !vs, () => setDiff(i));
    });
    text(vs ? 'Beat the computer\'s score!' : 'Pick "vs Computer" to race an opponent', W / 2, 336, 12, vs ? '#7bf1a8' : '#8f9cc8', 'center', '600');

    text('← → / A D  run      Space / ↑ / W  jump', W / 2, 370, 13, '#ffe45c', 'center', '700');
    text('P pause  ·  M sound  ·  arrows pick options here', W / 2, 392, 12, '#c7d2ff', 'center', '600');
    text('Run fast to jump higher. Skip 2+ floors', W / 2, 422, 13, '#c7d2ff', 'center', '500');
    text('in a row for big COMBO points!', W / 2, 440, 13, '#c7d2ff', 'center', '500');
    if (best.score > 0) text(`Best: ${best.score}  ·  Floor ${best.floor}`, W / 2, 466, 14, '#7bf1a8', 'center', '700');

    button(150, 486, 180, 44, 'START', true, false, tryStart);
    if (blink()) text('or press SPACE', W / 2, 548, 12, '#c7d2ff', 'center', '600');
  }

  function drawPause() {
    panel(230, 160);
    text('PAUSED', W / 2, 285, 40, '#bff3ff');
    text('Press P or tap to resume', W / 2, 340, 15, '#fff', 'center', '600');
  }

  function drawOver() {
    panel(100, 456);
    const you = g.you;
    if (g.vs) {
      const res = {
        win: ['YOU WIN!', '#7bf1a8'],
        lose: ['CPU WINS', '#ff6b6b'],
        tie: ['IT\'S A TIE', '#ffe45c'],
      }[g.result];
      text(res[0], W / 2, 150, 42, res[1]);
      text(`vs ${g.diff.name} computer`, W / 2, 190, 14, '#c7d2ff', 'center', '600');
      text('YOU', 318, 228, 14, '#ff9a90', 'right', '800');
      text('CPU', 392, 228, 14, '#7bf1a8', 'right', '800');
      const rows = [
        ['Score', you.score, g.cpu.score],
        ['Floor', you.maxFloor, g.cpu.maxFloor],
        ['Combo bonus', you.bonus, g.cpu.bonus],
        ['Best combo', you.bestCombo, g.cpu.bestCombo],
      ];
      rows.forEach(([k, a, b], i) => {
        const y = 262 + i * 32;
        text(k, 90, y, 16, '#c7d2ff', 'left', '600');
        text(String(a), 318, y, 18, '#fff', 'right', '800');
        text(String(b), 392, y, 18, '#fff', 'right', '800');
      });
    } else {
      text('GAME OVER', W / 2, 152, 44, '#ff6b6b');
      if (newRecord && blink()) text('NEW BEST!', W / 2, 196, 20, '#ffe45c');
      const rows = [
        ['Score', you.score],
        ['Floor', you.maxFloor],
        ['Combo bonus', you.bonus],
        ['Best combo', `${you.bestCombo} floors`],
      ];
      rows.forEach(([k, v], i) => {
        text(k, 100, 240 + i * 34, 17, '#c7d2ff', 'left', '600');
        text(String(v), W - 100, 240 + i * 34, 19, '#fff', 'right', '800');
      });
    }
    ctx.fillStyle = 'rgba(127,214,245,0.4)';
    ctx.fillRect(100, 392, W - 200, 2);
    text(`Best score: ${best.score}${newRecord && g.vs ? '  (NEW!)' : ''}`, W / 2, 414, 16, '#7bf1a8', 'center', '700');
    text(`Highest floor: ${best.floor}  ·  Best combo: ${best.combo}`, W / 2, 438, 13, '#c7d2ff', 'center', '600');
    if (g.overTimer > 45) {
      button(96, 466, 140, 42, 'Play again', true, false, tryStart);
      button(244, 466, 140, 42, 'Menu', false, false, toMenu);
      text('SPACE play again  ·  ESC menu', W / 2, 530, 12, '#c7d2ff', 'center', '600');
    }
  }

  function draw() {
    uiButtons = [];
    ctx.save();
    if (g.shake > 0) ctx.translate(rand(-g.shake, g.shake), rand(-g.shake, g.shake));
    drawBackground();
    drawFloors();
    drawParticles();
    for (let i = g.players.length - 1; i >= 0; i--) if (g.players[i].alive) drawPlayer(g.players[i]);
    drawWalls();
    ctx.restore();

    drawHUD();
    if (state === 'title') drawTitle();
    else if (state === 'pause') drawPause();
    else if (state === 'over') drawOver();
  }

  // ---------- Main loop (fixed 60 Hz timestep) ----------
  let last = performance.now();
  let acc = 0;
  function frame(now) {
    const dt = Math.min(100, now - last);
    last = now;
    uiTime++;
    if (state === 'play') {
      acc += dt;
      while (acc >= STEP) {
        update();
        acc -= STEP;
        if (state !== 'play') { acc = 0; break; }
      }
    } else {
      acc = 0;
      if (state === 'over') g.overTimer++;
    }
    draw();
    requestAnimationFrame(frame);
  }

  resize();
  buildPatterns();
  newGame();
  requestAnimationFrame(frame);
})();
