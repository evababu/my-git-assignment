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
let flashAlpha = 0;
let comboCount = 0;
let lastSliceTime = 0;
const COMBO_WINDOW = 500;

// background state
let bgTime = 0;
let stars = [];
let cityLayers = [];
let sunCanvas = null;
let bgMemes = [];
let bgMemeTimer = 0;

// ---- DIFFICULTY ----

const LEVEL_DURATION = 15000;
let gameStartTime = 0;
let currentLevel = 0;

function getLevel() {
  return Math.floor((Date.now() - gameStartTime) / LEVEL_DURATION);
}

function getSpawnDelay() {
  return Math.max(450, 1000 - currentLevel * 80);
}

function getBombChance() {
  return Math.min(0.07 + currentLevel * 0.01, 0.16);
}

// ---- CANVAS SIZING ----

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  buildBackground();
}

resizeCanvas();
window.addEventListener("resize", resizeCanvas);

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
  "Watch out for bombs!",
  "i can has cheezburger?"
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

function makeBuildings(minTotal, maxH, catEars) {
  const list = [];
  let total = 0;
  while (total < minTotal + 200) {
    const bw = 40 + Math.random() * 60;
    const bh = maxH * (0.4 + Math.random() * 0.6);
    const ears = catEars && Math.random() < 0.25;
    const windows = [];
    for (let wy = 14; wy < bh - 8; wy += 16) {
      for (let wx = 8; wx < bw - 10; wx += 14) {
        if (Math.random() < 0.35) windows.push({ x: wx, y: wy });
      }
    }
    list.push({ w: bw, h: bh, ears, windows });
    total += bw;
  }
  return { list, total };
}

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

  // horizontal lines rushing toward the camera
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

  // vertical lines converging at the horizon
  const cx = w / 2;
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  for (let k = -14; k <= 14; k++) {
    ctx.beginPath();
    ctx.moveTo(cx, horizonY);
    ctx.lineTo(cx + k * w * 0.12, h);
    ctx.stroke();
  }

  // glowing horizon line
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

function drawRainbowTrail(dir, spriteW, ps) {
  const bandH = ps * 1.3;
  const startX = -dir * spriteW * 0.4;
  for (let i = 0; i < RAINBOW.length; i++) {
    ctx.fillStyle = RAINBOW[i];
    for (let seg = 0; seg < 15; seg++) {
      const sx = startX - dir * (seg + 1) * 10;
      const wave = Math.sin(bgTime * 8 + seg * 0.6) * 3;
      ctx.fillRect(Math.min(sx, sx + dir * 10), (i - 2.5) * bandH + wave, 10.5, bandH);
    }
  }
}

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

    // caption bubble
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
  comboCount = 0;
  lastSliceTime = 0;
  currentLevel = 0;
  stopSpawning();
}

function spawnLoop() {
  if (gameOver) return;

  spawnItem();

  if (currentLevel >= 3 && Math.random() < 0.25) {
    spawnItem();
  }

  spawnTimeoutId = setTimeout(spawnLoop, getSpawnDelay());
}

function startGame() {
  started = true;
  getAudioCtx().resume();
  gameStartTime = Date.now();
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

function spawnItem() {
  if (gameOver) return;

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

function triggerGameOver(fromBomb) {
  gameOver = true;
  stopSpawning();
  document.getElementById("finalScoreText").textContent =
    (fromBomb ? "💥 Boom! " : "") + "Final Score: " + score + "  •  Level " + (currentLevel + 1);
  document.getElementById("gameOverOverlay").classList.remove("hidden");
}

function updateLevel() {
  const level = getLevel();
  if (level > currentLevel) {
    currentLevel = level;
    addFloatingText(canvas.width / 2, canvas.height / 2, "LEVEL UP!", "#ffffff", 52);
    playLevelUpSound();
  }
}

function update() {
  if (!started || gameOver) return;

  updateLevel();

  for (const item of items) {
    item.vy += GRAVITY;
    item.x += item.vx;
    item.y += item.vy;
    item.rot += item.spin;
  }

  items = items.filter(item => {
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
    addFloatingText(canvas.width / 2, 110, comboCount + "x COMBO!", "#ffe066", 30);
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
        const bonus = base + (combo - 1) * 5;
        score += bonus;
        spawnParticles(item.x, item.y, RAT_TYPES[item.type].palette.B, 10, 5);
        addFloatingText(item.x, item.y, "+" + bonus, "#ffffff", 22);
        playSliceSound();
      } else if (item.kind === "bomb") {
        spawnParticles(item.x, item.y, "#ff6b35", 24, 7);
        triggerFlash();
        playBombSound();
        triggerGameOver(true);
      } else if (item.kind === "life") {
        lives = Math.min(lives + 1, 5);
        spawnParticles(item.x, item.y, "#ff4d6d", 12, 4);
        addFloatingText(item.x, item.y, "+1 LIFE", "#ff7a9a", 22);
        playExtraLifeSound();
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

// ---- FLOATING TEXT ----

function addFloatingText(x, y, text, color, size) {
  floatingTexts.push({ x, y, text, color, size, life: 1 });
}

function updateFloatingTexts() {
  for (const t of floatingTexts) {
    t.y -= 0.6;
    t.life -= 0.02;
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
  for (const t of floatingTexts) {
    ctx.globalAlpha = Math.max(t.life, 0);
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

function drawTrail() {
  if (trail.length < 2) return;

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

function drawHUD() {
  if (!started) return;

  ctx.textAlign = "left";
  drawOutlinedText("Score: " + score, 20, 42, 28, "#ffffff");

  ctx.textAlign = "center";
  drawOutlinedText("Level " + (currentLevel + 1), canvas.width / 2, 42, 28, "#ffe066");

  ctx.textAlign = "right";
  drawOutlinedText("Lives: " + lives, canvas.width - 20, 42, 28, "#ff9ac2");
}

function draw() {
  drawBackground();
  drawBgMemes();

  for (const item of items) drawItemShadow(item);

  for (const item of items) {
    if (item.kind === "rat") drawRat(item);
    else if (item.kind === "bomb") drawBomb(item);
    else if (item.kind === "life") drawLifeItem(item);
  }

  drawParticles();
  drawTrail();
  drawFloatingTexts();
  drawHUD();
  drawFlash();
}

function gameLoop() {
  bgTime = performance.now() / 1000;
  updateBgMemes();
  updateTrail();
  update();
  checkSlashes();
  updateParticles();
  updateFloatingTexts();
  updateFlash();
  draw();
  requestAnimationFrame(gameLoop);
}

gameLoop();