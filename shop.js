const today = new Date().toISOString().slice(0, 10);
const save = JSON.parse(localStorage.getItem('catNinja') || 'null') ||
  { coins: 0, best: 0, weapon: 'katana', skin: 'classic', env: 'cyber',
    owned: ['katana', 'classic', 'cyber'], daily: {} };
if (save.daily.date !== today) save.daily = { date: today, slices: 0, bombs: 0, combo: 0, claimed: false };
const persist = () => localStorage.setItem('catNinja', JSON.stringify(save));
const $ = id => document.getElementById(id);

const MODE_INFO = {
  classic: '3 lives. Get the highest score.',
  time: '60 seconds. Slice as many cats as possible.',
  endless: 'Cats continuously become faster.',
  zen: 'No bombs. Relaxing gameplay.',
  hardcore: 'Extremely fast cats + more bombs.',
  boss: 'Fight a giant boss cat.',
  challenge: 'Complete missions for bonus coins.',
};
const TABS = [['daily','🎯 Daily Challenge'],['modes','🎮 Game Modes'],['weapons','⚔️ Blades'],['skins','🐱 Cats'],['envs','🌍 Worlds']];
const SHOP = { weapons: { list: WEAPONS, key: 'weapon' }, skins: { list: SKINS, key: 'skin' }, envs: { list: ENVS, key: 'env' } };
let tab = 'modes';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function renderTabs() {
  $('tabs').innerHTML = '';
  TABS.forEach(([id, label]) => {
    const b = el('button', id === tab ? 'active' : '', label);
    b.onclick = () => { tab = id; render(); };
    $('tabs').appendChild(b);
  });
}

function renderItems() {
  const box = $('items'); box.innerHTML = '';
  if (tab === 'daily') {
    const d = save.daily, card = el('div', 'card wide');
    card.innerHTML = `🎯 <b>DAILY CHALLENGE</b><br>
      Slice ${DAILY.slices} cats (${Math.min(d.slices, DAILY.slices)}/${DAILY.slices})<br>
      Don't hit any bombs (${d.bombs === 0 ? '✔' : '✘'})<br>
      Achieve a ${DAILY.combo}× combo (${d.combo}/${DAILY.combo})<br>
      Reward: 🪙 ${DAILY.reward} ${d.claimed ? '✅ Claimed' : ''}<br><small>Resets every day.</small>`;
    box.appendChild(card); return;
  }
  if (tab === 'modes') {
    for (const k in MODES) {
      const card = el('div', 'card');
      card.appendChild(el('h3', '', MODES[k].name));
      card.appendChild(el('p', '', MODE_INFO[k] || ''));
      const b = el('button', '', '▶ Play');
      b.onclick = () => location.href = `game.html?mode=${k}`;
      card.appendChild(b); box.appendChild(card);
    }
    return;
  }
  const { list, key } = SHOP[tab];
  list.forEach(o => {
    const own = save.owned.includes(o.id), equipped = save[key] === o.id;
    const card = el('div', 'card');
    card.appendChild(el('div', 'emoji', o.emoji + (o.extra || '')));
    card.appendChild(el('h3', '', o.name));
    const b = el('button');
    if (equipped) { b.textContent = '✅ Equipped'; b.disabled = true; }
    else if (own) b.textContent = 'Equip';
    else { b.textContent = `🪙 ${o.cost} - Buy`; if (save.coins < o.cost) b.disabled = true; }
    b.onclick = () => {
      if (!own) { if (save.coins < o.cost) return; save.coins -= o.cost; save.owned.push(o.id); }
      save[key] = o.id; persist(); render();
    };
    card.appendChild(b); box.appendChild(card);
  });
}

function render() {
  $('coins').textContent = `🪙 ${save.coins}   |   🏆 Best: ${save.best}`;
  renderTabs(); renderItems();
}
render();