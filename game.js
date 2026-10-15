const cv = document.getElementById('game'), c = cv.getContext('2d');
let W, H;
function fit() { W = cv.width = innerWidth; H = cv.height = innerHeight; }
fit(); addEventListener('resize', fit);
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const GRAVITY = 0.4;
let items = [];
let trail = [];
let particles = [];
let floatingTexts = [];
let score = 0;
let lives = 3;
let gameOver = false;
let started = false;
let selectedCat = null;
let spawnTimeoutId = null;
let gameOverTimeoutId = null;
let flashAlpha = 0;
let shakeTime = 0;
let comboCount = 0;
let lastSliceTime = 0;
const COMBO_WINDOW = 500;
let lastFrameTime = performance.now();

// mocking rat popup (appears when you slash a bomb)
let mockRat = null;

// background state
let bgTime = 0;
let stars = [];
let cityLayers = [];
let sunCanvas = null;
let bgMemes = [];
let bgMemeTimer = 0;
let bubbles = [];
let seaPlants = [];

// ---- DIFFICULTY / LEVELS ----

const LEVEL_DURATION = 15000;   // ms of level progress needed per level
let levelClock = 0;             // level progress in ms (time + bonus fish)
let currentLevel = 0;

function getLevel() {
  return Math.floor(levelClock / LEVEL_DURATION);
}

function getSpawnDelay() {
  return Math.max(450, 1000 - currentLevel * 80);
}

function getBombChance() {
  return Math.min(0.07 + currentLevel * 0.01, 0.16);
}

// ---- BONUS ROUND (FISH FRENZY) STATE ----

const BONUS_DURATION = 12000;    // ms
const BONUS_FORCE_MS = 35000;    // guarantee a golden fish after this long
const FISH_LEVEL_BOOST = 1500;   // ms of level progress per fish (10%)
let bonus = { active: false, timeLeft: 0, caught: 0, points: 0, spawnTimer: 0 };
let bonusFade = 0;               // 0 = normal scene, 1 = fully underwater
let timeSinceBonus = 0;
let pendingBonus = false;

// ---- CANVAS SIZING ----

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  buildBackground();
}

resizeCanvas();
window.addEventListener("resize", resizeCanvas);

// ---------- Save data ----------
const save = JSON.parse(localStorage.getItem('catNinja') || 'null') ||
  { coins: 0, best: 0, weapon: 'katana', skin: 'classic', env: 'cyber',
    owned: ['katana', 'classic', 'cyber'], daily: {} };
const today = new Date().toISOString().slice(0, 10);
if (save.daily.date !== today) save.daily = { date: today, slices: 0, bombs: 0, combo: 0, claimed: false };
const persist = () => localStorage.setItem('catNinja', JSON.stringify(save));
const dailyDone = () => save.daily.slices >= DAILY.slices && save.daily.bombs === 0 && save.daily.combo >= DAILY.combo;

// ---------- Menu ----------
// ---------- Menu ----------
const $ = id => document.getElementById(id);
function renderMenu() {
  $('coins').textContent = `🪙 ${save.coins}   |   🏆 Best: ${save.best}`;
  const d = save.daily;
  $('daily').innerHTML = `🎯 <b>DAILY CHALLENGE</b><br>
    Slice ${DAILY.slices} cats (${Math.min(d.slices, DAILY.slices)}/${DAILY.slices})<br>
    Don't hit any bombs (${d.bombs === 0 ? '✔' : '✘'})<br>
    Achieve a ${DAILY.combo}× combo (${d.combo}/${DAILY.combo})<br>
    Reward: 🪙 ${DAILY.reward} ${d.claimed ? '✅ Claimed' : ''}`;
}
// ---------- Game state ----------
let S, cats = [], parts = [], trail = [], down = false, shake = 0;
const g = 0.22;

function start(mode) {
  const m = MODES[mode];
  S = { mode, m, score: 0, lives: m.lives, combo: 0, comboT: 0, maxCombo: 0, sliced: 0, missed: 0,
        frame: 0, spawn: 30, timeLeft: m.time || 0, over: false, boss: null };
  cats = []; parts = []; trail = [];
  if (m.boss) spawnBoss();
  $('menu').classList.add('hidden');
  SFX.startMusic();
// ---- SOUND (Web Audio API) ----

let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playTone({ freq = 440, freqEnd = null, duration = 0.15, type = "sine", volume = 0.2 }) {
  const ctxA = getAudioCtx();
  const osc = ctxA.createOscillator();
  const gain = ctxA.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctxA.currentTime);
  if (freqEnd !== null) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), ctxA.currentTime + duration);
  }
  gain.gain.setValueAtTime(volume, ctxA.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctxA.currentTime + duration);
  osc.connect(gain);
  gain.connect(ctxA.destination);
  osc.start();
  osc.stop(ctxA.currentTime + duration);
}

function playSliceSound() {
  playTone({ freq: 900, freqEnd: 300, duration: 0.1, type: "triangle", volume: 0.15 });
}
function playComboSound(combo) {
  playTone({ freq: 500 + combo * 60, duration: 0.12, type: "sine", volume: 0.2 });
}
function playBombSound() {
  playTone({ freq: 180, freqEnd: 35, duration: 0.45, type: "sawtooth", volume: 0.35 });
}
function playExtraLifeSound() {
  playTone({ freq: 600, duration: 0.1, type: "sine", volume: 0.2 });
  setTimeout(() => playTone({ freq: 900, duration: 0.15, type: "sine", volume: 0.2 }), 100);
}
function playMissSound() {
  playTone({ freq: 150, duration: 0.15, type: "square", volume: 0.1 });
}
function playLevelUpSound() {
  playTone({ freq: 500, duration: 0.1, type: "triangle", volume: 0.2 });
  setTimeout(() => playTone({ freq: 700, duration: 0.1, type: "triangle", volume: 0.2 }), 100);
  setTimeout(() => playTone({ freq: 1000, duration: 0.15, type: "triangle", volume: 0.2 }), 200);
}
function playBonusStartSound() {
  [600, 800, 1000, 1300].forEach((f, i) => {
    setTimeout(() => playTone({ freq: f, duration: 0.12, type: "triangle", volume: 0.2 }), i * 90);
  });
}
function playFishSound() {
  playTone({ freq: 500, freqEnd: 1100, duration: 0.09, type: "sine", volume: 0.18 });
}
// squeaky rat laugh: "hee-hee-hee-hee"
function playMockSound() {
  [0, 130, 260, 390].forEach((delay, i) => {
    setTimeout(() => {
      playTone({ freq: 1500 + (i % 2) * 300, freqEnd: 900, duration: 0.1, type: "triangle", volume: 0.16 });
    }, delay);
  });
}

// ---- PIXEL SPRITES (flat + 3D extruded) ----

function drawPixelSprite(context, grid, palette, pixelSize) {
  const rows = grid.length;
  const cols = grid[0].length;
  const w = cols * pixelSize;
  const h = rows * pixelSize;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const ch = grid[row][col];
      if (ch === ".") continue;
      context.fillStyle = palette[ch];
      context.fillRect(-w / 2 + col * pixelSize, -h / 2 + row * pixelSize, pixelSize, pixelSize);
    }
  }
}

const darkCache = new WeakMap();

function darkenHex(hex, factor) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.floor(((n >> 16) & 255) * factor);
  const g = Math.floor(((n >> 8) & 255) * factor);
  const b = Math.floor((n & 255) * factor);
  return "rgb(" + r + "," + g + "," + b + ")";
}

function getDarkPalette(palette) {
  let dark = darkCache.get(palette);
  if (!dark) {
    dark = {};
    for (const key in palette) dark[key] = darkenHex(palette[key], 0.5);
    darkCache.set(palette, dark);
  }
  return dark;
}

// Draws a sprite with "thickness". rot = the rotation the context is already
// drawn at, so the thickness always points down-right (light from top-left).
function drawPixelSprite3D(context, grid, palette, pixelSize, depth, rot) {
  const dark = getDarkPalette(palette);
  const cos = Math.cos(rot), sin = Math.sin(rot);

  for (let d = depth; d >= 1; d--) {
    context.save();
    context.translate(d * (cos + sin), d * (cos - sin));
    drawPixelSprite(context, grid, dark, pixelSize);
    context.restore();
  }
  drawPixelSprite(context, grid, palette, pixelSize);
}

// ---- CATS ----

const CAT_GRID = [
  ".KK..KK.",
  "KCCCCCCK",
  "KCYCCYCK",
  "KCCPPCCK",
  ".KCCCCK.",
  "..K..K.."
];

const CATS = [
  { name: "Tabby", accent: "#ff9f43", palette: { K: "#1a1a1a", C: "#ff9f43", Y: "#2d2d2d", P: "#ffb8d1" } },
  { name: "Shadow", accent: "#8a8aff", palette: { K: "#000000", C: "#3a3a4a", Y: "#ffd93d", P: "#ffb8d1" } },
  { name: "Snow", accent: "#ffffff", palette: { K: "#1a1a1a", C: "#f5f5f5", Y: "#2d2d2d", P: "#ffb8d1" } },
  { name: "Ash", accent: "#b2bec3", palette: { K: "#1a1a1a", C: "#7a7f85", Y: "#2d2d2d", P: "#ffb8d1" } }
];

// ---- CAT CURSOR ----

function updateCursor(cat) {
  const c = document.createElement("canvas");
  c.width = 50;
  c.height = 42;
  const cx = c.getContext("2d");
  cx.translate(23, 19);
  drawPixelSprite3D(cx, CAT_GRID, cat.palette, 5, 3, 0);
  const url = c.toDataURL("image/png");
  document.documentElement.style.setProperty("--cat-cursor", "url(" + url + ") 23 19, auto");
}

function buildCatSelect() {
  const grid = document.getElementById("catGrid");

  CATS.forEach((cat) => {
    const card = document.createElement("div");
    card.className = "catCard";

    const thumbCanvas = document.createElement("canvas");
    thumbCanvas.width = 64;
    thumbCanvas.height = 48;
    const thumbCtx = thumbCanvas.getContext("2d");
    thumbCtx.translate(31, 22);
    drawPixelSprite3D(thumbCtx, CAT_GRID, cat.palette, 6, 3, 0);

    const label = document.createElement("span");
    label.textContent = cat.name;

    card.appendChild(thumbCanvas);
    card.appendChild(label);
    grid.appendChild(card);

    card.addEventListener("click", () => {
      document.querySelectorAll(".catCard").forEach(c => c.classList.remove("selected"));
      card.classList.add("selected");
      selectedCat = cat;
      updateCursor(cat);
      document.getElementById("startBtn").disabled = false;
    });
  });
}

// ---- DECORATIVE FLOATING CATS (menu) ----

const FLOATING_CAT_SPOTS = [
  { left: "8%",  top: "18%", size: 40, duration: 7 },
  { left: "85%", top: "14%", size: 34, duration: 9 },
  { left: "12%", top: "70%", size: 46, duration: 8 },
  { left: "88%", top: "66%", size: 38, duration: 6.5 },
  { left: "50%", top: "8%",  size: 30, duration: 10 },
  { left: "20%", top: "42%", size: 26, duration: 7.5 },
  { left: "78%", top: "40%", size: 28, duration: 8.5 }
];

function buildFloatingCats() {
  const container = document.getElementById("floatingCats");

  FLOATING_CAT_SPOTS.forEach((spot, i) => {
    const cat = CATS[i % CATS.length];

    const wrap = document.createElement("canvas");
    wrap.className = "floatingCat";
    wrap.width = spot.size;
    wrap.height = spot.size * 0.75;
    wrap.style.left = spot.left;
    wrap.style.top = spot.top;
    wrap.style.animationDuration = spot.duration + "s";
    wrap.style.animationDelay = (i * 0.4) + "s";

    const c = wrap.getContext("2d");
    c.translate(wrap.width / 2, wrap.height / 2);
    drawPixelSprite(c, CAT_GRID, cat.palette, spot.size / CAT_GRID[0].length);

    container.appendChild(wrap);
  });
}

// ---- MASCOT + SPEECH BUBBLE ----

const CAT_COMMENTS = [
  "Meow... ready to pounce?",
  "I smell rats nearby!",
  "Pick me, I'm purrfect!",
  "Let's claw some chaos!",
  "no thoughts, head empty, only claws",
  "These rats don't stand a chance.",
  "*knocks bomb off the table*",
  "Bombs cost a life now!",
  "i can has cheezburger?",
  "Golden fish = bonus splash time!",
  "fish? i mean... for science.",
  "Slice a bomb and a rat will laugh at you..."
];

function drawMascot() {
  const mascotCanvas = document.getElementById("mascotCanvas");
  const mctx = mascotCanvas.getContext("2d");
  mctx.clearRect(0, 0, mascotCanvas.width, mascotCanvas.height);
  mctx.save();
  mctx.translate(mascotCanvas.width / 2 - 1, mascotCanvas.height / 2 - 1);
  const cat = selectedCat || CATS[0];
  drawPixelSprite3D(mctx, CAT_GRID, cat.palette, 8, 3, 0);
  mctx.restore();
}

function startCatComments() {
  const bubble = document.getElementById("catBubble");

  function showNext() {
    bubble.classList.remove("visible");
    setTimeout(() => {
      bubble.textContent = CAT_COMMENTS[Math.floor(Math.random() * CAT_COMMENTS.length)];
      bubble.classList.add("visible");
    }, 300);
  }

  showNext();
  setInterval(showNext, 3200);
}

// ---- BACKGROUND: sky, stars, sun, skyline, grid floor ----

function getHorizonY() {
  return canvas.height * 0.78;
}

function spawnBoss() {
  S.boss = { type: 'boss', x: W / 2, y: H * 0.35, vx: 2.5, vy: 1.5, r: 110, hp: 30, max: 30, cd: 0, rot: 0, vr: 0 };
  cats.push(S.boss);
}

function launch(o, speed) {
  o.vy = -Math.sqrt(2 * g * H * (0.6 + Math.random() * 0.3)) * speed;
}

function spawn() {
  const m = S.m, el = S.frame;
  const speed = (m.speed || 1) * (m.ramp ? 1 + el / 3600 : 1);
  const bombRate = m.noBombs ? 0 : (m.bombs || 0.15);
  const o = { x: W * (0.15 + 0.7 * Math.random()), y: H + 40, r: 32, rot: 0, vr: (Math.random() - .5) * .1,
              t: 0, p: null, sleep: 0, flipped: false };
  o.vx = (Math.random() - .5) * 4 + (W / 2 - o.x) * 0.004;
  if (Math.random() < bombRate) { o.type = 'bomb'; launch(o, speed); cats.push(o); return; }
  o.type = 'cat';
  o.p = ['plain', 'sleep', 'look', 'spin', 'change', 'run'][Math.floor(Math.random() * 6)];
  if (o.p === 'sleep') { o.sleep = 50; o.y = H - 40; o.vx = 0; o.vy = 0; o.sp = speed; }
  else launch(o, speed);
  if (o.p === 'spin') o.vr = 0.35;
  if (o.p === 'run') { o.vx = (Math.random() < .5 ? -1 : 1) * 7; o.vy *= 0.75; }
  cats.push(o);
}

// ---------- Input ----------
cv.addEventListener('pointerdown', e => { down = true; trail = [{ x: e.clientX, y: e.clientY, t: S ? S.frame : 0 }]; });
addEventListener('pointerup', () => down = false);
cv.addEventListener('pointermove', e => {
  if (!down || !S || S.over) return;
  const a = trail[trail.length - 1], b = { x: e.clientX, y: e.clientY, t: S.frame };
  trail.push(b);
  for (const o of [...cats]) if (hit(a, b, o)) onSlice(o);
});
function hit(a, b, o) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
  let t = ((o.x - a.x) * dx + (o.y - a.y) * dy) / l2; t = Math.max(0, Math.min(1, t));
  return Math.hypot(a.x + t * dx - o.x, a.y + t * dy - o.y) < o.r;
function buildSun() {
  const r = Math.min(canvas.width, canvas.height) * 0.2;
  sunCanvas = document.createElement("canvas");
  sunCanvas.width = sunCanvas.height = r * 2;
  const s = sunCanvas.getContext("2d");

  const g = s.createLinearGradient(0, 0, 0, r * 2);
  g.addColorStop(0, "#fff6b0");
  g.addColorStop(1, "#ff8fc7");
  s.fillStyle = g;
  s.beginPath();
  s.arc(r, r, r, 0, Math.PI * 2);
  s.fill();

  s.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 6; i++) {
    const y = r * 1.05 + i * r * 0.16;
    s.fillRect(0, y, r * 2, r * (0.025 + i * 0.012));
  }
}

function buildBackground() {
  const w = canvas.width;
  const h = canvas.height;
  const horizonY = getHorizonY();

  stars = [];
  for (let i = 0; i < 80; i++) {
    stars.push({
      x: Math.random() * w,
      y: Math.random() * horizonY * 0.9,
      r: 0.8 + Math.random() * 1.4,
      phase: Math.random() * Math.PI * 2
    });
  }

  const far = makeBuildings(w, h * 0.20, true);
  const near = makeBuildings(w, h * 0.13, false);
  cityLayers = [
    { speed: 6,  color: "#d4bfff", windowAlpha: 0.5,  list: far.list,  total: far.total },
    { speed: 14, color: "#b497f0", windowAlpha: 0.85, list: near.list, total: near.total }
  ];

  buildSun();

  // underwater scene pieces
  bubbles = [];
  for (let i = 0; i < 38; i++) {
    bubbles.push({
      x: Math.random() * w,
      r: 3 + Math.random() * 9,
      speed: 25 + Math.random() * 50,
      offset: Math.random() * h
    });
  }

  seaPlants = [];
  for (let x = 20; x < w; x += 55 + Math.random() * 45) {
    seaPlants.push({
      x,
      h: h * (0.12 + Math.random() * 0.16),
      phase: Math.random() * 6,
      color: Math.random() < 0.5 ? "#3fcf8e" : "#2eb87a",
      coral: Math.random() < 0.3
    });
  }
}

function drawBuilding(b, x, horizonY, layer) {
  const top = horizonY - b.h;
  ctx.fillStyle = layer.color;
  ctx.fillRect(x, top, b.w, b.h);

  if (b.ears) {
    ctx.beginPath();
    ctx.moveTo(x + 4, top);
    ctx.lineTo(x + 4, top - 14);
    ctx.lineTo(x + 16, top);
    ctx.moveTo(x + b.w - 4, top);
    ctx.lineTo(x + b.w - 4, top - 14);
    ctx.lineTo(x + b.w - 16, top);
    ctx.fill();
  }

  ctx.fillStyle = "rgba(255, 238, 170, " + layer.windowAlpha + ")";
  for (const win of b.windows) {
    ctx.fillRect(x + win.x, top + win.y, 5, 7);
  }
}

function drawCity(layer, horizonY) {
  const offset = (bgTime * layer.speed) % layer.total;
  let x = -offset;
  while (x < canvas.width) {
    for (const b of layer.list) {
      if (x + b.w > 0 && x < canvas.width) drawBuilding(b, x, horizonY, layer);
      x += b.w;
    }
  }
}

function drawFloor(horizonY) {
  const w = canvas.width;
  const h = canvas.height;

  const g = ctx.createLinearGradient(0, horizonY, 0, h);
  g.addColorStop(0, "#f7c8ff");
  g.addColorStop(1, "#7f6ae0");
  ctx.fillStyle = g;
  ctx.fillRect(0, horizonY, w, h - horizonY);

  const N = 12;
  const flow = (bgTime * 0.35) % 1;
  ctx.lineWidth = 2;
  for (let i = 0; i < N; i++) {
    const z = (i + flow) / N;
    const y = horizonY + (h - horizonY) * z * z;
    ctx.strokeStyle = "rgba(255,255,255," + (0.15 + 0.5 * z) + ")";
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  const cx = w / 2;
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  for (let k = -14; k <= 14; k++) {
    ctx.beginPath();
    ctx.moveTo(cx, horizonY);
    ctx.lineTo(cx + k * w * 0.12, h);
    ctx.stroke();
  }

  const glow = ctx.createLinearGradient(0, horizonY - 8, 0, horizonY + 16);
  glow.addColorStop(0, "rgba(255,255,255,0)");
  glow.addColorStop(0.4, "rgba(255,255,255,0.8)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, horizonY - 8, w, 24);
}

function drawBackground() {
  const w = canvas.width;
  const horizonY = getHorizonY();

  const sky = ctx.createLinearGradient(0, 0, 0, horizonY);
  sky.addColorStop(0, "#a99bff");
  sky.addColorStop(0.55, "#ffb0d8");
  sky.addColorStop(1, "#ffe2b8");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, canvas.height);

  for (const s of stars) {
    ctx.globalAlpha = 0.35 + 0.55 * Math.abs(Math.sin(bgTime * 1.5 + s.phase));
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  if (sunCanvas) {
    const r = sunCanvas.width / 2;
    ctx.drawImage(sunCanvas, w / 2 - r, horizonY - r * 1.55);
  }

  drawCity(cityLayers[0], horizonY);
  drawCity(cityLayers[1], horizonY);
  drawFloor(horizonY);
}

// ---- UNDERWATER BACKGROUND (bonus round) ----

function drawUnderwater() {
  const w = canvas.width;
  const h = canvas.height;

  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#8ff0ff");
  g.addColorStop(0.45, "#2f9be8");
  g.addColorStop(1, "#14307f");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "rgba(255,255,255,0.08)";
  for (let i = 0; i < 6; i++) {
    const x = (i / 6) * w + Math.sin(bgTime * 0.4 + i * 1.7) * 50;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 80, 0);
    ctx.lineTo(x + 260, h);
    ctx.lineTo(x + 120, h);
    ctx.closePath();
    ctx.fill();
  }

  ctx.lineWidth = 2;
  for (const b of bubbles) {
    const by = h + 20 - ((bgTime * b.speed + b.offset) % (h + 40));
    const bx = b.x + Math.sin(bgTime + b.offset) * 12;
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.beginPath();
    ctx.arc(bx, by, b.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.beginPath();
    ctx.arc(bx - b.r * 0.3, by - b.r * 0.3, b.r * 0.25, 0, Math.PI * 2);
    ctx.fill();
  }

  const sandY = h * 0.92;
  ctx.lineCap = "round";
  for (const p of seaPlants) {
    const sway = Math.sin(bgTime * 1.5 + p.phase);
    if (p.coral) {
      ctx.fillStyle = "#ff8fb1";
      ctx.beginPath();
      ctx.arc(p.x, sandY - 10, 16, 0, Math.PI * 2);
      ctx.arc(p.x + 14, sandY - 18, 12, 0, Math.PI * 2);
      ctx.arc(p.x - 12, sandY - 16, 11, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(p.x, sandY + 8);
      ctx.quadraticCurveTo(p.x + sway * 16, sandY - p.h * 0.5, p.x + sway * 28, sandY - p.h);
      ctx.stroke();
    }
  }

  ctx.fillStyle = "#f4d59a";
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w + 30; x += 30) {
    ctx.lineTo(x, sandY + Math.sin(x * 0.02) * 8);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  for (let x = 0; x <= w + 20; x += 20) {
    ctx.lineTo(x, 14 + Math.sin(x * 0.03 + bgTime * 2) * 6);
  }
  ctx.lineTo(w, 0);
  ctx.closePath();
  ctx.fill();
}

// ---- MEME CATS (original pixel art inspired by classic cat memes) ----

const SHOCKED_GRID = [
  ".KK....KK.",
  "KCCK..KCCK",
  "KCCCCCCCCK",
  "KCWWCCWWCK",
  "KCWKCCWKCK",
  "KCCCPPCCCK",
  "KCCCKKCCCK",
  ".KCCCCCCK.",
  "..KKKKKK.."
];

const JUDGE_GRID = [
  ".KK....KK.",
  "KCCK..KCCK",
  "KCCCCCCCCK",
  "KCKKCCKKCK",
  "KCYYCCYYCK",
  "KCCCPPCCCK",
  "KCCCKKCCCK",
  ".KCCCCCCK.",
  "..KKKKKK.."
];

const LOAF_GRID = [
  "..KK....KK..",
  ".KCCKKKKCCK.",
  "KCCCCCCCCCCK",
  "KCKCCCCCCKCK",
  "KCCCCPPCCCCK",
  ".KKKKKKKKKK."
];

const RAINBOW = ["#ff6b6b", "#ffa94d", "#ffe066", "#69db7c", "#4dabf7", "#b197fc"];

const MEMES = {
  shocked: {
    grid: SHOCKED_GRID, ps: 7, caption: "WAT",
    palette: { K: "#1a1a1a", C: "#fff1c9", W: "#ffffff", P: "#ff9eb5" }
  },
  judge: {
    grid: JUDGE_GRID, ps: 7, caption: "...really?",
    palette: { K: "#1a1a1a", C: "#b9b9c9", Y: "#ffe066", P: "#ff9eb5" }
  },
  loaf: {
    grid: LOAF_GRID, ps: 6, caption: "loaf mode: ON",
    palette: { K: "#1a1a1a", C: "#ffb36b", P: "#ff9eb5" }
  },
  cheez: {
    grid: CAT_GRID, ps: 9, caption: "i can has cheezburger?",
    palette: { K: "#1a1a1a", C: "#ff9f43", Y: "#2d2d2d", P: "#ffb8d1" }
  },
  zoomies: {
    grid: CAT_GRID, ps: 9, caption: "zoomies!!", rainbow: true,
    palette: { K: "#1a1a1a", C: "#9a9aa8", Y: "#2d2d2d", P: "#ffb8d1" }
  }
};

function roundedRectPath(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function spawnBgMeme() {
  const keys = Object.keys(MEMES);
  const key = keys[Math.floor(Math.random() * keys.length)];
  const dir = Math.random() < 0.5 ? 1 : -1;
  bgMemes.push({
    key,
    dir,
    x: dir === 1 ? -220 : canvas.width + 220,
    y: canvas.height * (0.16 + Math.random() * 0.32),
    speed: 0.7 + Math.random() * 0.9,
    phase: Math.random() * Math.PI * 2
  });
}

function updateBgMemes() {
  bgMemeTimer--;
  if (bgMemeTimer <= 0 && bgMemes.length < 3) {
    spawnBgMeme();
    bgMemeTimer = 240 + Math.random() * 240;
  }
  for (const m of bgMemes) m.x += m.dir * m.speed;
  bgMemes = bgMemes.filter(m => m.x > -260 && m.x < canvas.width + 260);
}

function burst(x, y, color, n = 12) {
  for (let i = 0; i < n; i++) parts.push({ x, y, vx: (Math.random() - .5) * 8, vy: (Math.random() - .5) * 8, life: 30, color });
}

function onSlice(o) {
  if (o.type === 'boss') {
    if (o.cd > 0) return;
    o.cd = 8; o.hp--; SFX.slice(); SFX.meow(); burst(o.x, o.y, '#fff', 8);
    if (o.hp <= 0) { cats = cats.filter(x => x !== o); burst(o.x, o.y, '#ffd24d', 60); S.score += 500; save.coins += 200; S.won = true; endGame(); }
    return;
  }
  cats = cats.filter(x => x !== o);
  if (o.type === 'bomb') {
    SFX.bomb(); shake = 15; S.combo = 0; save.daily.bombs++; burst(o.x, o.y, '#f55', 30);
    S.score = Math.max(0, S.score - 20);
    if (S.m.lives !== Infinity) S.lives--;
    if (S.lives <= 0) endGame();
    return;
  }
  SFX.slice(); SFX.meow();
  S.combo++; S.comboT = 60; S.sliced++;
  S.maxCombo = Math.max(S.maxCombo, S.combo);
  S.score += 10 + S.combo; save.coins++;
  save.daily.slices++; save.daily.combo = Math.max(save.daily.combo, S.combo);
  burst(o.x, o.y, WEAPONS.find(w => w.id === save.weapon).color);
}

function endGame() {
  S.over = true; SFX.stopMusic();
  let msg = `Score: ${S.score}`;
  if (S.m.missions) {
    const done = MISSIONS.filter(m => m.ok(S));
    save.coins += done.length * 50;
    msg += ` — Missions ${done.length}/${MISSIONS.length}: ` + MISSIONS.map(m => (m.ok(S) ? '✅ ' : '❌ ') + m.t).join(' | ');
  }
  if (S.won) msg += ' — 👹 Boss defeated! +200 🪙';
  if (dailyDone() && !save.daily.claimed) { save.daily.claimed = true; save.coins += DAILY.reward; msg += ` — 🎯 Daily complete! +${DAILY.reward} 🪙`; }
  save.best = Math.max(save.best, S.score); persist();
  $('result').textContent = msg; renderMenu(); $('menu').classList.remove('hidden');
function drawBgMemes() {
  for (const m of bgMemes) {
    const def = MEMES[m.key];
    const spriteW = def.grid[0].length * def.ps;
    const spriteH = def.grid.length * def.ps;
    const bob = Math.sin(bgTime * 2 + m.phase) * 10;
    const tilt = Math.sin(bgTime * 2 + m.phase) * 0.1;

    ctx.save();
    ctx.translate(m.x, m.y + bob);

    if (def.rainbow) drawRainbowTrail(m.dir, spriteW, def.ps);

    ctx.save();
    ctx.rotate(tilt);
    drawPixelSprite3D(ctx, def.grid, def.palette, def.ps, 4, tilt);
    ctx.restore();

    ctx.font = "600 15px Fredoka, sans-serif";
    const tw = ctx.measureText(def.caption).width;
    const bw = tw + 24;
    const bh = 28;
    const bx = -bw / 2;
    const by = -spriteH / 2 - bh - 16;

    ctx.fillStyle = "rgba(255,255,255,0.92)";
    roundedRectPath(bx, by, bw, bh, 12);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-6, by + bh);
    ctx.lineTo(0, by + bh + 8);
    ctx.lineTo(6, by + bh);
    ctx.fill();

    ctx.fillStyle = "#6a4a8a";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(def.caption, 0, by + bh / 2 + 1);

    ctx.restore();
  }
}

// ---- MOCKING RAT (pops up when you slash a bomb) ----

// K = outline, B = fur, P = ears/nose, W = teeth, M = mouth inside, T = tongue
const MOCK_RAT_GRID = [
  ".KK......KK.",
  "KPPK....KPPK",
  "KPPKKKKKKPPK",
  ".KBBBBBBBBK.",
  "KBBKKBBKKBBK",
  "KBBBBBBBBBBK",
  "KBBBBPPBBBBK",
  "KBBKKKKKKBBK",
  "KBBKWWWWKBBK",
  ".KBKMMMMKBK.",
  ".KBKTTTTKBK.",
  "..KKKKKKKK.."
];
const MOCK_RAT_PALETTE = {
  K: "#1a1a1a", B: "#a8a8b8", P: "#ff9eb5",
  W: "#ffffff", M: "#5a1a2a", T: "#ff6b8b"
};

const MOCK_LINES = [
  "Nice slash, genius!",
  "BOOM! Squeak-squeak-HAHA!",
  "You sliced the BOMB?!",
  "Is that all you've got, kitty?",
  "Rats: 1    Cats: 0",
  "Even my grandma rat saw that!",
  "Cheese for me, boom for you!",
  "Meow-ch! That looked painful!"
];

function triggerMockRat() {
  mockRat = {
    side: Math.random() < 0.5 ? "left" : "right",
    age: 0,
    duration: 2600,
    haTimer: 250,
    text: MOCK_LINES[Math.floor(Math.random() * MOCK_LINES.length)]
  };
  playMockSound();
}

function getMockX(m) {
  return m.side === "left" ? canvas.width * 0.17 : canvas.width * 0.83;
}

function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function getMockPop(m) {
  const IN = 380, OUT = 380;
  if (m.age < IN) return easeOutBack(m.age / IN);
  if (m.age > m.duration - OUT) return Math.max(0, (m.duration - m.age) / OUT);
  return 1;
}

function updateMockRat(dt) {
  if (!mockRat) return;
  const m = mockRat;
  m.age += dt;
  m.haTimer -= dt;

  if (m.haTimer <= 0 && m.age < m.duration - 500) {
    m.haTimer = 380;
    addFloatingText(
      getMockX(m) + (Math.random() - 0.5) * 160,
      canvas.height - 230 - Math.random() * 50,
      "HA!", "#ffffff", 26, 0.025
    );
    playTone({ freq: 1300 + Math.random() * 400, freqEnd: 900, duration: 0.08, type: "triangle", volume: 0.08 });
  }

  if (m.age >= m.duration) mockRat = null;
}

function drawMockRat() {
  if (!mockRat) return;
  const m = mockRat;
  const pop = getMockPop(m);
  if (pop <= 0.001) return;

  const ps = Math.max(9, Math.min(15, canvas.width / 100));
  const spriteW = MOCK_RAT_GRID[0].length * ps;
  const spriteH = MOCK_RAT_GRID.length * ps;

  const x = getMockX(m);
  const yUp = canvas.height - spriteH / 2 - 24;
  const yDown = canvas.height + spriteH / 2 + 60;
  const laugh = Math.abs(Math.sin(m.age * 0.04));
  const y = yDown + (yUp - yDown) * pop - laugh * 10 * Math.min(pop, 1);
  const rot = Math.sin(m.age * 0.03) * 0.14;

  // the rat
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);

  // whiskers (drawn first so the face covers their inner ends)
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  const noseY = -spriteH / 2 + 6.5 * ps;
  for (const side of [-1, 1]) {
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(side * spriteW * 0.22, noseY);
      ctx.lineTo(side * (spriteW / 2 + ps * 2.6), noseY + i * ps * 0.9);
      ctx.stroke();
    }
  }

  drawPixelSprite3D(ctx, MOCK_RAT_GRID, MOCK_RAT_PALETTE, ps, 4, rot);
  ctx.restore();

  // speech bubble
  ctx.save();
  ctx.font = "bold 18px Fredoka, sans-serif";
  const tw = ctx.measureText(m.text).width;
  const bw = tw + 36;
  const bh = 38;
  const cx = Math.max(bw / 2 + 12, Math.min(canvas.width - bw / 2 - 12, x));
  const cy = y - spriteH / 2 - 44;

  ctx.translate(cx, cy);
  ctx.scale(Math.min(pop, 1.1), Math.min(pop, 1.1));

  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#ff7aa8";
  ctx.lineWidth = 3;
  roundedRectPath(-bw / 2, -bh / 2, bw, bh, 14);
  ctx.fill();
  ctx.stroke();

  // little tail pointing at the rat
  const tailX = Math.max(-bw / 2 + 22, Math.min(bw / 2 - 22, x - cx));
  ctx.beginPath();
  ctx.moveTo(tailX - 9, bh / 2 - 1);
  ctx.lineTo(tailX, bh / 2 + 13);
  ctx.lineTo(tailX + 9, bh / 2 - 1);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // cover the seam between bubble and tail
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(tailX - 8, bh / 2 - 4, 16, 5);

  ctx.fillStyle = "#6a3a8a";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(m.text, 0, 1);
  ctx.restore();
}

// ---- GAME STATE MANAGEMENT ----

function stopSpawning() {
  if (spawnTimeoutId !== null) {
    clearTimeout(spawnTimeoutId);
    spawnTimeoutId = null;
  }
}

function resetGame() {
  score = 0;
  lives = 3;
  items = [];
  trail = [];
  particles = [];
  floatingTexts = [];
  gameOver = false;
  flashAlpha = 0;
  shakeTime = 0;
  mockRat = null;
  comboCount = 0;
  lastSliceTime = 0;
  currentLevel = 0;
  levelClock = 0;
  timeSinceBonus = 0;
  pendingBonus = false;
  bonus.active = false;
  bonusFade = 0;
  stopSpawning();

  if (gameOverTimeoutId !== null) {
    clearTimeout(gameOverTimeoutId);
    gameOverTimeoutId = null;
  }
}

function spawnLoop() {
  if (gameOver) return;

  if (!bonus.active) {
    spawnItem();
    if (currentLevel >= 3 && Math.random() < 0.25) {
      spawnItem();
    }
  }

  spawnTimeoutId = setTimeout(spawnLoop, getSpawnDelay());
}

function startGame() {
  started = true;
  getAudioCtx().resume();
  currentLevel = 0;
  document.getElementById("menuOverlay").classList.add("hidden");
  document.getElementById("gameOverOverlay").classList.add("hidden");
  spawnLoop();
}

document.getElementById("startBtn").addEventListener("click", () => {
  resetGame();
  startGame();
});

document.getElementById("restartBtn").addEventListener("click", () => {
  resetGame();
  startGame();
});

buildCatSelect();
buildFloatingCats();
drawMascot();
startCatComments();

document.getElementById("catGrid").addEventListener("click", drawMascot);

// ---- CLAW TRAIL ----

canvas.addEventListener("mousemove", (e) => {
  if (!started || gameOver) return;
  trail.push({ x: e.offsetX, y: e.offsetY, time: Date.now() });
});

// ---- RATS, BOMBS, EXTRA LIFE ----

const RAT_GRID = [
  ".KK..KK.",
  "KBBBBBBK",
  "KBBBBBPK",
  "KBWWWWBK",
  ".KBBBBK.",
  "..K..K.."
];

const RAT_TYPES = {
  normal: {
    palette: { K: "#1a1a1a", B: "#9a9a9a", W: "#e8e8e8", P: "#c48b9f" },
    speedMult: 1,
    radius: 34,
    points: 10
  },
  fast: {
    palette: { K: "#1a1a1a", B: "#7a4a2a", W: "#d8b48a", P: "#c48b9f" },
    speedMult: 1.6,
    radius: 26,
    points: 20
  },
  golden: {
    palette: { K: "#1a1a1a", B: "#e6c200", W: "#fff3b0", P: "#ff8fa3" },
    speedMult: 1.2,
    radius: 30,
    points: 50
  }
};

const BOMB_GRID = [
  ".KKKKKK.",
  "KBBBBBBK",
  "KBBBBBBK",
  "KBBWBBBK",
  "KBBBBBBK",
  "KBBBBBBK",
  "KBBBBBBK",
  ".KKKKKK."
];
const BOMB_PALETTE = { K: "#000000", B: "#2b2b2b", W: "#555555" };

const LIFE_GRID = [
  ".RR.RR.",
  "RRRRRRR",
  "RRRRRRR",
  ".RRRRR.",
  "..RRR..",
  "...R..."
];
const LIFE_PALETTE = { R: "#ff4d6d" };

// ---- FISH (bonus round) ----

// K = outline, B = body, L = belly, F = fins/tail, W = eye. Tail on the left, facing right.
const FISH_GRID_R = [
  "...KKKK....",
  ".K.KBBBBK..",
  "KFKBBBBBBK.",
  "KFFBBBBWKBK",
  "KFKBLLLLBK.",
  ".K.KLLLLK..",
  "...KKKK...."
];
const FISH_GRID_L = FISH_GRID_R.map(row => row.split("").reverse().join(""));

const FISH_TYPES = {
  small: {
    palette: { K: "#1a1a1a", B: "#ff9f6b", L: "#ffe0c2", F: "#ff7a45", W: "#ffffff" },
    ps: 4, speed: 3.6, points: 10, weight: 5
  },
  blue: {
    palette: { K: "#1a1a1a", B: "#5ec8ff", L: "#d6f3ff", F: "#3a9be0", W: "#ffffff" },
    ps: 5, speed: 2.6, points: 15, weight: 3
  },
  pink: {
    palette: { K: "#1a1a1a", B: "#ff8fc7", L: "#ffd6ec", F: "#e0559f", W: "#ffffff" },
    ps: 5, speed: 3.0, points: 20, weight: 2
  },
  golden: {
    palette: { K: "#1a1a1a", B: "#ffd23f", L: "#fff3b0", F: "#ffb300", W: "#ffffff" },
    ps: 6, speed: 4.8, points: 50, weight: 1
  }
};

function spawnFish() {
  const keys = Object.keys(FISH_TYPES);
  const total = keys.reduce((sum, k) => sum + FISH_TYPES[k].weight, 0);
  let r = Math.random() * total;
  let type = keys[0];
  for (const k of keys) {
    r -= FISH_TYPES[k].weight;
    if (r <= 0) { type = k; break; }
  }

  const def = FISH_TYPES[type];
  const dir = Math.random() < 0.5 ? 1 : -1;
  const baseY = canvas.height * (0.16 + Math.random() * 0.66);

  items.push({
    kind: "fish",
    type,
    dir,
    x: dir === 1 ? -80 : canvas.width + 80,
    baseY,
    y: baseY,
    speed: def.speed * (0.85 + Math.random() * 0.3),
    amp: 14 + Math.random() * 34,
    freq: 0.03 + Math.random() * 0.03,
    phase: Math.random() * Math.PI * 2,
    age: 0,
    radius: def.ps * 5
  });
}

function spawnItem() {
  if (gameOver) return;

  // golden bonus fish: rare, but guaranteed if it's been a while
  const hasBonusFish = items.some(i => i.kind === "bonusfish");
  const wantBonus = !hasBonusFish &&
    (timeSinceBonus > BONUS_FORCE_MS || (currentLevel >= 1 && Math.random() < 0.03));

  if (wantBonus) {
    timeSinceBonus = 0;
    items.push({
      kind: "bonusfish",
      x: canvas.width * (0.15 + Math.random() * 0.7),
      y: canvas.height + 30,
      vx: (Math.random() - 0.5) * 3,
      vy: -(15 + Math.random() * 3),
      radius: 38,
      rot: 0,
      spin: (Math.random() - 0.5) * 0.05
    });
    return;
  }

  const r = Math.random();
  const bombChance = getBombChance();

  if (r < bombChance) {
    items.push({
      kind: "bomb",
      x: Math.random() * canvas.width,
      y: canvas.height + 30,
      vx: (Math.random() - 0.5) * 4,
      vy: -(13 + Math.random() * 3),
      radius: 32,
      rot: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.08
    });
  } else if (r < bombChance + 0.03) {
    items.push({
      kind: "life",
      x: Math.random() * canvas.width,
      y: canvas.height + 30,
      vx: (Math.random() - 0.5) * 3,
      vy: -(12 + Math.random() * 3),
      radius: 26,
      rot: 0,
      spin: (Math.random() - 0.5) * 0.06
    });
  } else {
    const rr = Math.random();
    let type = "normal";
    if (rr > 0.9) type = "golden";
    else if (rr > 0.6) type = "fast";
    const def = RAT_TYPES[type];

    items.push({
      kind: "rat",
      type,
      x: Math.random() * canvas.width,
      y: canvas.height + 30,
      vx: (Math.random() - 0.5) * 4 * def.speedMult,
      vy: -(14 + Math.random() * 4) * def.speedMult,
      radius: def.radius,
      rot: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.12
    });
  }
}

// ---- BONUS ROUND CONTROL ----

function startBonus() {
  bonus.active = true;
  bonus.timeLeft = BONUS_DURATION;
  bonus.caught = 0;
  bonus.points = 0;
  bonus.spawnTimer = 200;

  items = [];   // clear rats/bombs so nothing hurts you during the bonus
  trail = [];
  timeSinceBonus = 0;

  for (let i = 0; i < 3; i++) spawnFish();

  addFloatingText(canvas.width / 2, canvas.height * 0.30, "BONUS ROUND!", "#7ff3ff", 56, 0.012);
  addFloatingText(canvas.width / 2, canvas.height * 0.30 + 52, "Slash the fish!", "#ffffff", 28, 0.012);
  playBonusStartSound();
}

function endBonus() {
  bonus.active = false;
  items = [];

  const gotLife = bonus.caught >= 12 && lives < 5;
  if (gotLife) lives++;

  const cx = canvas.width / 2;
  const cy = canvas.height * 0.36;
  const pct = Math.round((bonus.caught * FISH_LEVEL_BOOST) / LEVEL_DURATION * 100);

  addFloatingText(cx, cy, "BONUS COMPLETE!", "#7ff3ff", 46, 0.008);
  addFloatingText(cx, cy + 48, bonus.caught + " fish  •  +" + bonus.points + " pts", "#ffffff", 28, 0.008);
  addFloatingText(cx, cy + 88, "Level progress +" + pct + "%", "#ffe066", 24, 0.008);
  if (gotLife) addFloatingText(cx, cy + 124, "+1 LIFE!", "#ff9ac2", 26, 0.008);

  playLevelUpSound();
}

function triggerGameOver(fromBomb) {
  gameOver = true;
  stopSpawning();

  const showOverlay = () => {
    if (!gameOver) return;
    document.getElementById("finalScoreText").textContent =
      (fromBomb ? "💥 Boom! " : "") + "Final Score: " + score + "  •  Level " + (currentLevel + 1);
    document.getElementById("gameOverOverlay").classList.remove("hidden");
  };

  if (fromBomb) {
    // let the rat finish laughing before the Game Over screen appears
    gameOverTimeoutId = setTimeout(showOverlay, 2300);
  } else {
    showOverlay();
  }
}

// ---------- Update ----------
function update() {
  S.frame++;
  if (S.comboT > 0 && --S.comboT === 0) S.combo = 0;
  if (S.m.time && S.frame % 60 === 0 && --S.timeLeft <= 0) return endGame();

  const interval = S.m.interval || (S.m.ramp ? Math.max(18, 55 - S.frame / 120) : 50);
  if (--S.spawn <= 0) { spawn(); S.spawn = interval * (0.6 + Math.random() * 0.8); }

  for (const o of [...cats]) {
    o.t++; o.rot += o.vr;
    if (o.type === 'boss') {
      o.x += o.vx; o.y += o.vy; o.cd--;
      if (o.x < o.r || o.x > W - o.r) o.vx *= -1;
      if (o.y < o.r || o.y > H * 0.6) o.vy *= -1;
      if (o.t % 90 === 0 && S.frame % 2 === 0) spawn();
      continue;
    }
    if (o.sleep > 0) { if (--o.sleep === 0) { o.vx = (W / 2 - o.x) * 0.004; launch(o, o.sp); } continue; }
    o.vy += g; o.x += o.vx; o.y += o.vy;
    if (o.p === 'look' && !o.flipped && o.vy > 0) { o.flipped = true; o.vx = -(o.vx || 2) * 2; }
    if (o.p === 'change' && o.t === 45) o.vx *= -1.5;
    if (o.y > H + 60 && o.vy > 0) {
      cats = cats.filter(x => x !== o);
      if (o.type === 'cat') {
        S.missed++; S.combo = 0;
        if (S.m.lives !== Infinity && !S.m.noBombs || S.m.lives !== Infinity) { S.lives--; if (S.lives <= 0) endGame(); }
      }
    }
  }
  for (const p of parts) { p.x += p.vx; p.y += p.vy; p.life--; }
  parts = parts.filter(p => p.life > 0);
  trail = trail.filter(p => S.frame - p.t < 12);
function updateLevel() {
  const level = getLevel();
  if (level > currentLevel) {
    currentLevel = level;
    addFloatingText(canvas.width / 2, canvas.height / 2, "LEVEL UP!", "#ffffff", 52);
    playLevelUpSound();
  }
}

function update(dt) {
  if (!started || gameOver) return;

  if (bonus.active) {
    bonus.timeLeft -= dt;
    bonus.spawnTimer -= dt;
    if (bonus.spawnTimer <= 0) {
      spawnFish();
      bonus.spawnTimer = 280 + Math.random() * 260;
    }
    if (bonus.timeLeft <= 0) endBonus();
  } else {
    levelClock += dt;
    timeSinceBonus += dt;
  }

  updateLevel();

  for (const item of items) {
    if (item.kind === "fish") {
      item.age++;
      item.x += item.dir * item.speed;
      item.y = item.baseY + Math.sin(item.age * item.freq + item.phase) * item.amp;
    } else {
      item.vy += GRAVITY;
      item.x += item.vx;
      item.y += item.vy;
      item.rot += item.spin;
    }
  }

  items = items.filter(item => {
    if (item.kind === "fish") {
      return item.x > -120 && item.x < canvas.width + 120;
    }
    if (item.y >= canvas.height + 60) {
      if (item.kind === "rat") {
        lives--;
        playMissSound();
        if (lives <= 0) {
          lives = 0;
          triggerGameOver(false);
        }
      }
      return false;
    }
    return true;
  });
}

function updateBonusFade() {
  const target = bonus.active ? 1 : 0;
  bonusFade += (target - bonusFade) * 0.07;
  if (Math.abs(target - bonusFade) < 0.01) bonusFade = target;
}

function updateTrail() {
  const now = Date.now();
  trail = trail.filter(p => now - p.time < 150);
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  let t = lengthSq === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  const closestX = x1 + t * dx, closestY = y1 + t * dy;
  return Math.hypot(px - closestX, py - closestY);
}

function registerSlice() {
  const now = Date.now();
  comboCount = (now - lastSliceTime < COMBO_WINDOW) ? comboCount + 1 : 1;
  lastSliceTime = now;
  if (comboCount > 1) {
    playComboSound(comboCount);
    addFloatingText(canvas.width / 2, 150, comboCount + "x COMBO!", "#ffe066", 30);
  }
  return comboCount;
}

function checkSlashes() {
  if (!started || gameOver) return;

  for (let i = 1; i < trail.length; i++) {
    const a = trail[i - 1], b = trail[i];

    items = items.filter(item => {
      const dist = distToSegment(item.x, item.y, a.x, a.y, b.x, b.y);
      if (dist > item.radius) return true;

      if (item.kind === "rat") {
        const combo = registerSlice();
        const base = RAT_TYPES[item.type].points;
        const bonusPts = base + (combo - 1) * 5;
        score += bonusPts;
        spawnParticles(item.x, item.y, RAT_TYPES[item.type].palette.B, 10, 5);
        addFloatingText(item.x, item.y, "+" + bonusPts, "#ffffff", 22);
        playSliceSound();
      } else if (item.kind === "bomb") {
        // a bomb now costs a life instead of ending the game outright
        spawnParticles(item.x, item.y, "#ff6b35", 24, 7);
        triggerFlash();
        shakeTime = 400;
        playBombSound();
        comboCount = 0;
        lastSliceTime = 0;
        lives--;
        addFloatingText(item.x, item.y, "-1 LIFE", "#ff4d4d", 30);
        triggerMockRat();
        if (lives <= 0) {
          lives = 0;
          triggerGameOver(true);
        }
      } else if (item.kind === "life") {
        lives = Math.min(lives + 1, 5);
        spawnParticles(item.x, item.y, "#ff4d6d", 12, 4);
        addFloatingText(item.x, item.y, "+1 LIFE", "#ff7a9a", 22);
        playExtraLifeSound();
      } else if (item.kind === "bonusfish") {
        spawnParticles(item.x, item.y, "#7ff3ff", 22, 6);
        if (!bonus.active) pendingBonus = true;
      } else if (item.kind === "fish") {
        const combo = registerSlice();
        const def = FISH_TYPES[item.type];
        const pts = def.points + (combo - 1) * 3;
        score += pts;
        bonus.points += pts;
        bonus.caught++;
        levelClock += FISH_LEVEL_BOOST;
        spawnParticles(item.x, item.y, "#bfefff", 12, 4);
        addFloatingText(item.x, item.y, "+" + pts, "#ffffff", 22);
        playFishSound();
      }

      return false;
    });

    if (gameOver) break;
  }
}

// ---- PARTICLES ----

function spawnParticles(x, y, color, count, speed) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const spd = Math.random() * speed + 1;
    particles.push({
      x, y,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd,
      life: 1,
      decay: 0.03 + Math.random() * 0.02,
      color,
      size: 2 + Math.random() * 3
    });
  }
}

function updateParticles() {
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.15;
    p.life -= p.decay;
  }
  particles = particles.filter(p => p.life > 0);
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(p.life, 0);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ---------- Draw ----------
const STATUS = { sleep: '😴', look: '😼', spin: '😹', change: '😾', run: '🙀' };
function draw() {
  const env = ENVS.find(e => e.id === save.env);
  const gr = c.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, env.a); gr.addColorStop(1, env.b);
  c.save();
  if (shake > 0) { c.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake); shake--; }
  c.fillStyle = gr; c.fillRect(0, 0, W, H);
  c.globalAlpha = .12; c.font = `${H * .5}px serif`; c.textAlign = 'center'; c.fillText(env.emoji, W / 2, H * .7); c.globalAlpha = 1;

  if (!S) { c.restore(); return; }
  const skin = SKINS.find(s => s.id === save.skin);
  c.textBaseline = 'middle';
  for (const o of cats) {
    c.save(); c.translate(o.x, o.y); c.rotate(o.rot); c.textAlign = 'center';
    c.font = `${o.r * 1.6}px serif`;
    if (o.type === 'bomb') c.fillText('💣', 0, 0);
    else if (o.type === 'boss') { c.fillText('😾', 0, 0); }
    else {
      c.fillText(o.sleep > 0 ? '😴' : skin.emoji, 0, 0);
      if (skin.extra) { c.font = `${o.r * .8}px serif`; c.fillText(skin.extra, 0, -o.r * .9); }
    }
    c.restore();
    if (o.type === 'cat' && STATUS[o.p]) { c.font = '18px serif'; c.fillText(STATUS[o.p], o.x + o.r, o.y - o.r); }
    if (o.type === 'boss') { c.fillStyle = '#333'; c.fillRect(o.x - 100, o.y - o.r - 25, 200, 14);
      c.fillStyle = '#f33'; c.fillRect(o.x - 100, o.y - o.r - 25, 200 * o.hp / o.max, 14); }
  }
  drawTrail(); 
  for (const p of parts) { c.globalAlpha = p.life / 30; c.fillStyle = p.color; c.fillRect(p.x, p.y, 5, 5); }
  c.globalAlpha = 1; c.restore();

  c.fillStyle = '#fff'; c.textAlign = 'left'; c.font = 'bold 24px system-ui';
  c.fillText(`Score ${S.score}`, 16, 30);
  c.fillText(S.lives === Infinity ? '' : '❤️'.repeat(Math.max(0, S.lives)), 16, 62);
  if (S.m.time) c.fillText(`⏱️ ${S.timeLeft}`, 16, 94);
  if (S.combo > 1) { c.textAlign = 'center'; c.font = 'bold 40px system-ui'; c.fillStyle = '#ffd24d'; c.fillText(`${S.combo}× COMBO`, W / 2, 60); }
// ---- FLOATING TEXT ----

function addFloatingText(x, y, text, color, size, decay = 0.02) {
  floatingTexts.push({ x, y, text, color, size, decay, life: 1 });
}

function updateFloatingTexts() {
  for (const t of floatingTexts) {
    t.y -= t.decay * 30;
    t.life -= t.decay;
  }
  floatingTexts = floatingTexts.filter(t => t.life > 0);
}

function drawOutlinedText(text, x, y, size, color) {
  ctx.font = "bold " + size + "px Fredoka, sans-serif";
  ctx.lineJoin = "round";
  ctx.lineWidth = 5;
  ctx.strokeStyle = "rgba(70, 30, 110, 0.85)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function drawFloatingTexts() {
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  for (const t of floatingTexts) {
    ctx.globalAlpha = Math.max(Math.min(t.life * 2, 1), 0);
    drawOutlinedText(t.text, t.x, t.y, t.size, t.color);
  }
  ctx.globalAlpha = 1;
}

// ---- SCREEN FLASH ----

function triggerFlash() {
  flashAlpha = 1;
}

function updateFlash() {
  if (flashAlpha > 0) flashAlpha -= 0.04;
}

function drawFlash() {
  if (flashAlpha > 0) {
    ctx.fillStyle = "rgba(255,60,60," + (flashAlpha * 0.6) + ")";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

// ---- DRAWING ITEMS ----

function drawItemShadow(item) {
  const floorY = canvas.height * 0.93;
  const height = floorY - item.y;
  if (height < 0) return;

  const k = Math.max(0.25, 1 - height / canvas.height);
  ctx.save();
  ctx.globalAlpha = 0.28 * k;
  ctx.fillStyle = "#3a1d6e";
  ctx.beginPath();
  ctx.ellipse(item.x, floorY, item.radius * 1.1 * k, item.radius * 0.3 * k, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawRat(item) {
  const def = RAT_TYPES[item.type];

  ctx.save();
  ctx.translate(item.x, item.y);
  ctx.rotate(item.rot);

  ctx.strokeStyle = def.palette.K;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-item.radius * 0.7, 0);
  ctx.quadraticCurveTo(-item.radius * 1.5, 15, -item.radius * 1.9, -5);
  ctx.stroke();

  const pixelSize = (item.radius * 2) / RAT_GRID[0].length;
  drawPixelSprite3D(ctx, RAT_GRID, def.palette, pixelSize, 4, item.rot);

  ctx.restore();
}

function drawBomb(item) {
  ctx.save();
  ctx.translate(item.x, item.y);
  ctx.rotate(item.rot);

  ctx.strokeStyle = "#8a5a2a";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, -item.radius * 0.9);
  ctx.quadraticCurveTo(item.radius * 0.3, -item.radius * 1.3, item.radius * 0.1, -item.radius * 1.6);
  ctx.stroke();

  ctx.fillStyle = Math.random() < 0.5 ? "#ffcc33" : "#ff7a33";
  ctx.beginPath();
  ctx.arc(item.radius * 0.1, -item.radius * 1.6, 4 + Math.random() * 2, 0, Math.PI * 2);
  ctx.fill();

  const pixelSize = (item.radius * 2) / BOMB_GRID[0].length;
  drawPixelSprite3D(ctx, BOMB_GRID, BOMB_PALETTE, pixelSize, 5, item.rot);

  ctx.restore();
}

function drawLifeItem(item) {
  ctx.save();
  ctx.translate(item.x, item.y);
  ctx.rotate(item.rot);
  const pixelSize = (item.radius * 2) / LIFE_GRID[0].length;
  drawPixelSprite3D(ctx, LIFE_GRID, LIFE_PALETTE, pixelSize, 4, item.rot);
  ctx.restore();
}

function drawFish(item) {
  const def = FISH_TYPES[item.type];
  const grid = item.dir === 1 ? FISH_GRID_R : FISH_GRID_L;
  const tilt = Math.cos(item.age * item.freq + item.phase) * 0.25 * item.dir;

  ctx.save();
  ctx.translate(item.x, item.y);
  ctx.rotate(tilt);
  drawPixelSprite3D(ctx, grid, def.palette, def.ps, 3, tilt);
  ctx.restore();
}

function drawBonusFishItem(item) {
  const def = FISH_TYPES.golden;
  const grid = item.vx >= 0 ? FISH_GRID_R : FISH_GRID_L;
  const pulse = 10 + Math.sin(bgTime * 8) * 6;

  ctx.save();
  ctx.translate(item.x, item.y);
  ctx.rotate(item.rot);
  ctx.shadowColor = "#7ff3ff";
  ctx.shadowBlur = pulse + 10;
  drawPixelSprite3D(ctx, grid, def.palette, 7, 4, item.rot);
  ctx.restore();

  ctx.textAlign = "center";
  drawOutlinedText("BONUS", item.x, item.y - item.radius - 18, 16, "#7ff3ff");
}

function drawTrail() {
  if (trail.length < 2) return;
  const w = WEAPONS.find(x => x.id === save.weapon);
  c.lineCap = 'round'; c.lineJoin = 'round';
  const path = off => { c.beginPath(); trail.forEach((p, i) => { const j = w.fx === 'lightning' ? (Math.random() - .5) * 14 : 0;
    i ? c.lineTo(p.x + off + j, p.y + off + j) : c.moveTo(p.x + off, p.y + off); }); c.stroke(); };
  c.strokeStyle = w.color; c.lineWidth = w.fx === 'thin' ? 2 : 6;
  c.shadowColor = w.color; c.shadowBlur = ['glow', 'fire', 'ice', 'lightning'].includes(w.fx) ? 25 : 5;
  path(0);
  if (w.fx === 'dual') path(14);
  if (w.fx === 'fire' || w.fx === 'sparkle' || w.fx === 'ice') {
    const p = trail[trail.length - 1];
    parts.push({ x: p.x, y: p.y, vx: (Math.random() - .5) * 3, vy: w.fx === 'fire' ? -2 : (Math.random() - .5) * 3, life: 20, color: w.color });
  }
  c.shadowBlur = 0;

  const color = selectedCat ? selectedCat.accent : "#ff9ac2";
  const offsets = [-6, 0, 6];

  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  for (const offset of offsets) {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    for (let i = 0; i < trail.length; i++) {
      const p = trail[i];
      if (i === 0) ctx.moveTo(p.x + offset, p.y);
      else ctx.lineTo(p.x + offset, p.y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

// ---- HUD ----

function drawHUD() {
  if (!started) return;

  ctx.textBaseline = "alphabetic";

  ctx.textAlign = "left";
  drawOutlinedText("Score: " + score, 20, 42, 28, "#ffffff");

  ctx.textAlign = "center";
  drawOutlinedText("Level " + (currentLevel + 1), canvas.width / 2, 42, 28, "#ffe066");

  ctx.textAlign = "right";
  drawOutlinedText("Lives: " + lives, canvas.width - 20, 42, 28, "#ff9ac2");

  // level progress bar (fills with time AND with bonus fish)
  const lbw = 180, lbh = 10;
  const lbx = canvas.width / 2 - lbw / 2;
  const lby = 54;
  const prog = (levelClock % LEVEL_DURATION) / LEVEL_DURATION;

  ctx.fillStyle = "rgba(70, 30, 110, 0.5)";
  roundedRectPath(lbx, lby, lbw, lbh, 5);
  ctx.fill();
  if (prog > 0.04) {
    ctx.fillStyle = "#ffe066";
    roundedRectPath(lbx, lby, lbw * prog, lbh, 5);
    ctx.fill();
  }
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  roundedRectPath(lbx, lby, lbw, lbh, 5);
  ctx.stroke();
}

function drawBonusHUD() {
  if (!bonus.active) return;

  const w = canvas.width;
  const bw = 340, bh = 14;
  const x = w / 2 - bw / 2;
  const y = 100;

  ctx.textAlign = "center";
  drawOutlinedText("BONUS FISH FRENZY  •  " + bonus.caught + " caught", w / 2, y - 10, 20, "#7ff3ff");

  ctx.fillStyle = "rgba(20, 40, 110, 0.55)";
  roundedRectPath(x, y, bw, bh, 7);
  ctx.fill();

  const frac = Math.max(0, bonus.timeLeft / BONUS_DURATION);
  if (frac > 0.03) {
    ctx.fillStyle = frac > 0.25 ? "#7ff3ff" : "#ff7a9a";
    roundedRectPath(x, y, bw * frac, bh, 7);
    ctx.fill();
  }

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  roundedRectPath(x, y, bw, bh, 7);
  ctx.stroke();
}

// ---- MAIN DRAW ----

function draw() {
  ctx.save();

  // screen shake after a bomb
  if (shakeTime > 0) {
    const mag = shakeTime / 40;
    ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
  }

  drawBackground();

  if (bonusFade > 0.01) {
    ctx.save();
    ctx.globalAlpha = bonusFade;
    drawUnderwater();
    ctx.restore();
  }

  ctx.save();
  ctx.globalAlpha = 1 - bonusFade;
  drawBgMemes();
  ctx.restore();

  for (const item of items) {
    if (item.kind !== "fish") drawItemShadow(item);
  }

  for (const item of items) {
    if (item.kind === "rat") drawRat(item);
    else if (item.kind === "bomb") drawBomb(item);
    else if (item.kind === "life") drawLifeItem(item);
    else if (item.kind === "fish") drawFish(item);
    else if (item.kind === "bonusfish") drawBonusFishItem(item);
  }

  drawMockRat();
  drawParticles();
  drawTrail();
  drawFloatingTexts();
  drawHUD();
  drawBonusHUD();
  drawFlash();

  ctx.restore();
}

function loop() { if (S && !S.over) update(); draw(); requestAnimationFrame(loop); }
const modeKey = new URLSearchParams(location.search).get('mode');
const pickedMode = MODES[modeKey] ? modeKey : 'classic';
$('play').textContent = `▶ Play ${MODES[pickedMode].name}`;
$('play').onclick = () => start(pickedMode);
renderMenu(); loop();
function gameLoop() {
  const now = performance.now();
  const dt = Math.min(now - lastFrameTime, 100);
  lastFrameTime = now;
  bgTime = now / 1000;

  updateBgMemes();
  updateTrail();
  update(dt);
  checkSlashes();

  if (pendingBonus) {
    pendingBonus = false;
    if (!bonus.active && !gameOver) startBonus();
  }

  updateBonusFade();
  updateMockRat(dt);
  if (shakeTime > 0) shakeTime = Math.max(0, shakeTime - dt);
  updateParticles();
  updateFloatingTexts();
  updateFlash();
  draw();
  requestAnimationFrame(gameLoop);
}

gameLoop();

