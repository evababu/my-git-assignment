const SFX = (() => {
  let ctx, timer, step = 0;
  const mel  = [440,0,523,587,659,0,587,523, 440,0,392,440,523,0,440,0];
  const bass = [110,0,110,0,131,0,131,0, 98,0,98,0,110,0,110,0];

  function init() {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  }
  function tone(f, t, d, type, vol) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(g).connect(ctx.destination);
    o.start(t); o.stop(t + d);
  }
  let lastMeow = 0;
  return {
    startMusic() {
      init();
      if (timer) return;
      timer = setInterval(() => {
        const t = ctx.currentTime + 0.05, i = step % 16;
        if (mel[i])  tone(mel[i], t, 0.18, 'square', 0.04);
        if (bass[i]) tone(bass[i], t, 0.22, 'triangle', 0.08);
        step++;
      }, 170);
    },
    stopMusic() { clearInterval(timer); timer = null; },
    meow() {
      if (!ctx || ctx.currentTime - lastMeow < 0.15) return;
      lastMeow = ctx.currentTime;
      const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800;
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(600, t);
      o.frequency.linearRampToValueAtTime(950, t + 0.12);
      o.frequency.linearRampToValueAtTime(500, t + 0.35);
      g.gain.setValueAtTime(0.08, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
      o.connect(f).connect(g).connect(ctx.destination);
      o.start(t); o.stop(t + 0.4);
    },
    slice() { if (ctx) tone(1200, ctx.currentTime, 0.06, 'triangle', 0.06); },
    bomb()  { if (ctx) tone(70, ctx.currentTime, 0.4, 'sawtooth', 0.2); },
  };
})();