/* ============================================================
   level3.js - Reto 3: partido de pádel
   Pong vertical en el que Blas + Belasteguín (pala abajo, control
   con izq/derecha) intentan ganar un juego de pádel a Lebrón +
   Galán (pala arriba, controlada por IA).
   Marcador estilo pádel: 15-30-40, deuce, ventaja, juego.
   ============================================================ */
(function () {
  'use strict';

  // -------------------- Configuración --------------------
  const PADDLE_W = 140;
  const PADDLE_H = 80;
  const BALL_R   = 16;
  const PADDLE_SPEED = 380;       // velocidad del jugador (px/s)
  const AI_SPEED_REACT  = 150;    // IA reaccionando a la bola
  const AI_SPEED_RESET  = 70;     // IA recolocándose en pausa
  const BALL_SPEED_INIT = 260;    // módulo inicial de la velocidad
  const BALL_SPEED_MAX  = 460;    // tope al subir tras cada golpe
  const SPIN_FACTOR     = 110;    // empuje horizontal según punto de golpe
  const POINT_PAUSE     = 0.9;    // segundos de pausa tras cada punto

  const PTS_LABELS = ['0', '15', '30', '40'];

  // -------------------- Estado --------------------
  let stage, world, paddleTopEl, paddleBotEl, ballEl, scoreAEl, scoreBEl, stateEl;
  let mpEl, mpSubEl;
  let inited = false;
  let running = false;
  let raf = null;
  let lastTime = 0;
  let stageW = 360, stageH = 640;
  let phase = 'play';           // 'play' | 'point' | 'won' | 'lost'
  let pointTimer = 0;
  let scoreA = 0;               // Blas + Belasteguín
  let scoreB = 0;               // Lebrón + Galán
  let touchLeftDown = false, touchRightDown = false;

  const paddleTop = { x: 0, y: 0, w: PADDLE_W, h: PADDLE_H };
  const paddleBot = { x: 0, y: 0, w: PADDLE_W, h: PADDLE_H };
  const ball      = { x: 0, y: 0, vx: 0, vy: 0, r: BALL_R };

  // -------------------- Utilidades --------------------
  function rand(min, max) { return min + Math.random() * (max - min); }
  function sign(n) { return n < 0 ? -1 : 1; }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // -------------------- Setup --------------------
  function init() {
    if (inited) return;
    inited = true;
    stage       = document.getElementById('gameStage3');
    world       = document.getElementById('l3World');
    paddleTopEl = document.getElementById('l3PaddleTop');
    paddleBotEl = document.getElementById('l3PaddleBottom');
    ballEl      = document.getElementById('l3Ball');
    scoreAEl    = document.getElementById('l3ScoreA');
    scoreBEl    = document.getElementById('l3ScoreB');
    stateEl     = document.getElementById('l3State');
    mpEl        = document.getElementById('l3Matchpoint');
    mpSubEl     = document.getElementById('l3MatchpointSub');
    bindControls();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
  }

  function bindControls() {
    const tL = document.getElementById('touchLeft3');
    const tR = document.getElementById('touchRight3');
    const press = (which, val) => (e) => {
      e.preventDefault();
      if (which === 'L') touchLeftDown = val;
      else               touchRightDown = val;
    };
    ['touchstart', 'pointerdown', 'mousedown'].forEach((ev) => {
      tL.addEventListener(ev, press('L', true),  { passive: false });
      tR.addEventListener(ev, press('R', true),  { passive: false });
    });
    ['touchend', 'touchcancel', 'pointerup', 'pointercancel', 'mouseup', 'mouseleave'].forEach((ev) => {
      tL.addEventListener(ev, press('L', false), { passive: false });
      tR.addEventListener(ev, press('R', false), { passive: false });
    });
    window.addEventListener('keydown', (e) => {
      if (!running) return;
      if (e.key === 'ArrowLeft' || e.key === 'a')  touchLeftDown  = true;
      if (e.key === 'ArrowRight' || e.key === 'd') touchRightDown = true;
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a')  touchLeftDown  = false;
      if (e.key === 'ArrowRight' || e.key === 'd') touchRightDown = false;
    });
  }

  function resize() {
    if (!stage) return;
    stageW = stage.clientWidth  || 360;
    stageH = stage.clientHeight || 640;
    // Reubicar palas dentro del stage manteniendo proporción
    paddleTop.y = Math.round(stageH * 0.16);
    paddleBot.y = Math.round(stageH * 0.74);
    paddleTop.x = clamp(paddleTop.x, 0, stageW - paddleTop.w);
    paddleBot.x = clamp(paddleBot.x, 0, stageW - paddleBot.w);
    applyPaddleTransforms();
    applyBallTransform();
  }

  function applyPaddleTransforms() {
    if (paddleTopEl) paddleTopEl.style.transform = `translate3d(${paddleTop.x}px, 0, 0)`;
    if (paddleBotEl) paddleBotEl.style.transform = `translate3d(${paddleBot.x}px, 0, 0)`;
  }
  function applyBallTransform() {
    if (ballEl) ballEl.style.transform = `translate3d(${ball.x - BALL_R}px, ${ball.y - BALL_R}px, 0)`;
  }

  // -------------------- Lógica --------------------
  function reset() {
    scoreA = 0;
    scoreB = 0;
    phase = 'play';
    pointTimer = 0;
    hideMatchPoint();
    resize();
    paddleTop.x = (stageW - paddleTop.w) / 2;
    paddleBot.x = (stageW - paddleBot.w) / 2;
    resetBall(Math.random() < 0.5 ? 'A' : 'B');
    updateScoreboard();
    applyPaddleTransforms();
  }

  function resetBall(serveTo) {
    // serveTo = quién recibe (defiende):
    //   'A' (Blas+Bela, arriba) → bola sube
    //   'B' (rivales, abajo)    → bola baja
    ball.x = stageW / 2;
    ball.y = stageH / 2;
    const speed = BALL_SPEED_INIT;
    const angle = rand(-0.35, 0.35);
    const dirY = (serveTo === 'A') ? -1 : 1;
    ball.vx = Math.sin(angle) * speed;
    ball.vy = Math.cos(angle) * speed * dirY;
  }

  function update(dt) {
    if (phase === 'won' || phase === 'lost') return;

    // Movimiento del jugador (pala de arriba = Blas + Belasteguín)
    const dir = (touchRightDown ? 1 : 0) - (touchLeftDown ? 1 : 0);
    if (dir !== 0) {
      paddleTop.x += dir * PADDLE_SPEED * dt;
      paddleTop.x = clamp(paddleTop.x, 0, stageW - paddleTop.w);
    }

    // IA de la pala de abajo (rivales)
    updateAI(dt);

    if (phase === 'point') {
      pointTimer -= dt;
      if (pointTimer <= 0) {
        // ¿Final del partido tras este punto?
        if (checkGameEnd()) return;
        // Saque hacia quien acaba de perder el punto
        hideMatchPoint();
        resetBall(lastWinner === 'A' ? 'B' : 'A');
        phase = 'play';
        stateEl && stateEl.classList.remove('is-deuce','is-adv-a','is-adv-b');
        if (stateEl) stateEl.textContent = '';
      }
      applyPaddleTransforms();
      applyBallTransform();
      return;
    }

    // Movimiento de la bola
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    // Rebotes laterales
    if (ball.x < BALL_R) {
      ball.x = BALL_R;
      ball.vx = Math.abs(ball.vx);
      window.SFX && SFX.play('bubble');
    }
    if (ball.x > stageW - BALL_R) {
      ball.x = stageW - BALL_R;
      ball.vx = -Math.abs(ball.vx);
      window.SFX && SFX.play('bubble');
    }

    // Colisión con la pala de abajo (Blas + Belasteguín)
    if (
      ball.vy > 0 &&
      ball.y + BALL_R >= paddleBot.y &&
      ball.y + BALL_R <= paddleBot.y + paddleBot.h * 0.55 &&
      ball.x >= paddleBot.x && ball.x <= paddleBot.x + paddleBot.w
    ) {
      ball.y = paddleBot.y - BALL_R;
      ball.vy = -Math.abs(ball.vy) * 1.04;
      const off = (ball.x - (paddleBot.x + paddleBot.w / 2)) / (paddleBot.w / 2);
      ball.vx = clamp(ball.vx + off * SPIN_FACTOR, -BALL_SPEED_MAX, BALL_SPEED_MAX);
      ball.vy = clamp(ball.vy, -BALL_SPEED_MAX, BALL_SPEED_MAX);
      window.SFX && SFX.play('hit');
    }

    // Colisión con la pala de arriba
    if (
      ball.vy < 0 &&
      ball.y - BALL_R <= paddleTop.y + paddleTop.h &&
      ball.y - BALL_R >= paddleTop.y + paddleTop.h * 0.45 &&
      ball.x >= paddleTop.x && ball.x <= paddleTop.x + paddleTop.w
    ) {
      ball.y = paddleTop.y + paddleTop.h + BALL_R;
      ball.vy = Math.abs(ball.vy) * 1.04;
      const off = (ball.x - (paddleTop.x + paddleTop.w / 2)) / (paddleTop.w / 2);
      ball.vx = clamp(ball.vx + off * SPIN_FACTOR, -BALL_SPEED_MAX, BALL_SPEED_MAX);
      ball.vy = clamp(ball.vy, -BALL_SPEED_MAX, BALL_SPEED_MAX);
      window.SFX && SFX.play('hit');
    }

    // Limitar la velocidad final tras el golpe
    if (Math.abs(ball.vy) > BALL_SPEED_MAX) ball.vy = sign(ball.vy) * BALL_SPEED_MAX;

    // Si la bola escapa por arriba, han fallado los de arriba (Blas+Bela)
    // → punto para los rivales (B). Y al revés.
    if (ball.y < -BALL_R - 10) {
      pointFor('B');
    } else if (ball.y > stageH + BALL_R + 10) {
      pointFor('A');
    }

    applyPaddleTransforms();
    applyBallTransform();
  }

  let lastWinner = 'A';
  function pointFor(team) {
    lastWinner = team;
    if (team === 'A') {
      scoreA++;
      window.SFX && SFX.play('coin');
    } else {
      scoreB++;
      window.SFX && SFX.play('hurt');
    }
    updateScoreboard();
    phase = 'point';
    pointTimer = POINT_PAUSE;
    // Bola se "congela" en su última posición durante el pause
    ball.vx = 0;
    ball.vy = 0;
    // Aviso "¡Punto de partido!" si el siguiente bola lo es
    maybeShowMatchPoint();
  }

  // ¿Sería match-point ganar el SIGUIENTE punto para "team"?
  function isMatchPointFor(team) {
    const me    = team === 'A' ? scoreA : scoreB;
    const other = team === 'A' ? scoreB : scoreA;
    return (me + 1 >= 4) && (me + 1 - other >= 2);
  }

  function maybeShowMatchPoint() {
    if (!mpEl) return;
    // No mostrar si el partido ya ha terminado (gana este punto)
    if (scoreA >= 4 && scoreA - scoreB >= 2) return;
    if (scoreB >= 4 && scoreB - scoreA >= 2) return;

    let sub = '';
    let rivals = false;
    if (isMatchPointFor('A')) {
      sub = 'BLAS + BELA';
    } else if (isMatchPointFor('B')) {
      sub = 'LEBRÓN + GALÁN';
      rivals = true;
    } else {
      hideMatchPoint();
      return;
    }
    if (mpSubEl) mpSubEl.textContent = sub;
    mpEl.classList.toggle('l3-matchpoint--rivals', rivals);
    mpEl.classList.add('is-active');
    window.SFX && SFX.play('select');
  }

  function hideMatchPoint() {
    if (mpEl) mpEl.classList.remove('is-active');
  }

  function updateAI(dt) {
    const target = ball.x - paddleBot.w / 2;
    // Reactiva cuando la bola va hacia los rivales (vy > 0). Lenta al recolocarse.
    const reactive = ball.vy > 0;
    const speed = reactive ? AI_SPEED_REACT : AI_SPEED_RESET;
    const dx = target - paddleBot.x;
    if (Math.abs(dx) < 3) return;
    paddleBot.x += sign(dx) * Math.min(Math.abs(dx), speed * dt);
    paddleBot.x = clamp(paddleBot.x, 0, stageW - paddleBot.w);
  }

  // -------------------- Marcador --------------------
  function updateScoreboard() {
    // Etiquetas según pádel
    let labelA = '0', labelB = '0';
    let state = '', cls = '';
    if (scoreA >= 3 && scoreB >= 3) {
      if (scoreA === scoreB) {
        labelA = labelB = '40';
        state = 'DEUCE'; cls = 'is-deuce';
      } else if (scoreA === scoreB + 1) {
        labelA = 'AD'; labelB = '40';
        state = 'VENTAJA BLAS'; cls = 'is-adv-a';
      } else if (scoreB === scoreA + 1) {
        labelA = '40'; labelB = 'AD';
        state = 'VENTAJA RIVALES'; cls = 'is-adv-b';
      }
    } else {
      labelA = PTS_LABELS[scoreA] || '40';
      labelB = PTS_LABELS[scoreB] || '40';
    }
    if (scoreAEl) scoreAEl.textContent = labelA;
    if (scoreBEl) scoreBEl.textContent = labelB;
    if (stateEl) {
      stateEl.textContent = state;
      stateEl.classList.remove('is-deuce', 'is-adv-a', 'is-adv-b');
      if (cls) stateEl.classList.add(cls);
    }
  }

  function checkGameEnd() {
    if (scoreA >= 4 && scoreA - scoreB >= 2) { winLevel(); return true; }
    if (scoreB >= 4 && scoreB - scoreA >= 2) { loseLevel(); return true; }
    return false;
  }

  function winLevel() {
    if (phase === 'won') return;
    phase = 'won';
    running = false;
    setTimeout(() => {
      window.Game && window.Game.onLevel3Complete && window.Game.onLevel3Complete();
    }, 600);
  }
  function loseLevel() {
    if (phase === 'lost') return;
    phase = 'lost';
    running = false;
    setTimeout(() => {
      window.Game && window.Game.onLevel3GameOver && window.Game.onLevel3GameOver();
    }, 600);
  }

  // -------------------- Bucle --------------------
  function tick(ts) {
    if (!running) return;
    if (!lastTime) lastTime = ts;
    const dt = Math.min(0.04, (ts - lastTime) / 1000);
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

  window.Level3 = { start, stop };
})();
