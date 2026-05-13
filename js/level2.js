/* ============================================================
   level2.js - Reto 2: almuerzo en el bar Casablanca
   Implementado sobre DOM con transform/translate3d para que el
   render lo haga el compositor GPU (mucho mejor en móvil que
   redibujar un canvas con emojis cada frame).
   ============================================================ */
(function () {
  'use strict';

  const TIME_LIMIT = 45;
  const SCORE_GOAL = 1000;
  const GRAVITY = 700;        // px/s²
  const PLAYER_SPEED = 320;   // px/s
  const ITEM_SIZE = 44;
  const PLAYER_W = 86;

  // Catálogo
  const POOL_MEAT  = [
    { emoji: '🍖', pts: 100 }, { emoji: '🍗', pts: 75 },
    { emoji: '🥩', pts: 120 }, { emoji: '🍔', pts: 110 },
    { emoji: '🌭', pts: 80  }, { emoji: '🥓', pts: 90 },
    { emoji: '🍤', pts: 90  },
    // El gorrino entero y la oreja de cerdo (tapa de toda la vida)
    { emoji: '🐖', pts: 150 },
    { emoji: '👂', pts: 130 },
  ];
  const POOL_DRINK = [
    { emoji: '🍺', pts: 75  }, { emoji: '🍷', pts: 75  },
    { emoji: '🥃', pts: 100 }, { emoji: '☕', pts: 50  },
  ];
  const POOL_VEG = [
    { emoji: '🥬', pts: -75 }, { emoji: '🥦', pts: -100 },
    { emoji: '🥕', pts: -50 }, { emoji: '🥒', pts:  -75 },
    { emoji: '🌶️', pts: -120 },
  ];

  // Estado
  let stage, world, waiter, itemsEl, playerEl, popupsEl;
  let inited = false;
  let running = false;
  let raf = null;
  let lastTime = 0;
  let score = 0;
  let timeLeft = TIME_LIMIT;
  let phase = 'play';
  let stageW = 360, stageH = 640;
  let waiterX = 180, waiterY = 100;
  const player = { x: 0, w: PLAYER_W, h: 110 };
  let touchLeftDown = false, touchRightDown = false;
  const items = [];   // { el, x, y, vx, vy, type, pts, dead }
  let spawnTimer = 0;

  function rand(min, max) { return min + Math.random() * (max - min); }
  function pickFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  // -------------------- Setup --------------------
  function init() {
    if (inited) return;
    inited = true;
    stage    = document.getElementById('gameStage2');
    world    = document.getElementById('l2World');
    waiter   = document.getElementById('l2Waiter');
    itemsEl  = document.getElementById('l2Items');
    playerEl = document.getElementById('l2Player');
    popupsEl = document.getElementById('l2Popups');
    bindControls();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
  }

  function bindControls() {
    const tL = document.getElementById('touchLeft');
    const tR = document.getElementById('touchRight');
    const press = (which, val) => (e) => {
      e.preventDefault();
      if (which === 'L') touchLeftDown = val;
      else               touchRightDown = val;
    };
    ['touchstart', 'pointerdown', 'mousedown'].forEach((ev) => {
      tL.addEventListener(ev, press('L', true), { passive: false });
      tR.addEventListener(ev, press('R', true), { passive: false });
    });
    ['touchend', 'touchcancel', 'pointerup', 'pointercancel', 'mouseup', 'mouseleave'].forEach((ev) => {
      tL.addEventListener(ev, press('L', false), { passive: false });
      tR.addEventListener(ev, press('R', false), { passive: false });
    });
    window.addEventListener('keydown', (e) => {
      if (!running) return;
      if (e.key === 'ArrowLeft' || e.key === 'a')  touchLeftDown = true;
      if (e.key === 'ArrowRight' || e.key === 'd') touchRightDown = true;
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a')  touchLeftDown = false;
      if (e.key === 'ArrowRight' || e.key === 'd') touchRightDown = false;
    });
  }

  function resize() {
    if (!stage) return;
    stageW = stage.clientWidth  || 360;
    stageH = stage.clientHeight || 640;
    // Recalcula posición del camarero en píxeles físicos
    waiterX = stageW / 2;
    waiterY = stageH * 0.12;
    // Reubica al jugador si está fuera de pantalla por un resize
    if (player.x + player.w > stageW) player.x = stageW - player.w;
    if (player.x < 0) player.x = 0;
    applyPlayerTransform();
  }

  function applyPlayerTransform() {
    if (playerEl) playerEl.style.transform = `translate3d(${player.x}px, 0, 0)`;
  }

  // -------------------- Lógica --------------------
  function reset() {
    score = 0;
    timeLeft = TIME_LIMIT;
    phase = 'play';
    touchLeftDown = false;
    touchRightDown = false;
    spawnTimer = 0.5;
    items.length = 0;
    // Limpiar DOM
    if (itemsEl) itemsEl.innerHTML = '';
    if (popupsEl) popupsEl.innerHTML = '';
    resize();
    player.x = (stageW - player.w) / 2;
    applyPlayerTransform();
    updateHUD();
  }

  function spawnItem() {
    const r = Math.random();
    let pool, type;
    if (r < 0.30)      { pool = POOL_MEAT;  type = 'meat'; }
    else if (r < 0.55) { pool = POOL_DRINK; type = 'drink'; }
    else               { pool = POOL_VEG;   type = 'veg'; }
    const proto = pickFrom(pool);

    const el = document.createElement('div');
    el.className = 'l2-item';
    el.textContent = proto.emoji;
    itemsEl.appendChild(el);

    const it = {
      el,
      x: waiterX - ITEM_SIZE / 2 + rand(-12, 12),
      y: waiterY + 24,
      vx: rand(-140, 140),
      vy: rand(40, 110),
      type,
      pts: proto.pts,
      dead: false,
    };
    el.style.transform = `translate3d(${it.x}px, ${it.y}px, 0)`;
    items.push(it);

    // Animación del camarero (lanzamiento)
    waiter.classList.add('is-throw');
    clearTimeout(waiter._tt);
    waiter._tt = setTimeout(() => waiter.classList.remove('is-throw'), 130);

    window.SFX && SFX.play('throw');
  }

  function popup(text, x, y, bad) {
    const el = document.createElement('div');
    el.className = 'l2-popup' + (bad ? ' l2-popup--bad' : '');
    el.textContent = text;
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    popupsEl.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  // Animación de masticar: parte la cara en dos y baja la mandíbula
  function chew() {
    if (!playerEl) return;
    playerEl.classList.remove('is-chew');
    // Force reflow para reiniciar la animación si se encadenan bocados
    void playerEl.offsetHeight;
    playerEl.classList.add('is-chew');
    clearTimeout(playerEl._chewTimer);
    playerEl._chewTimer = setTimeout(() => {
      playerEl.classList.remove('is-chew');
    }, 200);
  }

  function update(dt) {
    if (phase !== 'play') return;

    // Tiempo (congelado en debug)
    if (!window.debugMode) {
      const prevSec = Math.max(0, Math.ceil(timeLeft));
      timeLeft -= dt;
      if (timeLeft <= 0) {
        timeLeft = 0;
        updateHUD();
        if (score >= SCORE_GOAL) winLevel();
        else                     loseLevel();
        return;
      }
      const curSec = Math.max(0, Math.ceil(timeLeft));
      if (curSec !== prevSec) updateHUD();
    }

    // Movimiento jugador
    const dir = (touchRightDown ? 1 : 0) - (touchLeftDown ? 1 : 0);
    if (dir !== 0) {
      player.x += dir * PLAYER_SPEED * dt;
      if (player.x < 4) player.x = 4;
      if (player.x + player.w > stageW - 4) player.x = stageW - 4 - player.w;
      applyPlayerTransform();
    }

    // Spawning a ritmo constante (con un pequeño jitter para que no
    // se sienta robótico)
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnItem();
      spawnTimer = 0.4 + rand(-0.06, 0.08);
    }

    // Físicas items
    const groundY = stageH - 30;
    const mouthX = player.x + 12;
    const mouthY = stageH * 0.78; // aprox. parte alta del cuerpo del jugador
    const mouthW = player.w - 24;
    const mouthH = 60;

    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (it.dead) {
        it.el.remove();
        items.splice(i, 1);
        continue;
      }
      it.vy += GRAVITY * dt;
      it.x += it.vx * dt;
      it.y += it.vy * dt;
      // Rebote suave en paredes
      if (it.x < 0 && it.vx < 0) { it.x = 0; it.vx = -it.vx * 0.6; }
      if (it.x + ITEM_SIZE > stageW && it.vx > 0) {
        it.x = stageW - ITEM_SIZE; it.vx = -it.vx * 0.6;
      }
      // Aplica posición (la única vez por frame y por item)
      it.el.style.transform = `translate3d(${it.x}px, ${it.y}px, 0)`;

      // Colisión con la "boca" del jugador
      if (
        it.x + ITEM_SIZE > mouthX && it.x < mouthX + mouthW &&
        it.y + ITEM_SIZE > mouthY && it.y < mouthY + mouthH
      ) {
        if (it.type === 'veg') {
          score += it.pts; // negativo
          popup('¡PUAJ! ' + it.pts, it.x, it.y, true);
          window.SFX && SFX.play('eatBad');
        } else if (it.type === 'drink') {
          score += it.pts;
          popup('+' + it.pts, it.x, it.y, false);
          window.SFX && SFX.play('eatDrink');
        } else {
          score += it.pts;
          popup('+' + it.pts, it.x, it.y, false);
          window.SFX && SFX.play('eatGood');
        }
        chew();
        it.dead = true;
        it.el.remove();
        items.splice(i, 1);
        updateHUD();
        if (score >= SCORE_GOAL) { winLevel(); return; }
        continue;
      }

      // Cae al suelo: se descarta. Si era comida/bebida que sumaba,
      // se penaliza con la mitad de su valor por dejarla caer.
      if (it.y > groundY) {
        if (it.type !== 'veg') {
          const penalty = Math.ceil(Math.abs(it.pts) / 2);
          score -= penalty;
          popup('-' + penalty, it.x, groundY - 28, true);
          window.SFX && SFX.play('hurt');
          updateHUD();
        }
        it.dead = true;
        it.el.remove();
        items.splice(i, 1);
      }
    }
  }

  function updateHUD() {
    const s = document.getElementById('hud2Score');
    const t = document.getElementById('hud2Time');
    if (s) s.textContent = score;
    if (t) t.textContent = Math.max(0, Math.ceil(timeLeft));
  }

  function winLevel() {
    if (phase === 'win') return;
    phase = 'win';
    running = false;
    setTimeout(() => {
      window.Game && window.Game.onLevel2Complete && window.Game.onLevel2Complete();
    }, 400);
  }
  function loseLevel() {
    if (phase === 'over') return;
    phase = 'over';
    running = false;
    setTimeout(() => {
      window.Game && window.Game.onLevel2GameOver && window.Game.onLevel2GameOver();
    }, 400);
  }

  // -------------------- Bucle --------------------
  function tick(ts) {
    if (!running) return;
    if (!lastTime) lastTime = ts;
    const dt = Math.min(0.05, (ts - lastTime) / 1000);
    lastTime = ts;
    update(dt);
    raf = requestAnimationFrame(tick);
  }

  // -------------------- API pública --------------------
  function start() {
    init();
    resize();
    reset();
    running = true;
    lastTime = 0;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  window.Level2 = { start, stop };
})();
