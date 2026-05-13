/* ============================================================
   level4.js - Reto 4 (final): tanda de penaltis
   Misma escena cenital para los dos modos. Cuando para el Madrid,
   el portero es Blas y el chutador uno del Madrid; cuando chuta
   Blas, el portero es Courtois y el chutador es Blas (apuntando y
   eligiendo potencia).

   Reglas especiales:
   - Brahim siempre tira el 5º del Madrid y lo falla (fuera).
   - Si llegan empatados al último penalti (el 10º, de Blas),
     Blas siempre lo mete.
   ============================================================ */
(function () {
  'use strict';

  // -------------------- Configuración --------------------
  const SHOTS_REG = 5;             // tiros por equipo
  const PHASE_ANNOUNCE = 1.4;      // segundos
  const PHASE_CONTROL  = 3.0;      // tiempo para mover portero / mantener pulsado
  const PHASE_FLIGHT_D = 0.95;     // vuelo balón en defensa (Madrid chuta)
  const PHASE_FLIGHT_A = 0.85;     // vuelo balón en ataque (Blas chuta)
  const PHASE_RESULT   = 1.7;
  const KEEPER_SPEED   = 1.05;     // mover portero (0..1 por segundo)
  const SAVE_TOLERANCE = 0.17;     // |tiro − portero| <= esto → parada

  // Barra de fuerza: ciclos por segundo y duración máxima manteniendo
  const POWER_FREQ     = 0.95;     // ~ ciclos completos por segundo
  const POWER_HOLD_MAX = 2.2;      // tras esto sale solo
  // Zonas de fuerza por valor 0..1:
  const POWER_WEAK_MAX   = 1 / 3;  // < 1/3 → flojo (para Courtois)
  const POWER_STRONG_MIN = 2 / 3;  // >= 2/3 → fuera

  // Chutadores del Madrid en orden fijo (5)
  const MAD_SHOOTERS = [
    { name: 'VINICIUS',   img: 'assets/vinicius-face.png'   },
    { name: 'MBAPPÉ',     img: 'assets/mbappe-face.png'     },
    { name: 'VALVERDE',   img: 'assets/valverde-face.png'   },
    { name: 'BELLINGHAM', img: 'assets/bellingham-face.png' },
    { name: 'BRAHIM',     img: 'assets/brahim-face.png'     }, // siempre falla
  ];

  // Insultos de Florentino (uno por cada penalti del Madrid)
  const FLO_INSULTS_DEF = [
    'ERES UN TOLILI',
    'ERES COMO CASILLAS, UN MONIGOTE',
    'VAYA ROBO, NEGREIRA',
    'MENUDO ZOQUETE',
    'DA IGUAL, TENEMOS 15 CHAMPIONS',
  ];
  // Insultos cuando chuta Blas
  const FLO_INSULTS_ATT = [
    'NO VAS A METER NI UNO',
    'COURTOIS TE COMERÁ',
    'EL VAR TE ANULARÁ',
    'NEGREIRA SIGUE COBRANDO',
    'TIRAS COMO MI TÍA',
  ];

  // -------------------- Estado --------------------
  let stage, world, msgEl, msgTextEl, msgImgEl;
  let scoreBlasEl, scoreMadEl, shotsEl;
  let keeperEl, keeperHeadEl;
  let ballEl, shooterEl, shooterHeadEl, shooterNameEl;
  let standEl, fansEl, floBubbleEl;
  let goalEl, aimEl;
  let powerEl, powerBarEl, hintEl;

  let inited = false, running = false, raf = null, lastTime = 0;
  let stageW = 360, stageH = 640;

  // Geometría cenital (compartida)
  let goalLeft = 0, goalTop = 0, goalWidth = 0, goalHeight = 0;
  let spotX = 0, spotY = 0;

  let phase = 'announce';          // 'announce' | 'control' | 'flight' | 'result' | 'over'
  let phaseT = 0;
  let madShotIdx = 0;              // 0..4
  let blasShotIdx = 0;             // 0..4
  let totalShots = 0;              // 0..9
  let isBlasShooting = false;
  let scoreBlas = 0, scoreMad = 0;
  const resultsBlas = [];          // 'goal' | 'miss'
  const resultsMad  = [];

  // Defensa (Madrid chuta, Blas para)
  let keeper = 0.5;                // 0..1 posición del portero entre palos
  let madShotTarget = 0.5;         // 0..1 zona del disparo del Madrid
  let madFlightDur = PHASE_FLIGHT_D; // duración del vuelo del balón (Valverde tira más rápido)
  let touchLeftDown = false, touchRightDown = false;

  // Ataque (Blas chuta a Courtois)
  let aimNx = 0.5, aimNy = 0.5;    // posición normalizada dentro de la portería
  let aimSet = false;              // ha pulsado para apuntar
  let powerHoldT = 0;              // tiempo manteniendo pulsado
  let powerValue = 0;              // 0..1 valor de la fuerza al soltar
  let isAttPressing = false;       // dedo abajo
  let powerAutoReleased = false;

  // -------------------- Utilidades --------------------
  function rand(min, max) { return min + Math.random() * (max - min); }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  // -------------------- Setup --------------------
  function init() {
    if (inited) return;
    inited = true;
    stage         = document.getElementById('gameStage4');
    world         = document.getElementById('l4World');
    msgEl         = document.getElementById('l4Msg');
    msgTextEl     = document.getElementById('l4MsgText');
    msgImgEl      = document.getElementById('l4MsgImg');
    scoreBlasEl   = document.getElementById('l4ScoreBlas');
    scoreMadEl    = document.getElementById('l4ScoreMad');
    shotsEl       = document.getElementById('l4Shots');

    keeperEl      = document.getElementById('l4Keeper');
    keeperHeadEl  = document.getElementById('l4KeeperHead');
    ballEl        = document.getElementById('l4Ball');
    shooterEl     = document.getElementById('l4Shooter');
    shooterHeadEl = document.getElementById('l4ShooterHead');
    shooterNameEl = document.getElementById('l4ShooterName');
    standEl       = document.getElementById('l4Stand');
    fansEl        = document.getElementById('l4Fans');
    floBubbleEl   = document.getElementById('l4FloBubble');

    goalEl        = document.getElementById('l4Goal');
    aimEl         = document.getElementById('l4Aim');
    powerEl       = document.getElementById('l4Power');
    powerBarEl    = document.getElementById('l4PowerBar');
    hintEl        = document.getElementById('l4Hint');

    buildFans(fansEl, 280);

    bindControls();
    bindAttackInput();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
  }

  function buildFans(container, n) {
    if (!container) return;
    container.innerHTML = '';
    const colors = [
      '#ff2e2e', '#ffd200', '#19c64e', '#1f9bff',
      '#ff7e1a', '#9b59ff', '#ff5db6', '#27dfd7',
      '#ffffff', '#ff8a8a', '#b8e1ff', '#e7c9ff',
      '#f5d27a', '#7affc3', '#ffb347', '#d6d6d6',
    ];
    // Florentino ocupa el cuadrante superior izq: mayoría a la derecha.
    for (let i = 0; i < n; i++) {
      const d = document.createElement('div');
      d.className = 'l4-fan';
      d.style.background = colors[(i * 7) % colors.length];
      d.style.left = (22 + Math.random() * 77) + '%';
      d.style.top  = (3 + Math.random() * 92) + '%';
      d.style.animationDelay = (Math.random() * 0.4).toFixed(2) + 's';
      container.appendChild(d);
    }
  }

  function bindControls() {
    const tL = document.getElementById('touchLeft4');
    const tR = document.getElementById('touchRight4');
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

  // El apuntado se escucha en toda la escena del nivel: el jugador puede
  // tocar en cualquier sitio del campo y el aim se mapea relativo a la
  // portería. La cruz aparece dentro de la portería.
  function bindAttackInput() {
    if (!world) return;
    const start = (e) => {
      if (!running || phase !== 'control' || !isBlasShooting) return;
      // No interferir con los touchpads, aunque están ocultos en shoot.
      e.preventDefault();
      const pt = (e.touches && e.touches[0]) || e;
      updateAimFromPoint(pt.clientX, pt.clientY);
      aimSet = true;
      isAttPressing = true;
      powerHoldT = 0;
      powerAutoReleased = false;
      if (aimEl)    aimEl.classList.add('is-visible');
      if (powerEl)  powerEl.classList.add('is-visible');
      if (hintEl)   hintEl.classList.remove('is-visible');
    };
    const move = (e) => {
      if (!isAttPressing) return;
      e.preventDefault();
      const pt = (e.touches && e.touches[0]) || e;
      updateAimFromPoint(pt.clientX, pt.clientY);
    };
    const end = (e) => {
      if (!isAttPressing) return;
      e.preventDefault();
      isAttPressing = false;
      releaseShot();
    };
    world.addEventListener('touchstart',  start, { passive: false });
    world.addEventListener('touchmove',   move,  { passive: false });
    world.addEventListener('touchend',    end,   { passive: false });
    world.addEventListener('touchcancel', end,   { passive: false });
    world.addEventListener('mousedown',   start);
    window.addEventListener('mousemove', (e) => { if (isAttPressing) move(e); });
    window.addEventListener('mouseup',   (e) => { if (isAttPressing) end(e); });
  }

  function updateAimFromPoint(clientX, clientY) {
    if (!goalEl) return;
    const r = goalEl.getBoundingClientRect();
    const x = (clientX - r.left) / r.width;
    const y = (clientY - r.top)  / r.height;
    aimNx = clamp(x, 0.05, 0.95);
    aimNy = clamp(y, 0.15, 0.85);
    paintAim();
  }

  function resize() {
    if (!stage) return;
    stageW = stage.clientWidth  || 360;
    stageH = stage.clientHeight || 640;
    // Portería (boca): de 9% a 91% del ancho, top 16% – bottom 27%
    goalLeft   = stageW * 0.09;
    goalTop    = stageH * 0.27;
    goalWidth  = stageW * 0.82;
    goalHeight = stageH * 0.11; // alto visual de la portería
    // Punto de penalti
    spotX = stageW * 0.50;
    spotY = stageH * 0.83;
  }

  // -------------------- Pintar --------------------
  function applyKeeper() {
    if (!keeperEl) return;
    const kw = keeperEl.offsetWidth || 58;
    const kh = keeperEl.offsetHeight || 50;
    const x = goalLeft + keeper * goalWidth - kw / 2;
    const y = goalTop - kh * 0.55;
    keeperEl.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }
  function applyBall(x, y) {
    if (!ballEl) return;
    ballEl.style.transform = `translate3d(${x - 15}px, ${y - 15}px, 0)`;
  }
  function paintMadShooter(idx) {
    const s = MAD_SHOOTERS[idx];
    if (!s || !shooterHeadEl || !shooterNameEl) return;
    shooterHeadEl.style.backgroundImage = `url('${s.img}')`;
    shooterNameEl.textContent = s.name;
    shooterEl.classList.remove('is-fall', 'is-failface', 'is-kick', 'is-blas');
  }
  function paintBlasShooter() {
    if (!shooterHeadEl || !shooterNameEl) return;
    shooterHeadEl.style.backgroundImage = "url('assets/blas-face.png')";
    shooterNameEl.textContent = 'BLAS';
    shooterEl.classList.remove('is-fall', 'is-failface', 'is-kick');
    shooterEl.classList.add('is-blas');
  }
  function paintAim() {
    if (!aimEl) return;
    aimEl.style.left = (aimNx * 100) + '%';
    aimEl.style.top  = (aimNy * 100) + '%';
  }

  function setMessage(text, variant, imgUrl) {
    if (!msgEl) return;
    if (msgTextEl) msgTextEl.textContent = text;
    if (msgImgEl) {
      if (imgUrl) {
        msgImgEl.src = imgUrl;
        msgImgEl.classList.add('is-visible');
      } else {
        msgImgEl.classList.remove('is-visible');
        msgImgEl.removeAttribute('src');
      }
    }
    msgEl.classList.remove('l4-msg--goal', 'l4-msg--save', 'l4-msg--bad');
    if (variant) msgEl.classList.add(variant);
    msgEl.classList.add('is-active');
  }
  function clearMessage() {
    if (msgEl) msgEl.classList.remove('is-active');
  }

  function showFloInsult(text) {
    if (!floBubbleEl) return;
    floBubbleEl.textContent = '«' + text + '»';
    floBubbleEl.classList.add('is-active');
  }
  function hideFloInsults() {
    if (floBubbleEl) floBubbleEl.classList.remove('is-active');
  }
  function shakeStand() {
    if (!standEl) return;
    standEl.classList.remove('is-shaking');
    // force reflow para reiniciar la animación
    void standEl.offsetWidth;
    standEl.classList.add('is-shaking');
  }

  function updateScoreboard() {
    if (scoreBlasEl) scoreBlasEl.textContent = scoreBlas;
    if (scoreMadEl)  scoreMadEl.textContent  = scoreMad;
    if (!shotsEl) return;
    shotsEl.innerHTML = '';
    const colBlas = document.createElement('div');
    colBlas.className = 'l4-shots__col';
    colBlas.innerHTML = '<span class="l4-shots__lbl">BLAS</span>' + rowFor(resultsBlas);
    const colMad = document.createElement('div');
    colMad.className = 'l4-shots__col';
    colMad.innerHTML = '<span class="l4-shots__lbl">MADRID</span>' + rowFor(resultsMad);
    shotsEl.appendChild(colBlas);
    const sep = document.createElement('div');
    sep.style.width = '12px';
    shotsEl.appendChild(sep);
    shotsEl.appendChild(colMad);
  }
  function rowFor(arr) {
    const total = SHOTS_REG;
    let html = '<div class="l4-shots__row">';
    for (let i = 0; i < total; i++) {
      const r = arr[i];
      const cls = r === 'goal' ? ' is-goal' : (r === 'miss' ? ' is-miss' : '');
      html += `<span class="l4-shot${cls}"></span>`;
    }
    html += '</div>';
    return html;
  }

  // -------------------- Flujo --------------------
  function reset() {
    scoreBlas = 0; scoreMad = 0;
    resultsBlas.length = 0;
    resultsMad.length  = 0;
    madShotIdx = 0;
    blasShotIdx = 0;
    totalShots = 0;
    keeper = 0.5;
    isBlasShooting = false;
    phase = 'announce';
    phaseT = PHASE_ANNOUNCE;
    resize();
    setupTurn();
    updateScoreboard();
  }

  function setupTurn() {
    hideFloInsults();
    clearMessage();
    // Limpiar poses previas del portero
    keeperEl.classList.remove('is-dive-l', 'is-dive-r');
    // Madrid en turnos pares (0,2,4,6,8), Blas en impares (1,3,5,7,9)
    isBlasShooting = (totalShots % 2 === 1);

    // UI compartida: ocultar aim/power/hint por defecto
    if (aimEl)    aimEl.classList.remove('is-visible');
    if (powerEl)  powerEl.classList.remove('is-visible');
    if (hintEl)   hintEl.classList.remove('is-visible');
    if (powerBarEl) powerBarEl.style.transform = 'translateX(0)';

    if (isBlasShooting) {
      world.classList.remove('is-defend');
      world.classList.add('is-shoot');
      // Portero: Courtois. Chutador: Blas.
      keeperEl.classList.add('is-courtois');
      keeperHeadEl.style.backgroundImage = "url('assets/courtois-face.png')";
      paintBlasShooter();
      keeper = 0.5; // Courtois siempre centrado
      applyKeeper();
      applyBall(spotX, spotY);
      // Resetear apuntado
      aimSet = false;
      isAttPressing = false;
      powerHoldT = 0;
      powerValue = 0;
      powerAutoReleased = false;
      aimNx = 0.5; aimNy = 0.5;
      paintAim();
      setMessage('TIRO ' + (blasShotIdx + 1) + ' / ' + SHOTS_REG + ' — ¡TÚ TIRAS!');
    } else {
      world.classList.remove('is-shoot');
      world.classList.add('is-defend');
      // Portero: Blas. Chutador: el del Madrid de turno.
      keeperEl.classList.remove('is-courtois');
      keeperHeadEl.style.backgroundImage = "url('assets/blas-face.png')";
      paintMadShooter(madShotIdx);
      keeper = 0.5;
      applyKeeper();
      applyBall(spotX, spotY);
      const name = MAD_SHOOTERS[madShotIdx].name;
      setMessage('TIRA ' + name);
    }
    window.SFX && SFX.play('select');
  }

  function startControl() {
    phase = 'control';
    phaseT = PHASE_CONTROL;
    clearMessage();
    // Florentino insulta al inicio del control
    if (isBlasShooting) {
      showFloInsult(FLO_INSULTS_ATT[blasShotIdx]);
      hintEl && hintEl.classList.add('is-visible');
    } else {
      showFloInsult(FLO_INSULTS_DEF[madShotIdx]);
    }
  }

  function startFlightDefense() {
    phase = 'flight';
    // Valverde (índice 2) tira con disparo seco: balón 3x más rápido
    const isValverde = (madShotIdx === 2);
    madFlightDur = isValverde ? (PHASE_FLIGHT_D / 3) : PHASE_FLIGHT_D;
    phaseT = madFlightDur;
    // ¿Es Brahim (índice 4)? → siempre falla, lanza muy a un lado (fuera)
    const isBrahim = (madShotIdx === 4);
    if (isBrahim) {
      madShotTarget = Math.random() < 0.5 ? -0.25 : 1.25;
    } else {
      madShotTarget = rand(0.1, 0.9);
    }
    shooterEl.classList.add('is-kick');
    window.SFX && SFX.play('bigJump');
  }

  function startFlightAttack(powerNow) {
    phase = 'flight';
    phaseT = PHASE_FLIGHT_A;
    powerValue = powerNow;
    hintEl && hintEl.classList.remove('is-visible');
    shooterEl.classList.add('is-kick');
    window.SFX && SFX.play('bigJump');
  }

  function releaseShot() {
    if (phase !== 'control' || !isBlasShooting || !aimSet) return;
    const p = currentPowerValue();
    startFlightAttack(p);
  }

  function currentPowerValue() {
    // Oscila como un seno entre 0 y 1
    const t = powerHoldT * POWER_FREQ * 2 * Math.PI;
    return (1 - Math.cos(t)) / 2;
  }

  function decideOutcomeDefense() {
    const isBrahim = (madShotIdx === 4);
    let goal = false;
    if (isBrahim) {
      goal = false; // Brahim siempre falla fuera
    } else {
      goal = Math.abs(madShotTarget - keeper) > SAVE_TOLERANCE;
    }
    if (!isBrahim && !goal) {
      keeperEl.classList.add(madShotTarget < keeper ? 'is-dive-l' : 'is-dive-r');
    }
    if (isBrahim) {
      shooterEl.classList.add('is-failface', 'is-fall');
    }
    resultsMad.push(goal ? 'goal' : 'miss');
    if (goal) scoreMad++;
    updateScoreboard();

    if (goal) {
      window.SFX && SFX.play('coin');
      setMessage('GOL DEL MADRID', 'l4-msg--bad');
      shakeStand();
    } else {
      window.SFX && SFX.play('stomp');
      if (isBrahim) {
        setMessage('¡FUERA! BRAHIM LA HA TIRADO A LAS NUBES',
                   'l4-msg--save', 'assets/brahim-fallo.png');
      } else {
        setMessage('¡PARADÓN DE BLAS!', 'l4-msg--save');
      }
      shakeStand();
    }
    madShotIdx++;
    phase = 'result';
    phaseT = PHASE_RESULT;
  }

  function decideOutcomeAttack() {
    const isLast = (blasShotIdx === SHOTS_REG - 1);
    const tied = (scoreBlas === scoreMad);
    let goal = false;
    let reason = '';

    // Regla especial: empate antes del último tiro de Blas → mete sí o sí.
    if (isLast && tied) {
      goal = true;
      reason = 'forced';
    } else if (powerValue >= POWER_STRONG_MIN) {
      goal = false;
      reason = 'high';
    } else if (powerValue < POWER_WEAK_MAX) {
      goal = false;
      reason = 'low';
    } else {
      goal = true;
      reason = 'ok';
    }

    // Animación del portero (Courtois): dive WRONG way en gol; nada si fuera
    // o si la para (la atajó "cómodamente").
    if (goal) {
      keeperEl.classList.add(aimNx < 0.5 ? 'is-dive-r' : 'is-dive-l');
    } else if (reason === 'low') {
      // La atajó: leve dive hacia donde fue el balón
      keeperEl.classList.add(aimNx < 0.5 ? 'is-dive-l' : 'is-dive-r');
    }

    resultsBlas.push(goal ? 'goal' : 'miss');
    if (goal) scoreBlas++;
    updateScoreboard();

    if (goal) {
      window.SFX && SFX.play('coin');
      if (reason === 'forced') {
        setMessage('¡GOOOOL! ¡PARTIDO!', 'l4-msg--goal');
      } else {
        setMessage('¡GOOOOL!', 'l4-msg--goal');
      }
      shakeStand();
    } else {
      window.SFX && SFX.play('stomp');
      if (reason === 'high') {
        setMessage('FUERA. CHUTASTE DEMASIADO FUERTE', 'l4-msg--bad');
      } else if (reason === 'low') {
        setMessage('LA PARÓ COURTOIS. POCO FUERTE', 'l4-msg--bad');
      } else {
        setMessage('NO HA ENTRADO', 'l4-msg--bad');
      }
      shakeStand();
    }
    blasShotIdx++;
    phase = 'result';
    phaseT = PHASE_RESULT;
  }

  function advanceShot() {
    totalShots++;
    if (matchDecided()) {
      finishMatch();
      return;
    }
    phase = 'announce';
    phaseT = PHASE_ANNOUNCE;
    setupTurn();
  }

  function matchDecided() {
    const blasTaken = resultsBlas.length;
    const madTaken  = resultsMad.length;
    const blasRem   = SHOTS_REG - blasTaken;
    const madRem    = SHOTS_REG - madTaken;
    if (scoreBlas - scoreMad > madRem)  return true; // Blas gana
    if (scoreMad - scoreBlas > blasRem) return true; // Madrid gana
    if (totalShots >= SHOTS_REG * 2)    return true;
    return false;
  }

  function finishMatch() {
    phase = 'over';
    running = false;
    const blasGana = scoreBlas > scoreMad;
    setMessage(blasGana ? '¡VICTORIA! NO HABRÁ 16ª' : 'LA HEMOS LIADO',
               blasGana ? 'l4-msg--goal' : 'l4-msg--bad');
    setTimeout(() => {
      if (blasGana) {
        window.Game && window.Game.onLevel4Complete && window.Game.onLevel4Complete();
      } else {
        window.Game && window.Game.onLevel4GameOver && window.Game.onLevel4GameOver();
      }
    }, 1500);
  }

  // -------------------- Update --------------------
  function update(dt) {
    if (phase === 'over') return;

    if (phase === 'announce') {
      phaseT -= dt;
      if (phaseT <= 0) startControl();
      return;
    }

    if (phase === 'control') {
      if (isBlasShooting) {
        if (isAttPressing) {
          powerHoldT += dt;
          const p = currentPowerValue();
          if (powerBarEl && powerEl) {
            const w = powerEl.clientWidth - 4;
            powerBarEl.style.transform = `translateX(${p * w}px)`;
          }
          if (powerHoldT >= POWER_HOLD_MAX && !powerAutoReleased) {
            powerAutoReleased = true;
            isAttPressing = false;
            releaseShot();
            return;
          }
        }
        phaseT -= dt;
        if (phaseT <= 0) {
          if (!aimSet) {
            aimNx = 0.5; aimNy = 0.5;
            aimSet = true;
            powerValue = 0.05;
            startFlightAttack(powerValue);
          } else {
            releaseShot();
          }
        }
        return;
      }
      // Modo defensa: mover portero
      const dir = (touchRightDown ? 1 : 0) - (touchLeftDown ? 1 : 0);
      if (dir !== 0) keeper = clamp(keeper + dir * KEEPER_SPEED * dt, 0.05, 0.95);
      applyKeeper();
      phaseT -= dt;
      if (phaseT <= 0) startFlightDefense();
      return;
    }

    if (phase === 'flight') {
      if (isBlasShooting) {
        // Vuelo del balón cenital, de abajo (spot) a la portería (línea de gol)
        const totalT = PHASE_FLIGHT_A;
        const progress = clamp(1 - phaseT / totalT, 0, 1);
        let targetX = goalLeft + aimNx * goalWidth;
        let targetY = goalTop; // línea de gol
        // Si fuerza alta: vuela por encima del larguero (sigue subiendo)
        if (powerValue >= POWER_STRONG_MIN) {
          targetY = goalTop - stageH * 0.18;
        }
        // Si flojo: el balón llega a la línea y Courtois se mueve hacia
        // él para atajarlo en su sitio.
        if (powerValue < POWER_WEAK_MAX) {
          const reactT = clamp((progress - 0.15) / 0.6, 0, 1);
          keeper = lerp(0.5, aimNx, reactT);
          applyKeeper();
        }
        const x = lerp(spotX, targetX, progress);
        const arc = Math.sin(progress * Math.PI) * (stageH * 0.04);
        const y = lerp(spotY, targetY, progress) - arc;
        applyBall(x, y);
        phaseT -= dt;
        if (phaseT <= 0) decideOutcomeAttack();
      } else {
        // Balón vuela del punto de penalti hacia la línea de gol
        const progress = clamp(1 - phaseT / madFlightDur, 0, 1);
        const targetX = goalLeft + madShotTarget * goalWidth;
        const targetY = goalTop;
        const x = lerp(spotX, targetX, progress);
        const arc = Math.sin(progress * Math.PI) * (stageH * 0.03);
        const y = lerp(spotY, targetY, progress) - arc;
        applyBall(x, y);
        phaseT -= dt;
        if (phaseT <= 0) decideOutcomeDefense();
      }
      return;
    }

    if (phase === 'result') {
      phaseT -= dt;
      if (phaseT <= 0) {
        clearMessage();
        hideFloInsults();
        advanceShot();
      }
      return;
    }
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
    clearMessage();
    hideFloInsults();
  }

  window.Level4 = { start, stop };
})();
