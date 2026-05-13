/* ============================================================
   level1.js - Reto 1: reparto estilo Super Mario Bros
   Blas avanza automáticamente. Dispara sobres a los vecinos
   ("¿Y mi paquete?") y esquiva/aplasta buzones. Termina
   subiéndose al árbol junto al bar Casablanca.
   ============================================================ */
(function () {
  'use strict';

  // -------------------- Configuración --------------------
  const VW = 480;          // ancho lógico
  const VH = 270;          // alto lógico
  const RENDER_SCALE = 4;  // multiplicador interno del canvas (más nitidez)
  const SPRITE_SCALE = 5;  // los sprites se prerrenderizan a esta resolución para que no pixelen
  const GROUND_Y = 220;    // y del suelo
  const GRAVITY = 1500;    // px/s^2
  const JUMP_VY = -560;    // velocidad inicial salto
  const STOMP_VY = -380;   // rebote tras pisar buzón
  const PLAYER_SPEED = 90;   // px/s (avance normal del mundo)
  const PLAYER_X = 120;      // posición fija inicial de Blas en pantalla
  const DURATION = 60;       // segundos del nivel
  const FINAL_TIME = 52;     // a partir de aquí aparece la zona del árbol

  // Barra de fuerza para el super-salto: indicador oscila muy rápido.
  const METER_SPEED = 4.2;        // recorridos 0→1 por segundo (rebota muy rápido)
  const FORCE_MIN_VY = 220;       // vy con fuerza 0 (salto miserable)
  const FORCE_MAX_VY = 1080;      // vy con fuerza 1 (llega a la copa holgado)
  const CARRERILLA_SPEED = 220;   // px/s mientras coge carrerilla

  // Fuente para textos pequeños (bocadillos): sans-serif es más legible
  // que Press Start 2P a tamaños pequeños. Reservamos Press Start 2P
  // para HUD y popups grandes.
  const BUBBLE_FONT = 'bold 9px "Segoe UI", "Helvetica Neue", Arial, sans-serif';
  const POPUP_FONT  = '8px "Press Start 2P", monospace';

  // Frases variadas que dicen los vecinos enfadados
  const NEIGHBOR_PHRASES = [
    '¿Y mi paquete?',
    '¡Venga fanfarrón!',
    '¡Ya era hora!',
    '¡Llevo 2 semanas!',
    '¡Trabaja, gandul!',
    '¿Hay algo pa mí?',
    'Ayer te estuve esperando',
    'A mí facturas no me traigas',
  ];

  // Frase que dice Blas cuando elimina a un vecino
  const BLAS_KILL_PHRASE = '¡Pa paquete el mío!';

  const COLORS = {
    sky:       '#5cc8ff',
    cloud:     '#ffffff',
    mountainF: '#7c9b7c',
    mountainB: '#9bb89b',
    road:      '#4a4a4a',
    roadLine:  '#ffd200',
    sidewalk:  '#bdbdbd',
    sidewalkEdge: '#7a7a7a',
    house1:    '#e8a96b',
    house2:    '#c47b50',
    house3:    '#d6c19c',
    house4:    '#b2cfa0',
    house5:    '#dca1a1',
    houseDark: '#3a2418',
    roof:      '#7a3b1e',
    roofDark:  '#5a2b14',
    window:    '#9ed6ff',
    windowSheen:'#cfe9ff',
    windowFrame:'#3a2418',
    door:      '#5a3416',
    doorDark:  '#3a2110',
    skin:      '#f0c89a',
    skinDark:  '#c8916a',
    hair:      '#3a2418',
    hairAlt:   '#7a5230',
    hairGrey:  '#a8a8a8',
    shirt:     '#3a6dd1',
    shirtAlt:  '#c44a4a',
    shirtAlt2: '#7a3aa8',
    pants:     '#2b2b2b',
    leaves:    '#2f9d4a',
    leavesDark:'#1f7034',
    trunk:     '#7a4a1c',
    trunkDark: '#52310f',
    casablanca:'#f0d9b0',
    casablancaSign:'#aa1f1f',
    yellow:    '#ffd200',
    yellowDark:'#c79c00',
    blue:      '#003399',
    envelope:  '#fffaf0',
    envelopeShadow: '#cfc6a8',
    balcony:   '#5a3416',
    rail:      '#2a2a2a',
  };

  // -------------------- Estado --------------------
  let canvas, ctx;
  let raf = null;
  let lastTime = 0;
  let running = false;

  let cameraX = 0;       // px del mundo desplazado
  let timeLeft = DURATION;
  let score = 0;
  let lives = 3;
  // Fases del nivel:
  //   'run'         → avance normal repartiendo
  //   'final'       → cámara detenida frente al árbol, advertencia + barra
  //   'carrerilla'  → Blas avanza en pantalla cogiendo carrerilla
  //   'jump'        → Blas en el aire
  //   'win_dialog'  → Blas en la copa contando el chiste
  //   'fall_down'   → Blas tumbado bocarriba ("te caíste")
  //   'win' | 'over'→ resultado final
  let phase = 'run';
  let invuln = 0;
  let stopCameraX = 0;       // x al que se detiene la cámara
  let warningAlpha = 0;      // opacidad del aviso "¡SALTA…!"
  let meterPos = 0;          // 0..1 posición del indicador de fuerza
  let meterDir = 1;          // dirección de oscilación
  let selectedForce = 0;     // fuerza fijada al pulsar SALTO
  let runUpTargetX = 0;      // x en pantalla a la que Blas para de correr
  let reachedTree = false;   // tocó la copa en este intento
  let winDialogTimer = 0;
  let winDialogStage = 0;    // 0 = pregunta, 1 = remate
  let fallDownTimer = 0;

  const player = {
    x: PLAYER_X,         // x en pantalla (también es x absoluta porque cámara se desplaza por la escena, no por el jugador)
    y: GROUND_Y - 40,
    vy: 0,
    w: 26,
    h: 40,
    onGround: true,
    facing: 1,
    speech: { text: '', t: 0 }, // bocadillo de Blas al matar
  };

  let buzones = [];      // { worldX, y, w, h, vx, alive }
  let neighbors = [];    // { worldX, y, w, h, alive, sayTimer, spawnType, halfBody, phrase, palette }
  let envelopes = [];    // { worldX, y, vx, w, h, alive }
  let houses = [];       // { worldX, w, h, type, hasBalcony }
  let popups = [];       // { worldX, y, text, t }
  let finalTree = null;  // { worldX, baseY, trunkW, trunkH, canopyR, platformY, platformW }
  let casablanca = null; // { worldX, w, h }

  let pressed = { jump: false, shoot: false };
  let lastShoot = 0;

  // Sprites pre-renderizados (offscreen canvases)
  let faceSprite = null; // cara redonda de Blas
  let buzonSprite = null;

  // -------------------- Carga de assets --------------------
  function loadImage(src) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = src;
    });
  }

  function buildFaceSprite(img) {
    // img = assets/blas-face.png. El PNG ya está recortado al contorno
    // de la cabeza (gorra + cara + barba) sobre fondo transparente, así
    // que usamos la imagen entera y solo la pre-renderizamos a alta
    // resolución para que no pixele al escalarla en juego.
    const srcW = img.width;
    const srcH = img.height;
    const TARGET_W = 32 * SPRITE_SCALE;
    const TARGET_H = Math.round(TARGET_W * srcH / srcW);
    const c = document.createElement('canvas');
    c.width = TARGET_W;
    c.height = TARGET_H;
    const cx = c.getContext('2d');
    cx.imageSmoothingEnabled = true;
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(img, 0, 0, srcW, srcH, 0, 0, TARGET_W, TARGET_H);
    c._ratio = srcH / srcW; // alto / ancho
    return c;
  }

  function buildBuzonSprite(img) {
    // Pre-renderizamos a alta resolución y quitamos el fondo blanco del PNG.
    // La proporción coincide con el tamaño lógico del buzón en juego (72x52).
    const w = 72 * SPRITE_SCALE;
    const h = 52 * SPRITE_SCALE;
    // Recortamos la imagen original con un margen para descartar bordes
    // y el fondo blanco circundante de la foto del buzón.
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const cx = c.getContext('2d');
    cx.imageSmoothingEnabled = true;
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(img, 0, 0, img.width, img.height, 0, 0, w, h);

    // Chroma key: pone alpha=0 a los píxeles blancos (fondo del PNG)
    // y suaviza los bordes que están entre el amarillo y el blanco.
    const data = cx.getImageData(0, 0, w, h);
    const px = data.data;
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i], g = px[i+1], b = px[i+2];
      const minRGB = Math.min(r, g, b);
      const maxRGB = Math.max(r, g, b);
      // Blanco / muy claro y poco saturado → fondo
      if (minRGB > 230 && maxRGB - minRGB < 20) {
        px[i+3] = 0;
      } else if (minRGB > 210 && maxRGB - minRGB < 25) {
        // borde antialiased: degradar alpha
        px[i+3] = Math.max(0, px[i+3] - 180);
      }
    }
    cx.putImageData(data, 0, 0);
    return c;
  }

  // -------------------- Mundo: generación --------------------
  function houseGeometry(house) {
    // Coordenadas en mundo (no en pantalla) de los huecos por los que
    // pueden salir los vecinos.
    const topY = GROUND_Y - house.h;
    // Geometría de ventanas (debe coincidir con drawHouses)
    const wW = 22, wH = 20;
    const winY = topY + 18;
    const winLX = house.worldX + 14 + wW / 2;
    const winRX = house.worldX + house.w - 14 - wW / 2;
    // Balcón (mitad de la casa)
    const balconyY = topY + Math.floor(house.h * 0.5);
    const balconyLX = house.worldX + 26;
    const balconyRX = house.worldX + house.w - 26;
    // Puerta
    const doorX = house.worldX + house.w / 2;
    return { topY, winY, winLX, winRX, balconyY, balconyLX, balconyRX, doorX };
  }

  function makeNeighbor(house, spawnType) {
    const g = houseGeometry(house);
    const palettes = [
      { shirt: COLORS.shirt,     hair: COLORS.hair },
      { shirt: COLORS.shirtAlt,  hair: COLORS.hairAlt },
      { shirt: COLORS.shirtAlt2, hair: COLORS.hairGrey },
      { shirt: '#2f8a3a',        hair: COLORS.hair },
      { shirt: '#d68a2a',        hair: COLORS.hairAlt },
    ];
    const palette = palettes[Math.floor(Math.random() * palettes.length)];
    const phrase = NEIGHBOR_PHRASES[Math.floor(Math.random() * NEIGHBOR_PHRASES.length)];

    let worldX, y, w, h, halfBody;
    if (spawnType === 'door') {
      worldX = g.doorX;
      y = GROUND_Y - 38;
      w = 20; h = 38;
      halfBody = false;
    } else if (spawnType === 'windowL' || spawnType === 'windowR') {
      worldX = spawnType === 'windowL' ? g.winLX : g.winRX;
      // El vecino asoma medio cuerpo: su "y" es la coronilla.
      // El alféizar queda justo bajo los hombros.
      y = g.winY - 4;
      w = 20; h = 22;
      halfBody = true;
    } else { // balconyL / balconyR
      worldX = spawnType === 'balconyL' ? g.balconyLX : g.balconyRX;
      // El vecino aparece de pie sobre el balcón. La barandilla
      // tapa sus piernas, así que dibujamos medio cuerpo.
      y = g.balconyY - 28;
      w = 20; h = 28;
      halfBody = true;
    }
    return {
      worldX, y, w, h,
      alive: true,
      sayTimer: Math.random() * 2.5,
      spawnType,
      halfBody,
      phrase,
      palette,
    };
  }

  function seedWorld() {
    houses = [];
    neighbors = [];
    buzones = [];
    envelopes = [];
    popups = [];
    player.speech = { text: '', t: 0 };

    // Generar casas a lo largo del mundo
    let x = 200;
    const worldEnd = PLAYER_SPEED * FINAL_TIME + 600;
    const houseTypes = [
      { color: COLORS.house1, roof: COLORS.roof,     w: 120, h: 120 },
      { color: COLORS.house2, roof: COLORS.roofDark, w: 140, h: 140 },
      { color: COLORS.house3, roof: COLORS.roof,     w: 110, h: 110 },
      { color: COLORS.house4, roof: COLORS.roofDark, w: 130, h: 130 },
      { color: COLORS.house5, roof: COLORS.roof,     w: 120, h: 130 },
    ];
    let idx = 0;
    while (x < worldEnd) {
      const t = houseTypes[idx % houseTypes.length];
      const hasBalcony = idx % 3 === 1; // 1 de cada 3 casas tiene balcón
      const house = {
        worldX: x,
        w: t.w,
        h: t.h,
        color: t.color,
        roof: t.roof,
        idx: idx,
        hasBalcony,
      };
      houses.push(house);

      // Cada casa genera entre 1 y 2 vecinos en huecos distintos.
      // Los primeros (idx pequeño) van más en puerta para que el
      // jugador entienda la mecánica antes; luego se mezclan.
      const opts = ['door', 'windowL', 'windowR'];
      if (hasBalcony) opts.push('balconyL', 'balconyR');

      const pickedTypes = [];
      // Primer vecino casi siempre
      if (idx === 0 || Math.random() < 0.85) {
        const forceDoor = idx < 2; // primeras casas: vecino en puerta
        const pick = forceDoor ? 'door' : opts[Math.floor(Math.random() * opts.length)];
        pickedTypes.push(pick);
      }
      // Segundo vecino con menos probabilidad y en otro hueco
      if (idx >= 2 && Math.random() < 0.45) {
        const remaining = opts.filter((o) => !pickedTypes.includes(o));
        if (remaining.length) {
          pickedTypes.push(remaining[Math.floor(Math.random() * remaining.length)]);
        }
      }
      pickedTypes.forEach((type) => {
        neighbors.push(makeNeighbor(house, type));
      });

      x += t.w + 70 + Math.floor(Math.random() * 50);
      idx++;
    }

    // Programa de aparición de buzones (en segundos relativos al inicio)
    // Repartidos durante los primeros ~48 segundos.
    const schedule = [4, 8, 12, 15, 19, 23, 27, 30, 34, 38, 42, 46];
    buzones = schedule.map((t) => ({
      spawnAt: t,
      spawned: false,
      worldX: 0,
      y: GROUND_Y - 32,   // 20px más abajo que apoyado al suelo
      w: 72, h: 52,
      vx: -70,
      alive: true,
    }));

    // Zona final: primero aparece la fachada del bar Casablanca al fondo,
    // y unos metros después el ciprés alargado al que Blas debe saltar.
    const finalX = PLAYER_SPEED * FINAL_TIME + 460;
    finalTree = {
      worldX: finalX,
      baseY: GROUND_Y,
      trunkW: 28,           // tronco grueso (platanero)
      trunkH: 90,           // visible bajo una copa redonda y amplia
      canopyTop: GROUND_Y - 180,
      canopyBot: GROUND_Y - 80,
      canopyW: 120,         // copa frondosa y amplia
      platformY: GROUND_Y - 170, // parte alta de la copa (objetivo del salto)
      platformW: 80,
    };
    casablanca = {
      worldX: finalX - 320,  // ANTES del ciprés en el recorrido
      y: GROUND_Y - 150,
      w: 200, h: 150,
    };
    // La cámara se detiene dejando al árbol visible a la derecha y a Blas
    // con espacio suficiente para coger carrerilla antes del salto.
    stopCameraX = finalTree.worldX - PLAYER_X - 130;
  }

  // -------------------- Controles --------------------
  function bindControls() {
    const btnJump  = document.getElementById('btnJump');
    const btnShoot = document.getElementById('btnShoot');

    const press = (key, val) => (e) => {
      e.preventDefault();
      pressed[key] = val;
      if (val) {
        if (key === 'jump') doJump();
        if (key === 'shoot') doShoot();
      } else {
        if (key === 'jump') releaseJump();
      }
    };

    // touch + mouse
    ['touchstart','mousedown'].forEach(ev => {
      btnJump.addEventListener(ev, press('jump', true), { passive: false });
      btnShoot.addEventListener(ev, press('shoot', true), { passive: false });
    });
    ['touchend','touchcancel','mouseup','mouseleave'].forEach(ev => {
      btnJump.addEventListener(ev, press('jump', false), { passive: false });
      btnShoot.addEventListener(ev, press('shoot', false), { passive: false });
    });

    // teclado (para depuración en desktop)
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') doJump();
      if (e.key === 'x' || e.key === 'Control' || e.key === 'z') doShoot();
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') releaseJump();
    });

    // Botones de opción del chiste final
    const choice = document.getElementById('choice');
    if (choice) {
      choice.addEventListener('click', (e) => {
        const btn = e.target.closest('.choice__btn');
        if (!btn) return;
        e.preventDefault();
        chooseAnswer(btn.dataset.choice);
      });
    }

    // Pulsar cualquier parte de la pantalla durante la barra de fuerza
    // cuenta como pulsar SALTO. El listener vive en el game-stage para
    // no interferir con los botones del HUD o el debug bar.
    const stage = document.getElementById('gameStage');
    if (stage) {
      stage.addEventListener('pointerdown', (e) => {
        if (phase !== 'final') return;
        // Evitar que doble disparo si el toque cayó en btnJump (oculto en final)
        if (e.target.closest('#btnJump, #btnShoot, #choice')) return;
        e.preventDefault();
        doJump();
      });
    }
  }

  function syncUIPhase() {
    const stage = document.getElementById('gameStage');
    if (stage) stage.classList.toggle('is-charge', phase === 'final');
  }

  function showChoiceButtons() {
    const el = document.getElementById('choice');
    if (el) el.classList.add('is-active');
  }
  function hideChoiceButtons() {
    const el = document.getElementById('choice');
    if (el) el.classList.remove('is-active');
  }

  function chooseAnswer(which) {
    if (phase !== 'win_dialog' || winDialogStage !== 0) return;
    winDialogStage = 1;
    winDialogTimer = 0;
    const reply = which === 'pio' ? 'No, mucha sombra' : '¡No, PIO PIO!';
    player.speech = { text: reply, t: 99 };
    hideChoiceButtons();
  }

  function doJump() {
    if (!running) return;
    if (phase === 'final') {
      // Fija la fuerza con la posición actual del indicador y arranca la carrerilla
      selectedForce = meterPos;
      // Objetivo de carrerilla: justo al lado izquierdo del tronco
      const treeScreenX = finalTree.worldX - cameraX;
      runUpTargetX = treeScreenX - finalTree.trunkW / 2 - player.w - 2;
      reachedTree = false;
      phase = 'carrerilla';
      return;
    }
    if (phase === 'run' && player.onGround) {
      player.vy = JUMP_VY;
      player.onGround = false;
    }
  }

  function releaseJump() { /* la barra oscilante no necesita release */ }

  function doShoot() {
    if (!running || phase === 'win' || phase === 'over') return;
    const now = performance.now();
    if (now - lastShoot < 280) return;
    lastShoot = now;
    envelopes.push({
      worldX: cameraX + player.x + player.w,
      y: player.y + player.h * 0.45,
      vx: 260,
      w: 10, h: 7,
      alive: true,
      spin: 0,
    });
  }

  // -------------------- Lógica --------------------
  function reset() {
    cameraX = 0;
    timeLeft = DURATION;
    score = 0;
    lives = 3;
    phase = 'run';
    invuln = 0;
    warningAlpha = 0;
    meterPos = 0;
    meterDir = 1;
    selectedForce = 0;
    runUpTargetX = 0;
    reachedTree = false;
    winDialogTimer = 0;
    winDialogStage = 0;
    fallDownTimer = 0;
    player.x = PLAYER_X;
    player.y = GROUND_Y - player.h;
    player.vy = 0;
    player.onGround = true;
    pressed = { jump: false, shoot: false };
    lastShoot = 0;
    seedWorld();
    updateHUD();
    hideChoiceButtons();
  }

  function update(dt) {
    if (phase === 'win' || phase === 'over') return;

    // -------- Fases de avance --------
    if (phase === 'run') {
      cameraX += PLAYER_SPEED * dt;
      timeLeft -= dt;
      if (timeLeft <= 0) timeLeft = 0;
      // La cámara se detiene al llegar a la posición del árbol final.
      if (cameraX >= stopCameraX) {
        cameraX = stopCameraX;
        phase = 'final';
        warningAlpha = 0;
        meterPos = 0;
        meterDir = 1;
      }
    } else if (phase === 'final') {
      // Aviso aparece con fade-in
      warningAlpha = Math.min(1, warningAlpha + dt * 2);
      // Indicador de fuerza oscila rebotando entre 0 y 1
      meterPos += METER_SPEED * meterDir * dt;
      if (meterPos >= 1) { meterPos = 1; meterDir = -1; }
      if (meterPos <= 0) { meterPos = 0; meterDir = 1; }
    } else if (phase === 'carrerilla') {
      // Aviso desaparece
      warningAlpha = Math.max(0, warningAlpha - dt * 3);
      // Blas corre hacia el tronco
      player.x = Math.min(runUpTargetX, player.x + CARRERILLA_SPEED * dt);
      if (player.x >= runUpTargetX) {
        // Lanza el salto vertical con la fuerza elegida
        player.x = runUpTargetX;
        const vy = -(FORCE_MIN_VY + (FORCE_MAX_VY - FORCE_MIN_VY) * selectedForce);
        player.vy = vy;
        player.onGround = false;
        phase = 'jump';
      }
    } else if (phase === 'jump') {
      // Al llegar al pico decidimos por la fuerza elegida: si el jugador
      // pulsó cuando el indicador estaba por encima de la mitad de la
      // barra, alcanza la copa; si no, sigue cayendo y se estampa.
      if (finalTree && !reachedTree && player.vy >= 0) {
        if (selectedForce >= 0.5) {
          const tx = finalTree.worldX - cameraX;
          player.x = tx - player.w / 2;
          player.y = finalTree.platformY - player.h;
          player.vy = 0;
          player.onGround = true;
          reachedTree = true;
          phase = 'win_dialog';
          winDialogTimer = 0;
          winDialogStage = 0;
          player.speech = {
            text: '¿Qué hace un pájaro de 100kg en una rama?',
            t: 99,
          };
          showChoiceButtons();
        }
      }
    } else if (phase === 'win_dialog') {
      // Stage 0: esperando a que el jugador elija opción (no avanza el timer).
      // Stage 1: ya respondió Blas; tras unos segundos, win().
      if (winDialogStage >= 1) {
        winDialogTimer += dt;
        if (winDialogTimer > 2.8) {
          win();
        }
      }
    } else if (phase === 'fall_down') {
      fallDownTimer += dt;
      if (fallDownTimer > 2.3) {
        if (window.debugMode) {
          // En debug: vuelve a la pantalla de selección de fuerza
          phase = 'final';
          fallDownTimer = 0;
          reachedTree = false;
          player.x = PLAYER_X;
          player.y = GROUND_Y - player.h;
          player.vy = 0;
          player.onGround = true;
          warningAlpha = 1;
          meterPos = 0;
          meterDir = 1;
        } else {
          // Pierde todas las vidas y pasa a Game Over
          lives = 0;
          updateHUD();
          phase = 'over';
          running = false;
          window.Game && window.Game.onGameOver && window.Game.onGameOver();
        }
      }
    }

    // Físicas: solo aplican en fases con movimiento vertical/horizontal libre.
    const physicsActive = (
      phase === 'run' || phase === 'jump' || phase === 'carrerilla'
    );
    const wasOnGround = player.onGround;
    if (physicsActive) {
      player.vy += GRAVITY * dt;
      player.y += player.vy * dt;
      player.onGround = false;
      // Suelo
      if (player.y + player.h >= GROUND_Y) {
        player.y = GROUND_Y - player.h;
        player.vy = 0;
        player.onGround = true;
      }
      // Techo durante el super-salto: evita que Blas se salga por arriba
      // antes de que la lógica decida ganar o perder.
      if (phase === 'jump' && finalTree && player.y < finalTree.platformY - player.h - 8) {
        player.y = finalTree.platformY - player.h - 8;
        player.vy = Math.max(0, player.vy);
      }
    }

    // Si estaba en el aire (jump) y vuelve a tocar el suelo sin haber
    // alcanzado la copa → se cae bocarriba.
    if (phase === 'jump' && !wasOnGround && player.onGround && !reachedTree) {
      phase = 'fall_down';
      fallDownTimer = 0;
      player.vy = 0;
    }

    // Invulnerabilidad
    if (invuln > 0) invuln -= dt;

    // Spawn buzones por tiempo
    const elapsed = DURATION - timeLeft;
    buzones.forEach((b) => {
      if (!b.spawned && elapsed >= b.spawnAt) {
        b.spawned = true;
        b.worldX = cameraX + VW + 20;
      }
      if (b.spawned && b.alive) {
        // velocidad en el mundo: vienen hacia la izquierda y además el mundo avanza
        // pero ya estamos representando cameraX, así que basta restar tiempo al worldX
        b.worldX += b.vx * dt;
      }
      // Animación de aplastamiento: la altura cae hasta b.targetH manteniendo
      // la base apoyada (b.baseY constante).
      if (b.squashed && b.h > b.targetH) {
        b.h = Math.max(b.targetH, b.h - 220 * dt);
        b.y = b.baseY - b.h;
      }
    });
    // Limpia buzones que pasaron a la izquierda
    buzones = buzones.filter((b) => !b.spawned || b.worldX > cameraX - 80);

    // Vecinos: animación de bocadillo
    neighbors.forEach((n) => {
      if (!n.alive) return;
      const screenX = n.worldX - cameraX;
      if (screenX > -40 && screenX < VW + 40) {
        n.sayTimer += dt;
      }
    });

    // Sobres
    envelopes.forEach((e) => {
      if (!e.alive) return;
      e.worldX += e.vx * dt;
      e.spin += dt * 10;
    });
    envelopes = envelopes.filter((e) => e.alive && (e.worldX - cameraX) < VW + 30);

    // Popups
    popups.forEach((p) => { p.t -= dt; });
    popups = popups.filter((p) => p.t > 0);

    // Bocadillo de Blas (decae con el tiempo)
    if (player.speech.t > 0) player.speech.t -= dt;

    // Colisiones
    handleCollisions();

    // Vecinos que se han escapado vivos: pierde vida y le gritan en rojo.
    // Se considera "escapado" cuando el vecino queda detrás de Blas en el mundo.
    const blasWorldX = cameraX + player.x;
    neighbors.forEach((n) => {
      if (!n.alive || n.missed) return;
      if (n.worldX < blasWorldX) {
        n.missed = true;
        n.phrase = '¡Cabronazo! ¡Mañana vuelves!';
        n.sayTimer = 0;
        if (invuln <= 0) loseLife();
      }
    });

    // Reflejar la fase en las clases del stage (oculta controles en final)
    syncUIPhase();
  }

  function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  function handleCollisions() {
    const px = player.x;
    const py = player.y;
    const pw = player.w;
    const ph = player.h;

    // Sobres vs vecinos
    envelopes.forEach((e) => {
      if (!e.alive) return;
      const ex = e.worldX - cameraX;
      neighbors.forEach((n) => {
        if (!n.alive) return;
        const nx = n.worldX - cameraX - n.w / 2;
        if (rectsOverlap(ex, e.y, e.w, e.h, nx, n.y, n.w, n.h)) {
          n.alive = false;
          e.alive = false;
          score += 100;
          popups.push({ worldX: n.worldX, y: n.y - 8, text: '+100', t: 0.9 });
          // Blas solo contesta si el vecino le había reclamado el paquete
          if (/paquete/i.test(n.phrase)) {
            player.speech = { text: BLAS_KILL_PHRASE, t: 1.6 };
          }
          updateHUD();
        }
      });
    });

    // Buzones vs jugador
    buzones.forEach((b) => {
      if (!b.spawned || !b.alive) return;
      const bx = b.worldX - cameraX;
      if (!rectsOverlap(px, py, pw, ph, bx, b.y, b.w, b.h)) return;

      // Aplastado: no causa daño y se puede pasar por encima sin rebote
      if (b.squashed) return;

      const cameFromAbove = player.vy > 0 && (py + ph - b.y) < 20;
      if (cameFromAbove) {
        // Marcar como aplastado: la altura se reducirá hasta 20 manteniendo
        // la base del buzón apoyada (b.baseY no cambia).
        b.squashed = true;
        b.targetH = 20;
        b.baseY = b.y + b.h;
        score += 200;
        popups.push({ worldX: b.worldX, y: b.y - 8, text: '+200', t: 0.9 });
        player.vy = STOMP_VY;
        player.onGround = false;
        updateHUD();
      } else {
        if (invuln <= 0) {
          loseLife();
        }
      }
    });
  }

  function loseLife() {
    // En modo debug no se pierde vida (sólo rebota un poco para feedback)
    if (window.debugMode) {
      invuln = 1.0;
      player.vy = -300;
      return;
    }
    lives -= 1;
    invuln = 1.2;
    updateHUD();
    if (lives <= 0) {
      phase = 'over';
      running = false;
      window.Game && window.Game.onGameOver && window.Game.onGameOver();
    } else {
      // pequeño rebote hacia arriba
      player.vy = -300;
    }
  }

  function win() {
    if (phase === 'win') return;
    phase = 'win';
    running = false;
    // Pequeño delay para que se vea el aterrizaje
    setTimeout(() => {
      window.Game && window.Game.onLevelComplete && window.Game.onLevelComplete();
    }, 700);
  }

  function updateHUD() {
    const s = document.getElementById('hudScore');
    const t = document.getElementById('hudTime');
    const l = document.getElementById('hudLives');
    if (s) s.textContent = String(score).padStart(4, '0');
    if (t) t.textContent = Math.ceil(timeLeft);
    if (l) l.textContent = '♥'.repeat(Math.max(0, lives));
  }

  // -------------------- Render --------------------
  function draw() {
    // Aplicamos la escala del backing-buffer al espacio lógico (VWxVH)
    const s = ctx._scaleFactor || RENDER_SCALE;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Cielo
    ctx.fillStyle = COLORS.sky;
    ctx.fillRect(0, 0, VW, VH);

    // Nubes (parallax lento)
    drawClouds();

    // Montañas (parallax medio)
    drawMountains();

    // Casas (mundo)
    drawHouses();

    // Casablanca al fondo del tramo final
    drawCasablanca();

    // Suelo (acera + carretera)
    drawGround();

    // Árbol final
    drawTree();

    // Vecinos
    drawNeighbors();

    // Buzones
    drawBuzones();

    // Sobres
    drawEnvelopes();

    // Jugador (tumbado si se cayó)
    if (phase === 'fall_down') {
      drawPlayerFallen();
    } else {
      drawPlayer();
    }

    // Popups (puntuaciones flotantes y textos)
    drawPopups();

    // Overlays de la zona final
    drawFinalWarning();
    drawForceMeter();
    drawFallDownOverlay();

    // Marca de inicio
    if (cameraX < 40 && phase === 'run') {
      ctx.fillStyle = '#000';
      ctx.font = '14px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('¡GO!', VW / 2, 60);
    }
  }

  function drawClouds() {
    const parallax = cameraX * 0.2;
    ctx.fillStyle = COLORS.cloud;
    const cloudPositions = [80, 220, 360, 540, 720, 900, 1080, 1260, 1440, 1620, 1820, 2000, 2200, 2400, 2600, 2800, 3000, 3200, 3400, 3600, 3800, 4000, 4200, 4400, 4600, 4800, 5000, 5200];
    cloudPositions.forEach((cx, i) => {
      const x = ((cx - parallax) % (VW + 200) + (VW + 200)) % (VW + 200) - 100;
      const y = 30 + (i % 3) * 18;
      drawCloud(x, y);
    });
  }
  function drawCloud(x, y) {
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI*2);
    ctx.arc(x + 10, y - 4, 12, 0, Math.PI*2);
    ctx.arc(x + 22, y, 10, 0, Math.PI*2);
    ctx.arc(x + 32, y + 2, 8, 0, Math.PI*2);
    ctx.fill();
  }

  function drawMountains() {
    const parallax = cameraX * 0.35;
    ctx.fillStyle = COLORS.mountainB;
    for (let i = 0; i < 12; i++) {
      const baseX = i * 220 - parallax;
      ctx.beginPath();
      ctx.moveTo(baseX - 80, GROUND_Y);
      ctx.lineTo(baseX + 20, 110);
      ctx.lineTo(baseX + 120, GROUND_Y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = COLORS.mountainF;
    for (let i = 0; i < 12; i++) {
      const baseX = i * 220 - parallax + 110;
      ctx.beginPath();
      ctx.moveTo(baseX - 70, GROUND_Y);
      ctx.lineTo(baseX, 140);
      ctx.lineTo(baseX + 70, GROUND_Y);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawGround() {
    // Acera
    ctx.fillStyle = COLORS.sidewalk;
    ctx.fillRect(0, GROUND_Y, VW, 8);
    ctx.fillStyle = COLORS.sidewalkEdge;
    ctx.fillRect(0, GROUND_Y + 8, VW, 2);
    // Carretera
    ctx.fillStyle = COLORS.road;
    ctx.fillRect(0, GROUND_Y + 10, VW, VH - (GROUND_Y + 10));
    // Línea discontinua
    ctx.fillStyle = COLORS.roadLine;
    const dashOffset = (cameraX * 1) % 40;
    for (let x = -dashOffset; x < VW; x += 40) {
      ctx.fillRect(x, GROUND_Y + 30, 20, 3);
    }
  }

  function drawHouses() {
    houses.forEach((h) => {
      const sx = h.worldX - cameraX;
      if (sx + h.w < -20 || sx > VW + 20) return;
      const y = GROUND_Y - h.h;

      // Cuerpo con un degradado vertical para dar volumen
      const grad = ctx.createLinearGradient(0, y, 0, y + h.h);
      grad.addColorStop(0, lighten(h.color, 0.08));
      grad.addColorStop(1, darken(h.color, 0.1));
      ctx.fillStyle = grad;
      ctx.fillRect(sx, y, h.w, h.h);

      // Banda de sombra a la izquierda
      ctx.fillStyle = darken(h.color, 0.18);
      ctx.fillRect(sx, y, 3, h.h);

      // Tejado con relieve
      ctx.fillStyle = h.roof;
      ctx.beginPath();
      ctx.moveTo(sx - 8, y);
      ctx.lineTo(sx + h.w / 2, y - 32);
      ctx.lineTo(sx + h.w + 8, y);
      ctx.closePath();
      ctx.fill();
      // Sombra del lado oscuro del tejado
      ctx.fillStyle = darken(h.roof, 0.22);
      ctx.beginPath();
      ctx.moveTo(sx + h.w / 2, y - 32);
      ctx.lineTo(sx + h.w + 8, y);
      ctx.lineTo(sx + h.w / 2 + 1, y);
      ctx.closePath();
      ctx.fill();
      // Alero
      ctx.fillStyle = darken(h.roof, 0.4);
      ctx.fillRect(sx - 8, y, h.w + 16, 3);

      // Puerta
      ctx.fillStyle = COLORS.door;
      const dw = 22, dh = 34;
      const dx = sx + h.w / 2 - dw / 2;
      const dy = y + h.h - dh;
      ctx.fillRect(dx, dy, dw, dh);
      // Marco oscuro
      ctx.fillStyle = COLORS.doorDark;
      ctx.fillRect(dx, dy, 1.5, dh);
      ctx.fillRect(dx + dw - 1.5, dy, 1.5, dh);
      ctx.fillRect(dx, dy, dw, 1.5);
      // Panel interior
      ctx.fillStyle = darken(COLORS.door, 0.25);
      ctx.fillRect(dx + 3, dy + 4, dw - 6, dh - 8);
      // Pomo
      ctx.fillStyle = COLORS.yellow;
      ctx.beginPath();
      ctx.arc(dx + dw - 4, dy + dh / 2, 1.5, 0, Math.PI * 2);
      ctx.fill();

      // Ventanas (con marco, cruz y reflejo)
      const wW = 22, wH = 20;
      const wY = y + 18;
      const wXs = [sx + 14, sx + h.w - 14 - wW];
      wXs.forEach((wx) => {
        // Marco
        ctx.fillStyle = COLORS.windowFrame;
        ctx.fillRect(wx - 1, wY - 1, wW + 2, wH + 2);
        // Cristal
        ctx.fillStyle = COLORS.window;
        ctx.fillRect(wx, wY, wW, wH);
        // Reflejo
        ctx.fillStyle = COLORS.windowSheen;
        ctx.fillRect(wx + 1, wY + 1, wW / 2 - 2, wH / 2 - 1);
        // Cruz central
        ctx.fillStyle = COLORS.windowFrame;
        ctx.fillRect(wx + wW / 2 - 0.5, wY, 1, wH);
        ctx.fillRect(wx, wY + wH / 2 - 0.5, wW, 1);
        // Alféizar
        ctx.fillStyle = darken(h.color, 0.3);
        ctx.fillRect(wx - 2, wY + wH, wW + 4, 2);
      });

      // Balcón (algunas casas)
      if (h.hasBalcony) {
        const by = y + Math.floor(h.h * 0.5);
        const bLeft = sx + 14;
        const bWidth = h.w - 28;
        // Plataforma
        ctx.fillStyle = COLORS.balcony;
        ctx.fillRect(bLeft - 2, by, bWidth + 4, 4);
        ctx.fillStyle = darken(COLORS.balcony, 0.3);
        ctx.fillRect(bLeft - 2, by + 4, bWidth + 4, 1);
        // Puerta de balcón en el centro
        const bdW = 18, bdH = 26;
        const bdX = sx + h.w / 2 - bdW / 2;
        const bdY = by - bdH;
        ctx.fillStyle = COLORS.windowFrame;
        ctx.fillRect(bdX - 1, bdY - 1, bdW + 2, bdH + 2);
        ctx.fillStyle = COLORS.window;
        ctx.fillRect(bdX, bdY, bdW, bdH);
        ctx.fillStyle = COLORS.windowSheen;
        ctx.fillRect(bdX + 1, bdY + 1, bdW / 2 - 1, bdH / 2);
        ctx.fillStyle = COLORS.windowFrame;
        ctx.fillRect(bdX + bdW / 2 - 0.5, bdY, 1, bdH);
        // Barandilla: pasamanos arriba y barrotes
        ctx.fillStyle = COLORS.rail;
        ctx.fillRect(bLeft - 2, by - 12, bWidth + 4, 2);
        for (let rx = bLeft; rx < bLeft + bWidth; rx += 4) {
          ctx.fillRect(rx, by - 12, 1, 12);
        }
      }

      // Número de portal sobre la puerta
      ctx.fillStyle = '#fff';
      ctx.font = '7px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(String((h.idx % 9) + 1), sx + h.w / 2, dy - 4);
    });
  }

  // -------- Helpers de color y formas --------
  function hexToRgb(hex) {
    const m = hex.replace('#', '');
    const v = parseInt(m, 16);
    return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
  }
  function rgbToHex(r, g, b) {
    const c = (v) => ('0' + Math.max(0, Math.min(255, v | 0)).toString(16)).slice(-2);
    return '#' + c(r) + c(g) + c(b);
  }
  function lighten(hex, amount) {
    const { r, g, b } = hexToRgb(hex);
    return rgbToHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount);
  }
  function darken(hex, amount) {
    const { r, g, b } = hexToRgb(hex);
    return rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
  }
  function roundRectPath(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
  }

  // Dibuja un bocadillo de cómic con cola hacia abajo apuntando al hablante.
  // (cx, cy) = posición del hablante (la cola apunta ahí).
  // variant: 'normal' (blanco) | 'angry' (rojo)
  function drawSpeechBubble(cx, cy, text, alpha, variant) {
    if (alpha <= 0) return;
    const angry = variant === 'angry';
    const bg     = angry ? '#d11a1a' : '#fff';
    const fg     = angry ? '#ffffff' : '#000000';
    const border = angry ? '#5a0a0a' : '#000000';

    ctx.save();
    ctx.globalAlpha = Math.min(1, alpha);

    ctx.font = angry
      ? 'bold 10px "Segoe UI", "Helvetica Neue", Arial, sans-serif'
      : BUBBLE_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(text).width;
    const padX = 7;
    const w = Math.ceil(tw) + padX * 2;
    const h = angry ? 18 : 16;
    let bx = Math.round(cx - w / 2);
    if (bx < 4) bx = 4;
    if (bx + w > VW - 4) bx = VW - 4 - w;
    let by = cy - h - 8;
    // Si el hablante está muy arriba (como Blas en la copa del ciprés),
    // pegamos el bocadillo al top y ocultamos la cola.
    let showTail = true;
    if (by < 4) {
      by = 4;
      showTail = false;
    }

    // Sombra
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    roundRectPath(bx + 1, by + 2, w, h, 5);
    ctx.fill();

    // Fondo
    ctx.fillStyle = bg;
    roundRectPath(bx, by, w, h, 5);
    ctx.fill();
    ctx.strokeStyle = border;
    ctx.lineWidth = angry ? 1.5 : 1;
    roundRectPath(bx, by, w, h, 5);
    ctx.stroke();

    // Cola
    if (showTail) {
      const tipX = Math.max(bx + 6, Math.min(bx + w - 6, cx));
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.moveTo(tipX - 4, by + h - 0.5);
      ctx.lineTo(tipX, by + h + 6);
      ctx.lineTo(tipX + 4, by + h - 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = border;
      ctx.beginPath();
      ctx.moveTo(tipX - 4, by + h);
      ctx.lineTo(tipX, by + h + 6);
      ctx.lineTo(tipX + 4, by + h);
      ctx.stroke();
    }

    // Texto
    ctx.fillStyle = fg;
    ctx.fillText(text, bx + w / 2, by + h / 2 + 1);
    ctx.restore();
  }

  function drawCasablanca() {
    if (!casablanca) return;
    const sx = casablanca.worldX - cameraX;
    if (sx + casablanca.w < -10 || sx > VW + 10) return;
    const y = GROUND_Y - casablanca.h;
    const cw = casablanca.w, ch = casablanca.h;

    // Cuerpo con degradado
    const grad = ctx.createLinearGradient(0, y, 0, y + ch);
    grad.addColorStop(0, lighten(COLORS.casablanca, 0.08));
    grad.addColorStop(1, darken(COLORS.casablanca, 0.12));
    ctx.fillStyle = grad;
    ctx.fillRect(sx, y, cw, ch);
    // Lado sombreado
    ctx.fillStyle = darken(COLORS.casablanca, 0.2);
    ctx.fillRect(sx, y, 4, ch);

    // Tejado plano con cornisa
    ctx.fillStyle = '#8a6a4a';
    ctx.fillRect(sx - 6, y - 12, cw + 12, 12);
    ctx.fillStyle = '#5a3416';
    ctx.fillRect(sx - 6, y - 12, cw + 12, 3);

    // Cartel grande arriba
    ctx.fillStyle = COLORS.casablancaSign;
    ctx.fillRect(sx + 8, y + 8, cw - 16, 28);
    ctx.strokeStyle = '#5a0a0a';
    ctx.lineWidth = 2;
    ctx.strokeRect(sx + 8, y + 8, cw - 16, 28);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('CASABLANCA', sx + cw / 2, y + 22);
    ctx.textBaseline = 'alphabetic';

    // Toldo rojo a rayas
    const tW = cw - 24;
    const tX = sx + 12;
    const tY = y + 44;
    ctx.fillStyle = '#aa1f1f';
    ctx.fillRect(tX, tY, tW, 10);
    ctx.fillStyle = '#fff';
    for (let i = 0; i < tW; i += 14) {
      ctx.fillRect(tX + i, tY, 6, 10);
    }
    // Borde inferior del toldo (ondulado)
    ctx.fillStyle = '#aa1f1f';
    for (let i = 0; i < tW; i += 10) {
      ctx.beginPath();
      ctx.arc(tX + i + 5, tY + 10, 5, 0, Math.PI);
      ctx.fill();
    }

    // Ventanal grande
    ctx.fillStyle = COLORS.windowFrame;
    ctx.fillRect(sx + 14, tY + 22, 50, 50);
    ctx.fillStyle = COLORS.window;
    ctx.fillRect(sx + 16, tY + 24, 46, 46);
    ctx.fillStyle = COLORS.windowSheen;
    ctx.fillRect(sx + 17, tY + 25, 22, 22);
    ctx.fillStyle = COLORS.windowFrame;
    ctx.fillRect(sx + 14 + 24, tY + 22, 2, 50);
    ctx.fillRect(sx + 14, tY + 22 + 24, 50, 2);
    // Sombrita interior (gente al fondo del bar)
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(sx + 22, tY + 56, 36, 12);

    // Puerta principal a la derecha del ventanal
    const dW = 36, dH = 64;
    const dX = sx + cw - dW - 18;
    const dY = y + ch - dH;
    ctx.fillStyle = COLORS.door;
    ctx.fillRect(dX, dY, dW, dH);
    ctx.fillStyle = COLORS.doorDark;
    ctx.fillRect(dX, dY, 2, dH);
    ctx.fillRect(dX + dW - 2, dY, 2, dH);
    ctx.fillRect(dX, dY, dW, 2);
    // Paneles
    ctx.fillStyle = darken(COLORS.door, 0.25);
    ctx.fillRect(dX + 4, dY + 6, dW - 8, dH / 2 - 6);
    ctx.fillRect(dX + 4, dY + dH / 2 + 2, dW - 8, dH / 2 - 8);
    // Pomo
    ctx.fillStyle = COLORS.yellow;
    ctx.beginPath();
    ctx.arc(dX + dW - 6, dY + dH / 2, 2, 0, Math.PI * 2);
    ctx.fill();

    // Letrerito "ABIERTO" colgado
    ctx.fillStyle = '#2c2c2c';
    ctx.fillRect(dX + dW / 2 - 14, dY + 6, 28, 8);
    ctx.fillStyle = '#7eff7e';
    ctx.font = '5px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ABIERTO', dX + dW / 2, dY + 12);
  }

  function drawTree() {
    if (!finalTree) return;
    const sx = finalTree.worldX - cameraX;
    if (sx < -150 || sx > VW + 150) return;

    const baseY = finalTree.baseY;
    const tw = finalTree.trunkW;
    const th = finalTree.trunkH;

    // Tronco grueso con la corteza moteada típica del platanero
    // Base ligeramente ensanchada (raíces afloradas)
    ctx.fillStyle = '#a08763';
    ctx.beginPath();
    ctx.ellipse(sx, baseY, tw / 2 + 6, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Fuste principal: dos tonos para volumen
    ctx.fillStyle = '#8a7050';
    ctx.fillRect(sx - tw / 2, baseY - th, tw, th);
    ctx.fillStyle = '#bda483';
    ctx.fillRect(sx - tw / 2 + 3, baseY - th, tw - 6, th);
    // Banda iluminada
    ctx.fillStyle = '#d8c19a';
    ctx.fillRect(sx - tw / 2 + 5, baseY - th + 2, 4, th - 4);

    // Manchas de corteza desprendida (claros y oscuros) — sello del platanero
    const patches = [
      { dx: -4, dy: 14, w: 8,  h: 11, c: '#dac8a8' },
      { dx:  6, dy: 32, w: 7,  h:  9, c: '#7a5e3e' },
      { dx: -8, dy: 48, w: 6,  h: 12, c: '#dac8a8' },
      { dx:  4, dy: 60, w: 8,  h:  9, c: '#7a5e3e' },
      { dx: -3, dy: 72, w: 5,  h:  7, c: '#dac8a8' },
      { dx:  2, dy: 22, w: 5,  h:  6, c: '#5a3a1c' },
    ];
    patches.forEach((p) => {
      if (p.dy >= th - 2) return;
      ctx.fillStyle = p.c;
      ctx.fillRect(sx + p.dx - p.w / 2, baseY - th + p.dy, p.w, p.h);
    });

    // Algunas ramas saliendo bajo la copa
    ctx.strokeStyle = '#7a5e3e';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx - tw / 2, baseY - th + 18);
    ctx.lineTo(sx - tw / 2 - 18, baseY - th + 4);
    ctx.moveTo(sx + tw / 2, baseY - th + 12);
    ctx.lineTo(sx + tw / 2 + 22, baseY - th - 2);
    ctx.moveTo(sx + tw / 2 - 2, baseY - th + 30);
    ctx.lineTo(sx + tw / 2 + 14, baseY - th + 22);
    ctx.stroke();
    ctx.lineCap = 'butt';

    // Copa redonda y frondosa: varios círculos verdes combinados
    const cTop = finalTree.canopyTop;
    const cBot = finalTree.canopyBot;
    const cw   = finalTree.canopyW;
    const ch   = cBot - cTop;
    const cx   = sx;
    const cy   = (cTop + cBot) / 2;

    // Sombras (capa de fondo, más oscura, ligeramente más grande)
    ctx.fillStyle = COLORS.leavesDark;
    const dark = [
      [   0, 6, cw / 2,        ch / 2 + 2],
      [-cw*0.35, 8,  cw * 0.36, ch * 0.40],
      [ cw*0.35, 8,  cw * 0.36, ch * 0.40],
      [-cw*0.20, -ch*0.30, cw * 0.36, ch * 0.36],
      [ cw*0.20, -ch*0.34, cw * 0.32, ch * 0.34],
    ];
    dark.forEach(([dx, dy, rx, ry]) => {
      ctx.beginPath();
      ctx.ellipse(cx + dx, cy + dy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    });

    // Capa verde principal
    ctx.fillStyle = COLORS.leaves;
    const mid = [
      [   0,  2,  cw / 2 - 6,    ch / 2 - 4],
      [-cw*0.30, 4,  cw * 0.30, ch * 0.34],
      [ cw*0.30, 4,  cw * 0.30, ch * 0.34],
      [-cw*0.18, -ch*0.30, cw * 0.30, ch * 0.30],
      [ cw*0.22, -ch*0.32, cw * 0.28, ch * 0.30],
      [   0, -ch*0.40, cw * 0.28, ch * 0.24],
    ];
    mid.forEach(([dx, dy, rx, ry]) => {
      ctx.beginPath();
      ctx.ellipse(cx + dx, cy + dy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    });

    // Brillos (luz arriba/izquierda)
    ctx.fillStyle = lighten(COLORS.leaves, 0.25);
    [
      [-cw*0.18, -ch*0.30, cw * 0.18, ch * 0.18],
      [ cw*0.05, -ch*0.40, cw * 0.16, ch * 0.16],
      [-cw*0.35,  ch*0.05, cw * 0.14, ch * 0.14],
    ].forEach(([dx, dy, rx, ry]) => {
      ctx.beginPath();
      ctx.ellipse(cx + dx, cy + dy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    });

    // Algunas hojas palmadas dibujadas como detalle (manchas estrelladas)
    ctx.fillStyle = darken(COLORS.leaves, 0.25);
    const leaves = [
      [-cw*0.30,  ch*0.05],
      [ cw*0.28, -ch*0.10],
      [-cw*0.05, -ch*0.35],
      [ cw*0.10,  ch*0.20],
      [-cw*0.20,  ch*0.30],
    ];
    leaves.forEach(([dx, dy]) => {
      drawPalmateLeaf(cx + dx, cy + dy, 5);
    });

    // Flecha intermitente apuntando a la copa durante final/jump
    if (phase === 'final' || phase === 'jump') {
      const blink = Math.floor(performance.now() / 250) % 2 === 0;
      if (blink) {
        ctx.fillStyle = '#fff';
        ctx.font = '10px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('▼', cx, finalTree.platformY - 6);
      }
    }
  }

  // Hoja palmada (5 lóbulos) usada como detalle decorativo en la copa
  function drawPalmateLeaf(cx, cy, r) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.sin(cx + cy) * 0.6);
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (Math.PI * 2 * i) / 5 - Math.PI / 2;
      const tipX = Math.cos(a) * r;
      const tipY = Math.sin(a) * r;
      const sideA = a + Math.PI / 5;
      const sideX = Math.cos(sideA) * r * 0.45;
      const sideY = Math.sin(sideA) * r * 0.45;
      if (i === 0) ctx.moveTo(tipX, tipY);
      else         ctx.lineTo(tipX, tipY);
      ctx.lineTo(sideX, sideY);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Aviso "¡Salta lo más alto que puedas!" mientras se está eligiendo fuerza
  function drawFinalWarning() {
    if (warningAlpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = warningAlpha * 0.45;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, VW, VH);
    ctx.globalAlpha = warningAlpha;
    const bx = 30, by = 30, bw = VW - 60, bh = 70;
    ctx.fillStyle = COLORS.yellow;
    roundRectPath(bx, by, bw, bh, 8);
    ctx.fill();
    ctx.strokeStyle = COLORS.blue;
    ctx.lineWidth = 4;
    roundRectPath(bx, by, bw, bh, 8);
    ctx.stroke();
    ctx.fillStyle = COLORS.blue;
    ctx.font = 'bold 14px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('¡SALTA LO MÁS', VW / 2, by + 24);
    ctx.fillText('ALTO QUE PUEDAS!', VW / 2, by + 48);
    ctx.restore();
  }

  // Barra oscilante de fuerza: indicador rebota muy rápido entre 0 y 1
  function drawForceMeter() {
    if (phase !== 'final') return;
    const W = 280, H = 18;
    const x0 = (VW - W) / 2;
    const y0 = VH - 70;
    ctx.save();
    // Fondo
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    roundRectPath(x0 - 6, y0 - 26, W + 12, H + 44, 8);
    ctx.fill();
    // Texto instrucción (parpadea)
    const blink = Math.floor(performance.now() / 350) % 2 === 0;
    ctx.fillStyle = blink ? '#fff' : '#ffd200';
    ctx.font = 'bold 11px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PULSA ▲ PARA SALTAR', VW / 2, y0 - 12);
    // Barra de fondo con gradiente
    const grad = ctx.createLinearGradient(x0, 0, x0 + W, 0);
    grad.addColorStop(0, '#3a8a3a');
    grad.addColorStop(0.55, '#ffd200');
    grad.addColorStop(1, '#ff3a3a');
    ctx.fillStyle = grad;
    roundRectPath(x0, y0, W, H, 5);
    ctx.fill();
    // Marca de "mitad del árbol" como referencia visual
    const halfMark = 0.55;
    const markX = x0 + W * halfMark;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(markX, y0 - 4);
    ctx.lineTo(markX, y0 + H + 4);
    ctx.stroke();
    // Borde de la barra
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    roundRectPath(x0, y0, W, H, 5);
    ctx.stroke();
    // Indicador (flecha) en la posición actual
    const indX = x0 + W * meterPos;
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(indX, y0 - 2);
    ctx.lineTo(indX - 6, y0 - 12);
    ctx.lineTo(indX + 6, y0 - 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(indX, y0 + H + 2);
    ctx.lineTo(indX - 6, y0 + H + 12);
    ctx.lineTo(indX + 6, y0 + H + 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Overlay grande "TE CAÍSTE DEL ÁRBOL" mientras Blas está tumbado
  function drawFallDownOverlay() {
    if (phase !== 'fall_down') return;
    const alpha = Math.min(1, fallDownTimer * 2);
    ctx.save();
    ctx.globalAlpha = alpha * 0.4;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, VW, VH);
    ctx.globalAlpha = alpha;
    const bx = 30, by = VH / 2 - 30, bw = VW - 60, bh = 60;
    ctx.fillStyle = '#c41a1a';
    roundRectPath(bx, by, bw, bh, 8);
    ctx.fill();
    ctx.strokeStyle = '#5a0a0a';
    ctx.lineWidth = 4;
    roundRectPath(bx, by, bw, bh, 8);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('¡TE CAÍSTE', VW / 2, by + 22);
    ctx.fillText('DEL ÁRBOL!', VW / 2, by + 42);
    ctx.restore();
  }

  function drawNeighborHeadClean(sx, y, pal) {
    ctx.save();
    // Cara
    ctx.fillStyle = COLORS.skin;
    ctx.beginPath();
    ctx.ellipse(sx, y + 6, 7, 7.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Sombrita lateral derecha
    ctx.fillStyle = COLORS.skinDark;
    ctx.beginPath();
    ctx.ellipse(sx + 3.5, y + 7, 3, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Pelo (gorro de pelo)
    ctx.fillStyle = pal.hair;
    ctx.beginPath();
    ctx.ellipse(sx, y + 2, 7.5, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(sx - 7, y + 1, 14, 3);
    // Mechón
    ctx.fillStyle = darken(pal.hair, 0.2);
    ctx.fillRect(sx - 2, y + 1, 4, 3);
    // Cejas enfadadas
    ctx.fillStyle = '#000';
    ctx.fillRect(sx - 5, y + 5, 4, 1);
    ctx.fillRect(sx + 1, y + 5, 4, 1);
    ctx.fillRect(sx - 4, y + 4, 2, 1);
    ctx.fillRect(sx + 3, y + 4, 2, 1);
    // Ojos
    ctx.fillStyle = '#fff';
    ctx.fillRect(sx - 4, y + 6, 3, 2);
    ctx.fillRect(sx + 1, y + 6, 3, 2);
    ctx.fillStyle = '#000';
    ctx.fillRect(sx - 3, y + 6, 2, 2);
    ctx.fillRect(sx + 2, y + 6, 2, 2);
    // Boca gritando (abierta, óvalo oscuro con lengua)
    ctx.fillStyle = '#3a1010';
    ctx.beginPath();
    ctx.ellipse(sx, y + 10.5, 3, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d44';
    ctx.fillRect(sx - 1, y + 11, 2, 1);
    // Orejas
    ctx.fillStyle = COLORS.skin;
    ctx.beginPath();
    ctx.ellipse(sx - 7, y + 7, 1.5, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(sx + 7, y + 7, 1.5, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawNeighbors() {
    neighbors.forEach((n) => {
      if (!n.alive) return;
      const sx = n.worldX - cameraX;
      if (sx < -40 || sx > VW + 40) return;
      drawNeighborBodyV2(sx, n);

      // Bocadillo
      let alpha = 0;
      let variant = 'normal';
      if (n.missed) {
        // Cuando se le ha escapado: bocadillo rojo, fade-in rápido y se
        // mantiene visible hasta que sale de pantalla.
        alpha = Math.min(1, n.sayTimer * 4);
        variant = 'angry';
      } else {
        // Pulsa: visible ~2.5s, fade ~0.5s, oculto ~1s
        const cycle = n.sayTimer % 4;
        if (cycle < 2.5) alpha = 1;
        else if (cycle < 3) alpha = 1 - (cycle - 2.5) / 0.5;
      }
      if (alpha > 0) {
        drawSpeechBubble(sx, n.y + 2, n.phrase, alpha, variant);
      }
    });
  }

  // Versión limpia de cuerpo+cabeza sin contaminar estado
  function drawNeighborBodyV2(sx, n) {
    const y = n.y;
    const pal = n.palette;

    if (n.halfBody) {
      // Sombra del torso
      ctx.fillStyle = darken(pal.shirt, 0.28);
      ctx.fillRect(sx - 8, y + 12, 16, 10);
      // Camisa
      ctx.fillStyle = pal.shirt;
      ctx.fillRect(sx - 7, y + 12, 14, 9);
      // Pliegue de luz
      ctx.fillStyle = lighten(pal.shirt, 0.18);
      ctx.fillRect(sx - 6, y + 12, 2, 8);
      // Brazos sobre alféizar/baranda
      ctx.fillStyle = pal.shirt;
      ctx.fillRect(sx - 10, y + 14, 4, 5);
      ctx.fillRect(sx + 6, y + 14, 4, 5);
      // Manos
      ctx.fillStyle = COLORS.skin;
      ctx.fillRect(sx - 11, y + 18, 4, 3);
      ctx.fillRect(sx + 7, y + 18, 4, 3);
      ctx.fillStyle = COLORS.skinDark;
      ctx.fillRect(sx - 11, y + 20, 4, 1);
      ctx.fillRect(sx + 7, y + 20, 4, 1);
    } else {
      // Sombra en el suelo
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.ellipse(sx, GROUND_Y + 2, 9, 2, 0, 0, Math.PI * 2);
      ctx.fill();
      // Piernas
      ctx.fillStyle = COLORS.pants;
      ctx.fillRect(sx - 6, y + 26, 5, 11);
      ctx.fillRect(sx + 1, y + 26, 5, 11);
      // Zapatos
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(sx - 7, y + 36, 7, 2);
      ctx.fillRect(sx, y + 36, 7, 2);
      // Camisa
      ctx.fillStyle = darken(pal.shirt, 0.25);
      ctx.fillRect(sx - 8, y + 12, 16, 16);
      ctx.fillStyle = pal.shirt;
      ctx.fillRect(sx - 7, y + 12, 14, 15);
      ctx.fillStyle = lighten(pal.shirt, 0.18);
      ctx.fillRect(sx - 6, y + 13, 2, 13);
      // Brazos
      ctx.fillStyle = pal.shirt;
      ctx.fillRect(sx - 10, y + 14, 3, 12);
      ctx.fillRect(sx + 7, y + 14, 3, 12);
      // Puños cerrados
      ctx.fillStyle = COLORS.skin;
      ctx.fillRect(sx - 10, y + 25, 3, 4);
      ctx.fillRect(sx + 7, y + 25, 3, 4);
    }

    // Cuello
    ctx.fillStyle = COLORS.skinDark;
    ctx.fillRect(sx - 2, y + 11, 4, 2);

    drawNeighborHeadClean(sx, y, pal);
  }

  function drawBuzones() {
    buzones.forEach((b) => {
      if (!b.spawned || !b.alive) return;
      const sx = b.worldX - cameraX;
      if (sx < -30 || sx > VW + 30) return;
      if (buzonSprite) {
        ctx.drawImage(buzonSprite, sx - b.w / 2, b.y, b.w, b.h);
      } else {
        // Fallback dibujado
        ctx.fillStyle = COLORS.yellow;
        ctx.fillRect(sx - b.w / 2, b.y, b.w, b.h);
        ctx.fillStyle = COLORS.blue;
        ctx.fillRect(sx - b.w / 2 + 2, b.y + 4, b.w - 4, 2);
      }
    });
  }

  function drawEnvelopes() {
    envelopes.forEach((e) => {
      if (!e.alive) return;
      const sx = e.worldX - cameraX;
      const sy = e.y;
      ctx.save();
      ctx.translate(sx + e.w / 2, sy + e.h / 2);
      ctx.rotate(Math.sin(e.spin) * 0.4);
      ctx.fillStyle = COLORS.envelope;
      ctx.fillRect(-e.w / 2, -e.h / 2, e.w, e.h);
      ctx.fillStyle = COLORS.envelopeShadow;
      ctx.fillRect(-e.w / 2, e.h / 2 - 1, e.w, 1);
      // "Solapa"
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.moveTo(-e.w / 2, -e.h / 2);
      ctx.lineTo(0, 0);
      ctx.lineTo(e.w / 2, -e.h / 2);
      ctx.stroke();
      ctx.restore();
    });
  }

  function drawPlayer() {
    const blink = invuln > 0 && Math.floor(performance.now() / 80) % 2 === 0;
    const x = player.x;
    const y = player.y;

    if (!blink) {
      // Sombra en el suelo
      if (player.onGround) {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath();
        ctx.ellipse(x + player.w / 2, GROUND_Y + 2, 12, 2.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Polo amarillo (con luz y sombra)
      ctx.fillStyle = COLORS.yellowDark;
      ctx.fillRect(x + 2, y + 14, player.w - 4, 15);
      ctx.fillStyle = COLORS.yellow;
      ctx.fillRect(x + 3, y + 14, player.w - 6, 13);
      ctx.fillStyle = lighten(COLORS.yellow, 0.25);
      ctx.fillRect(x + 4, y + 14, 3, 11);

      // Brazos
      ctx.fillStyle = COLORS.yellowDark;
      ctx.fillRect(x, y + 16, 4, 9);
      ctx.fillRect(x + player.w - 4, y + 16, 4, 9);
      ctx.fillStyle = COLORS.yellow;
      ctx.fillRect(x + 1, y + 16, 2, 8);
      ctx.fillRect(x + player.w - 3, y + 16, 2, 8);
      // Manos
      ctx.fillStyle = COLORS.skin;
      ctx.fillRect(x, y + 23, 4, 4);
      ctx.fillRect(x + player.w - 4, y + 23, 4, 4);
      ctx.fillStyle = COLORS.skinDark;
      ctx.fillRect(x, y + 26, 4, 1);
      ctx.fillRect(x + player.w - 4, y + 26, 4, 1);

      // Pantalón
      ctx.fillStyle = darken(COLORS.blue, 0.3);
      ctx.fillRect(x + 3, y + 28, player.w - 6, 9);
      ctx.fillStyle = COLORS.blue;
      ctx.fillRect(x + 4, y + 28, player.w - 8, 8);
      // Piernas con animación de paso (avanza tanto con la cámara como
      // cuando Blas corre por su cuenta en la carrerilla)
      const strideRef = cameraX + player.x;
      const stepPhase = !player.onGround ? 0 :
        (Math.floor((strideRef / 6) % 4) >= 2 ? 1 : -1);
      ctx.fillStyle = COLORS.blue;
      ctx.fillRect(x + 5, y + 32, 6, 5);
      ctx.fillRect(x + player.w - 11, y + 32, 6, 5);
      // Zapatos
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(x + 5 + (stepPhase > 0 ? 1 : 0), y + 36, 7, 2);
      ctx.fillRect(x + player.w - 12 + (stepPhase < 0 ? 1 : 0), y + 36, 7, 2);

      // Logo de Correos en el polo
      ctx.fillStyle = COLORS.blue;
      ctx.fillRect(x + player.w / 2 - 3, y + 18, 6, 5);
      ctx.fillStyle = COLORS.yellow;
      ctx.fillRect(x + player.w / 2 - 2, y + 20, 4, 1);

      // Bolsa de carteo (mejor definida)
      const bagX = x + player.w - 2;
      const bagY = y + 19;
      ctx.fillStyle = '#5a3416';
      ctx.fillRect(bagX, bagY, 9, 13);
      ctx.fillStyle = '#8a5a2a';
      ctx.fillRect(bagX + 1, bagY + 1, 7, 11);
      ctx.fillStyle = COLORS.yellow;
      ctx.fillRect(bagX + 2, bagY + 4, 5, 3); // cornete amarillo
      ctx.fillStyle = COLORS.blue;
      ctx.fillRect(bagX + 3, bagY + 5, 3, 1);
      // Correa
      ctx.strokeStyle = '#3a2110';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x + player.w - 4, y + 14);
      ctx.lineTo(bagX + 4, bagY);
      ctx.stroke();

      // Cabeza (sprite ya recortado con la gorra incluida, fondo transparente)
      if (faceSprite) {
        const fw = 28;
        const fh = fw * (faceSprite._ratio || 1.0);
        const fx = x + player.w / 2 - fw / 2;
        // La base del sprite (barba/mentón) queda justo encima del polo
        const fy = (y + 14) - fh;
        ctx.drawImage(faceSprite, fx, fy, fw, fh);
      } else {
        // Fallback dibujado: gorra + cara estilizadas
        ctx.fillStyle = COLORS.skin;
        ctx.beginPath();
        ctx.arc(x + player.w / 2, y + 6, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = COLORS.yellow;
        ctx.fillRect(x, y - 5, player.w, 6);
        ctx.fillRect(x - 3, y, player.w + 6, 3);
        ctx.fillStyle = COLORS.blue;
        ctx.fillRect(x + player.w / 2 - 3, y - 3, 6, 3);
      }
    }

    // Bocadillo de Blas (no parpadea aunque invuln esté activo)
    if (player.speech.t > 0) {
      const a = Math.min(1, player.speech.t * 1.5);
      drawSpeechBubble(x + player.w / 2, y - 6, player.speech.text, a, 'normal');
    }
  }

  // Blas tumbado bocarriba en el suelo (tras caerse del árbol)
  function drawPlayerFallen() {
    const cx = player.x + player.w / 2;
    const cy = GROUND_Y - 6;

    // Sombra
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(cx, GROUND_Y + 2, 28, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Cuerpo tumbado (polo amarillo): rectángulo horizontal
    ctx.fillStyle = COLORS.yellowDark;
    ctx.fillRect(cx - 12, cy - 6, 22, 12);
    ctx.fillStyle = COLORS.yellow;
    ctx.fillRect(cx - 11, cy - 5, 20, 10);

    // Pantalón (al otro lado del torso, hacia la izquierda = "abajo")
    ctx.fillStyle = COLORS.blue;
    ctx.fillRect(cx - 24, cy - 4, 13, 8);
    // Piernas extendidas (zapatos al final)
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(cx - 28, cy - 4, 4, 3);
    ctx.fillRect(cx - 28, cy + 1, 4, 3);

    // Brazos extendidos arriba y abajo
    ctx.fillStyle = COLORS.yellowDark;
    ctx.fillRect(cx - 4, cy - 14, 10, 4);
    ctx.fillRect(cx - 4, cy + 10, 10, 4);
    ctx.fillStyle = COLORS.skin;
    ctx.fillRect(cx + 6, cy - 14, 4, 4);
    ctx.fillRect(cx + 6, cy + 10, 4, 4);

    // Cabeza en el extremo derecho, mirando hacia arriba (sprite rotado 90°)
    if (faceSprite) {
      const fw = 24;
      const fh = fw * (faceSprite._ratio || 1.0);
      ctx.save();
      ctx.translate(cx + 16, cy);
      ctx.rotate(-Math.PI / 2);
      ctx.drawImage(faceSprite, -fw / 2, -fh / 2, fw, fh);
      ctx.restore();
    }

    // X's marcando el "K.O." (pequeñas, encima de los ojos)
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.4;
    const eyeY = cy - 1;
    [cx + 12, cx + 18].forEach((ex) => {
      ctx.beginPath();
      ctx.moveTo(ex - 2, eyeY - 2);
      ctx.lineTo(ex + 2, eyeY + 2);
      ctx.moveTo(ex + 2, eyeY - 2);
      ctx.lineTo(ex - 2, eyeY + 2);
      ctx.stroke();
    });
  }

  function drawPopups() {
    popups.forEach((p) => {
      const sx = p.worldX - cameraX;
      ctx.save();
      ctx.globalAlpha = Math.min(1, p.t * 2);
      ctx.fillStyle = '#fff';
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(p.text, sx, p.y - (1 - p.t) * 14);
      ctx.restore();
    });
  }

  // -------------------- Bucle --------------------
  function tick(ts) {
    if (!running) return;
    if (!lastTime) lastTime = ts;
    const dt = Math.min(0.04, (ts - lastTime) / 1000);
    lastTime = ts;
    update(dt);
    draw();
    raf = requestAnimationFrame(tick);
  }

  // -------------------- Canvas sizing --------------------
  function resizeCanvas() {
    if (!canvas) return;
    const stage = document.getElementById('gameStage');
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    // Resolución interna ampliada por RENDER_SCALE para más nitidez.
    // El sistema lógico sigue siendo VWxVH (el ctx.scale lo aplica draw()).
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = VW * RENDER_SCALE * dpr;
    canvas.height = VH * RENDER_SCALE * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx._scaleFactor = RENDER_SCALE * dpr;
  }

  function checkOrientation() {
    const overlay = document.getElementById('rotateOverlay');
    if (!overlay) return;
    const isLandscape = window.innerWidth > window.innerHeight;
    // En desktop ancho, también lo dejamos visible si está horizontal
    overlay.classList.toggle('is-active', !isLandscape && window.innerWidth < 700);
  }

  // -------------------- API pública --------------------
  let inited = false;
  async function init() {
    if (inited) return;
    inited = true;
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    bindControls();
    window.addEventListener('resize', () => { resizeCanvas(); checkOrientation(); });
    window.addEventListener('orientationchange', () => { resizeCanvas(); checkOrientation(); });
    try {
      const [blasImg, buzonImg] = await Promise.all([
        loadImage('assets/blas-face.png'),
        loadImage('assets/buzon.png'),
      ]);
      faceSprite = buildFaceSprite(blasImg);
      buzonSprite = buildBuzonSprite(buzonImg);
    } catch (e) {
      console.warn('No se pudieron cargar los assets:', e);
    }
  }

  async function start() {
    await init();
    resizeCanvas();
    checkOrientation();
    reset();
    running = true;
    lastTime = 0;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
    // Limpiar clases UI por si quedó la de "is-charge"
    const stage = document.getElementById('gameStage');
    if (stage) stage.classList.remove('is-charge');
    hideChoiceButtons();
  }

  window.Level1 = { start, stop };
})();
