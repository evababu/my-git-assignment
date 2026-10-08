const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

resizeCanvas();
window.addEventListener("resize", resizeCanvas);

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
let spawnIntervalId = null;
let flashAlpha = 0;
let comboCount = 0;
let lastSliceTime = 0;
const COMBO_WINDOW = 500;

// ---- SOUND (Web Audio API — no sound files needed) ----

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

// ---- SHARED PIXEL SPRITE DRAWER ----

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
  { name: "Snow", accent: "#dfe6e9", palette: { K: "#1a1a1a", C: "#f5f5f5", Y: "#2d2d2d", P: "#ffb8d1" } },
  { name: "Ash", accent: "#b2bec3", palette: { K: "#1a1a1a", C: "#7a7f85", Y: "#2d2d2d", P: "#ffb8d1" } }
];

function buildCatSelect() {
  const grid = document.getElementById("catGrid");

  CATS.forEach((cat) => {
    const card = document.createElement("div");
    card.className = "catCard";

    const thumbCanvas = document.createElement("canvas");
    thumbCanvas.width = 64;
    thumbCanvas.height = 48;
    const thumbCtx = thumbCanvas.getContext("2d");
    thumbCtx.translate(32, 24);
    drawPixelSprite(thumbCtx, CAT_GRID, cat.palette, 7);

    const label = document.createElement("span");
    label.textContent = cat.name;

    card.appendChild(thumbCanvas);
    card.appendChild(label);
    grid.appendChild(card);

    card.addEventListener("click", () => {
      document.querySelectorAll(".catCard").forEach(c => c.classList.remove("selected"));
      card.classList.add("selected");
      selectedCat = cat;
      document.getElementById("startBtn").disabled = false;
    });
  });
}

// ---- DECORATIVE FLOATING CATS ----

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
  "Nyah~ let's play!",
  "These rats don't stand a chance.",
  "Sharpen those claws!",
  "Watch out for bombs!"
];

function drawMascot() {
  const mascotCanvas = document.getElementById("mascotCanvas");
  const mctx = mascotCanvas.getContext("2d");
  mctx.clearRect(0, 0, mascotCanvas.width, mascotCanvas.height);
  mctx.save();
  mctx.translate(mascotCanvas.width / 2, mascotCanvas.height / 2);
  const cat = selectedCat || CATS[0];
  drawPixelSprite(mctx, CAT_GRID, cat.palette, mascotCanvas.width / CAT_GRID[0].length);
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

// ---- GAME STATE MANAGEMENT ----

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

  if (spawnIntervalId !== null) {
    clearInterval(spawnIntervalId);
    spawnIntervalId = null;
  }
}

function startGame() {
  started = true;
  getAudioCtx().resume();
  document.getElementById("menuOverlay").classList.add("hidden");
  document.getElementById("gameOverOverlay").classList.add("hidden");
  spawnIntervalId = setInterval(spawnItem, 1000);
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

  if (r < 0.07) {
    items.push({
      kind: "bomb",
      x: Math.random() * canvas.width,
      y: canvas.height + 30,
      vx: (Math.random() - 0.5) * 4,
      vy: -(13 + Math.random() * 3),
      radius: 32
    });
  } else if (r < 0.10) {
    items.push({
      kind: "life",
      x: Math.random() * canvas.width,
      y: canvas.height + 30,
      vx: (Math.random() - 0.5) * 3,
      vy: -(12 + Math.random() * 3),
      radius: 26
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
      radius: def.radius
    });
  }
}

function triggerGameOver(fromBomb) {
  gameOver = true;
  if (spawnIntervalId !== null) {
    clearInterval(spawnIntervalId);
    spawnIntervalId = null;
  }
  document.getElementById("finalScoreText").textContent =
    (fromBomb ? "💥 Boom! " : "") + "Final Score: " + score;
  document.getElementById("gameOverOverlay").classList.remove("hidden");
}

function update() {
  if (!started || gameOver) return;

  for (const item of items) {
    item.vy += GRAVITY;
    item.x += item.vx;
    item.y += item.vy;
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
    addFloatingText(canvas.width / 2, 110, comboCount + "x COMBO!", "#ff7aa8", 30);
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
        addFloatingText(item.x, item.y, "+" + bonus, "#ff7aa8", 20);
        playSliceSound();
      } else if (item.kind === "bomb") {
        spawnParticles(item.x, item.y, "#ff6b35", 24, 7);
        triggerFlash();
        playBombSound();
        triggerGameOver(true);
      } else if (item.kind === "life") {
        lives = Math.min(lives + 1, 5);
        spawnParticles(item.x, item.y, "#ff4d6d", 12, 4);
        addFloatingText(item.x, item.y, "+1 LIFE", "#ff4d6d", 20);
        playExtraLifeSound();
      }

      return false;
    });

    if (gameOver) break;
  }
}

// ---- PARTICLES (slash splash effect) ----

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

// ---- FLOATING SCORE / COMBO TEXT ----

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

function drawFloatingTexts() {
  for (const t of floatingTexts) {
    ctx.globalAlpha = Math.max(t.life, 0);
    ctx.fillStyle = t.color;
    ctx.font = "bold " + t.size + "px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;
}

// ---- SCREEN FLASH (bomb explosion) ----

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

function drawRat(item) {
  const def = RAT_TYPES[item.type];

  ctx.save();
  ctx.translate(item.x, item.y);

  ctx.strokeStyle = def.palette.K;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-item.radius * 0.7, 0);
  ctx.quadraticCurveTo(-item.radius * 1.5, 15, -item.radius * 1.9, -5);
  ctx.stroke();

  const pixelSize = (item.radius * 2) / RAT_GRID[0].length;
  drawPixelSprite(ctx, RAT_GRID, def.palette, pixelSize);

  ctx.restore();
}

function drawBomb(item) {
  ctx.save();
  ctx.translate(item.x, item.y);

  ctx.strokeStyle = "#8a5a2a";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, -item.radius * 0.9);
  ctx.quadraticCurveTo(item.radius * 0.3, -item.radius * 1.3, item.radius * 0.1, -item.radius * 1.6);
  ctx.stroke();

  ctx.fillStyle = "#ffcc33";
  ctx.beginPath();
  ctx.arc(item.radius * 0.1, -item.radius * 1.6, 4, 0, Math.PI * 2);
  ctx.fill();

  const pixelSize = (item.radius * 2) / BOMB_GRID[0].length;
  drawPixelSprite(ctx, BOMB_GRID, BOMB_PALETTE, pixelSize);

  ctx.restore();
}

function drawLifeItem(item) {
  ctx.save();
  ctx.translate(item.x, item.y);
  const pixelSize = (item.radius * 2) / LIFE_GRID[0].length;
  drawPixelSprite(ctx, LIFE_GRID, LIFE_PALETTE, pixelSize);
  ctx.restore();
}

function drawTrail() {
  if (trail.length < 2) return;

  const color = selectedCat ? selectedCat.accent : "#ff9ac2";
  const offsets = [-6, 0, 6];
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
}

function drawHUD() {
  if (!started) return;

  ctx.fillStyle = "#5a4a6a";
  ctx.font = "28px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Score: " + score, 20, 40);

  ctx.textAlign = "right";
  ctx.fillText("Lives: " + lives, canvas.width - 20, 40);
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

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