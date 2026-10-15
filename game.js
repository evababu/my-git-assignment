const cv = document.getElementById('game'), c = cv.getContext('2d');
let W, H;
function fit() { W = cv.width = innerWidth; H = cv.height = innerHeight; }
fit(); addEventListener('resize', fit);

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
}

function loop() { if (S && !S.over) update(); draw(); requestAnimationFrame(loop); }
const modeKey = new URLSearchParams(location.search).get('mode');
const pickedMode = MODES[modeKey] ? modeKey : 'classic';
$('play').textContent = `▶ Play ${MODES[pickedMode].name}`;
$('play').onclick = () => start(pickedMode);
renderMenu(); loop();