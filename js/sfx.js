/* ============================================================
   sfx.js - Efectos de sonido retro generados con Web Audio API.
   No requiere assets externos.

   API pública:
     SFX.play('nombre')   reproduce un efecto
     SFX.toggle()         activa/desactiva sonido (devuelve estado)
     SFX.isEnabled()
   ============================================================ */
(function () {
  'use strict';

  let ctx = null;
  let master = null;
  // Preferencia persistida en localStorage
  let enabled = (localStorage.getItem('blas_sfx_enabled') !== '0');

  function ensureCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.6;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }

  // Cualquier toque/click/tecla desbloquea el audio en navegadores móviles
  ['pointerdown', 'touchstart', 'keydown', 'click'].forEach((ev) => {
    window.addEventListener(ev, () => { if (enabled) ensureCtx(); }, { passive: true });
  });

  // ---------------------------------------------
  // Primitivas
  // ---------------------------------------------
  function tone(opts) {
    if (!enabled || !ensureCtx()) return;
    const {
      freq = 440,
      freqEnd = null,
      dur = 0.1,
      type = 'square',
      vol = 0.15,
      delay = 0,
    } = opts;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== null) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(20, freqEnd), t0 + dur
      );
    }
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + Math.min(0.01, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noiseBurst(opts) {
    if (!enabled || !ensureCtx()) return;
    const { dur = 0.1, vol = 0.2, delay = 0, lp = null } = opts;
    const t0 = ctx.currentTime + delay;
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let last = g;
    if (lp) {
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = lp;
      src.connect(filt);
      filt.connect(g);
    } else {
      src.connect(g);
    }
    g.connect(master);
    src.start(t0);
  }

  function seq(notes) {
    let d = 0;
    notes.forEach((n) => {
      tone({ ...n, delay: d });
      d += (n.gap !== undefined ? n.gap : n.dur);
    });
  }

  // ---------------------------------------------
  // Catálogo de efectos
  // ---------------------------------------------
  const SOUNDS = {
    // UI
    click: () => tone({ freq: 700, dur: 0.05, type: 'square', vol: 0.10 }),
    select: () => seq([
      { freq: 600, dur: 0.04, type: 'square', vol: 0.10, gap: 0.05 },
      { freq: 900, dur: 0.06, type: 'square', vol: 0.10 },
    ]),
    bubble: () => tone({ freq: 1200, dur: 0.03, type: 'square', vol: 0.06 }),

    // Reto 1
    jump: () => tone({ freq: 280, freqEnd: 640, dur: 0.14, type: 'square', vol: 0.12 }),
    shoot: () => tone({ freq: 900, freqEnd: 380, dur: 0.08, type: 'sawtooth', vol: 0.10 }),
    stomp: () => {
      noiseBurst({ dur: 0.09, vol: 0.18, lp: 1500 });
      tone({ freq: 140, freqEnd: 70, dur: 0.12, type: 'square', vol: 0.12, delay: 0.005 });
    },
    hit: () => seq([
      { freq: 520, dur: 0.06, type: 'square', vol: 0.14, gap: 0.05 },
      { freq: 220, dur: 0.10, type: 'square', vol: 0.12 },
    ]),
    coin: () => seq([
      { freq: 988, dur: 0.05, type: 'square', vol: 0.12, gap: 0.06 },
      { freq: 1319, dur: 0.10, type: 'square', vol: 0.12 },
    ]),
    hurt: () => seq([
      { freq: 400, dur: 0.08, type: 'triangle', vol: 0.14, gap: 0.08 },
      { freq: 180, dur: 0.16, type: 'triangle', vol: 0.14 },
    ]),
    angry: () => seq([
      { freq: 280, dur: 0.08, type: 'sawtooth', vol: 0.16, gap: 0.06 },
      { freq: 200, dur: 0.10, type: 'sawtooth', vol: 0.16, gap: 0.05 },
      { freq: 150, dur: 0.14, type: 'sawtooth', vol: 0.14 },
    ]),
    // Carga / lanzamiento del salto final
    charge: () => tone({ freq: 200, freqEnd: 80, dur: 0.20, type: 'sawtooth', vol: 0.12 }),
    bigJump: () => tone({ freq: 200, freqEnd: 900, dur: 0.32, type: 'square', vol: 0.16 }),
    pio: () => seq([
      { freq: 1500, dur: 0.05, type: 'square', vol: 0.14, gap: 0.10 },
      { freq: 1800, dur: 0.05, type: 'square', vol: 0.14, gap: 0.18 },
      { freq: 1500, dur: 0.05, type: 'square', vol: 0.14, gap: 0.10 },
      { freq: 1800, dur: 0.05, type: 'square', vol: 0.14 },
    ]),
    fall: () => {
      tone({ freq: 700, freqEnd: 90, dur: 0.55, type: 'sawtooth', vol: 0.14 });
      noiseBurst({ dur: 0.12, vol: 0.22, lp: 800, delay: 0.55 });
    },

    // Reto 2
    eatGood: () => seq([
      { freq: 784, dur: 0.05, type: 'square', vol: 0.12, gap: 0.05 },
      { freq: 1175, dur: 0.07, type: 'square', vol: 0.12 },
    ]),
    eatDrink: () => seq([
      { freq: 660, dur: 0.06, type: 'triangle', vol: 0.14, gap: 0.06 },
      { freq: 880, dur: 0.10, type: 'triangle', vol: 0.14 },
    ]),
    eatBad: () => seq([
      { freq: 220, dur: 0.08, type: 'sawtooth', vol: 0.16, gap: 0.06 },
      { freq: 160, dur: 0.12, type: 'sawtooth', vol: 0.14 },
    ]),
    throw: () => tone({ freq: 500, freqEnd: 800, dur: 0.06, type: 'square', vol: 0.08 }),

    // Finales
    win: () => seq([
      { freq: 523, dur: 0.10, type: 'square', vol: 0.16, gap: 0.10 },
      { freq: 659, dur: 0.10, type: 'square', vol: 0.16, gap: 0.10 },
      { freq: 784, dur: 0.10, type: 'square', vol: 0.16, gap: 0.10 },
      { freq: 1046, dur: 0.22, type: 'square', vol: 0.18 },
    ]),
    gameover: () => seq([
      { freq: 523, dur: 0.14, type: 'triangle', vol: 0.16, gap: 0.16 },
      { freq: 440, dur: 0.14, type: 'triangle', vol: 0.16, gap: 0.16 },
      { freq: 349, dur: 0.14, type: 'triangle', vol: 0.16, gap: 0.16 },
      { freq: 261, dur: 0.32, type: 'triangle', vol: 0.18 },
    ]),
    start: () => seq([
      { freq: 523, dur: 0.07, type: 'square', vol: 0.14, gap: 0.08 },
      { freq: 784, dur: 0.07, type: 'square', vol: 0.14, gap: 0.08 },
      { freq: 1046, dur: 0.14, type: 'square', vol: 0.16 },
    ]),
  };

  // ---------------------------------------------
  // API pública
  // ---------------------------------------------
  function persist() {
    localStorage.setItem('blas_sfx_enabled', enabled ? '1' : '0');
  }

  window.SFX = {
    play(name) {
      const fn = SOUNDS[name];
      if (fn) fn();
    },
    toggle() {
      enabled = !enabled;
      persist();
      if (enabled) ensureCtx();
      // Sincronizar UI si existe el botón
      document.querySelectorAll('[data-mute]').forEach((el) => {
        el.classList.toggle('is-muted', !enabled);
        el.setAttribute('aria-pressed', String(!enabled));
        el.textContent = enabled ? '🔊' : '🔇';
      });
      return enabled;
    },
    isEnabled() { return enabled; },
    // Inicializa el estado del botón al cargar
    syncUI() {
      document.querySelectorAll('[data-mute]').forEach((el) => {
        el.classList.toggle('is-muted', !enabled);
        el.setAttribute('aria-pressed', String(!enabled));
        el.textContent = enabled ? '🔊' : '🔇';
      });
    },
  };
})();
