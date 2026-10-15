const WEAPONS = [
  { id: 'katana',    emoji: '🗡️', name: 'Katana',         cost: 0,    color: '#e8e8ff', fx: 'plain' },
  { id: 'dual',      emoji: '⚔️', name: 'Dual Swords',    cost: 300,  color: '#ffd24d', fx: 'dual' },
  { id: 'knife',     emoji: '🔪', name: 'Knife',          cost: 200,  color: '#bbbbbb', fx: 'thin' },
  { id: 'lightning', emoji: '⚡', name: 'Lightning Blade', cost: 800,  color: '#fff25e', fx: 'lightning' },
  { id: 'fire',      emoji: '🔥', name: 'Fire Sword',     cost: 1500, color: '#ff6a1a', fx: 'fire' },
  { id: 'ice',       emoji: '❄️', name: 'Ice Sword',      cost: 1500, color: '#7fdcff', fx: 'ice' },
  { id: 'wand',      emoji: '🪄', name: 'Magic Wand',     cost: 2000, color: '#d68bff', fx: 'sparkle' },
  { id: 'energy',    emoji: '🌀', name: 'Energy Blade',   cost: 3000, color: '#00ffc8', fx: 'glow' },
];

const SKINS = [
  { id: 'classic', emoji: '🐱', extra: '',   name: 'Classic Cat', cost: 0 },
  { id: 'ninja',   emoji: '🐱', extra: '🥷', name: 'Ninja Cat',   cost: 400 },
  { id: 'royal',   emoji: '🐱', extra: '👑', name: 'Royal Cat',   cost: 800 },
  { id: 'wizard',  emoji: '🐱', extra: '🧙', name: 'Wizard Cat',  cost: 1200 },
  { id: 'space',   emoji: '🐱', extra: '🚀', name: 'Space Cat',   cost: 2000 },
];

const ENVS = [
  { id: 'cyber',    emoji: '🌆', name: 'Cyber City',      cost: 0,    a: '#1b0033', b: '#00b3ff' },
  { id: 'garden',   emoji: '🌸', name: 'Japanese Garden', cost: 300,  a: '#ffc2d9', b: '#7cc576' },
  { id: 'castle',   emoji: '🏰', name: 'Castle',          cost: 500,  a: '#4a4e69', b: '#9a8c98' },
  { id: 'moon',     emoji: '🌙', name: 'Moonlight',       cost: 700,  a: '#02020f', b: '#2a3a7a' },
  { id: 'forest',   emoji: '🌲', name: 'Forest',          cost: 900,  a: '#0b3d20', b: '#4c9a2a' },
  { id: 'casino',   emoji: '🎰', name: 'Casino Night',    cost: 1200, a: '#2b0000', b: '#c8102e' },
  { id: 'volcano',  emoji: '🔥', name: 'Volcano',         cost: 1500, a: '#1a0000', b: '#ff4500' },
];

const MODES = {
  classic:   { name: '🎮 Classic',   lives: 3 },
  time:      { name: '⏱️ Time Attack', lives: Infinity, time: 60 },
  endless:   { name: '♾️ Endless',   lives: 3, ramp: true },
  zen:       { name: '🧘 Zen',       lives: Infinity, noBombs: true },
  hardcore:  { name: '💀 Hardcore',  lives: 1, speed: 1.3, bombs: 0.3, interval: 30 },
  boss:      { name: '👹 Boss',      lives: 5, boss: true },
  challenge: { name: '📋 Challenge', lives: Infinity, time: 90, missions: true },
};

const MISSIONS = [
  { t: 'Slice 50 cats',     ok: s => s.sliced >= 50 },
  { t: 'Get a 10× combo',   ok: s => s.maxCombo >= 10 },
  { t: "Don't miss a cat",  ok: s => s.missed === 0 && s.sliced >= 20 },
  { t: 'Score 500 points',  ok: s => s.score >= 500 },
];

const DAILY = { slices: 75, combo: 15, reward: 250 };