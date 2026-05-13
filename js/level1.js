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
  const RENDER_SCALE = 3;  // multiplicador interno del canvas (más nitidez)
  const SPRITE_SCALE = 4;  // los sprites se prerrenderizan a esta resolución para que no pixelen
  const GROUND_Y = 220;    // y del suelo
  const GRAVITY = 1500;    // px/s^2
  const JUMP_VY = -560;    // velocidad inicial salto
  const STOMP_VY = -380;   // rebote tras pisar buzón
  const PLAYER_SPEED = 90; // px/s (mundo se desplaza a esta velocidad)
  const PLAYER_X = 120;    // posición fija de Blas en pantalla
  const DURATION = 60;     // segundos del nivel
  const FINAL_TIME = 52;   // a partir de aquí aparece la zona del árbol

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
    houseDark: '#3a2418',
    roof:      '#7a3b1e',
    window:    '#9ed6ff',
    windowFrame:'#3a2418',
    door:      '#5a3416',
    skin:      '#f0c89a',
    skinDark:  '#c8916a',
    shirt:     '#3a6dd1',
    pants:     '#2b2b2b',
    leaves:    '#2f9d4a',
    leavesDark:'#1f7034',
    trunk:     '#7a4a1c',
    trunkDark: '#52310f',
    casablanca:'#f0d9b0',
    casablancaSign:'#aa1f1f',
    yellow:    '#ffd200',
    blue:      '#003399',
    envelope:  '#fffaf0',
    envelopeShadow: '#cfc6a8',
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
  let phase = 'run';     // 'run' | 'final' | 'win' | 'over'
  let invuln = 0;        // segundos restantes de invulnerabilidad

  const player = {
    x: PLAYER_X,         // x en pantalla (también es x absoluta porque cámara se desplaza por la escena, no por el jugador)
    y: GROUND_Y - 40,
    vy: 0,
    w: 26,
    h: 40,
    onGround: true,
    facing: 1,
  };

  let buzones = [];      // { worldX, y, w, h, vx, alive }
  let neighbors = [];    // { worldX, y, w, h, alive, anchorHouseIdx, sayTimer }
  let envelopes = [];    // { worldX, y, vx, w, h, alive }
  let houses = [];       // { worldX, w, h, type }
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
    // Pre-renderizamos a alta resolución para que se vea nítido cuando
    // se dibuje a tamaño lógico (~22px) en pantalla.
    const size = 22 * SPRITE_SCALE;
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const cx = c.getContext('2d');

    cx.imageSmoothingEnabled = true;
    cx.imageSmoothingQuality = 'high';
    cx.save();
    cx.beginPath();
    cx.arc(size/2, size/2, size/2 - 2, 0, Math.PI*2);
    cx.closePath();
    cx.clip();

    // Origen aproximado de la cara en la imagen (gorra+cara incluida)
    const sx = 250;
    const sy = 130;
    const sw = 600;
    const sh = 600;
    cx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
    cx.restore();

    // Borde
    cx.lineWidth = SPRITE_SCALE * 0.6;
    cx.strokeStyle = '#000';
    cx.beginPath();
    cx.arc(size/2, size/2, size/2 - 2, 0, Math.PI*2);
    cx.stroke();

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
  function seedWorld() {
    houses = [];
    neighbors = [];
    buzones = [];
    envelopes = [];
    popups = [];

    // Generar casas a lo largo del mundo
    let x = 200;
    const worldEnd = PLAYER_SPEED * FINAL_TIME + 600;
    const houseTypes = [
      { color: COLORS.house1, roof: COLORS.roof, w: 110, h: 110 },
      { color: COLORS.house2, roof: COLORS.roof, w: 130, h: 130 },
      { color: COLORS.house3, roof: '#5a3416', w: 100, h: 100 },
    ];
    let idx = 0;
    while (x < worldEnd) {
      const t = houseTypes[idx % houseTypes.length];
      houses.push({
        worldX: x,
        w: t.w,
        h: t.h,
        color: t.color,
        roof: t.roof,
        idx: idx,
      });
      // Vecino delante de la casa (no siempre)
      if (idx % 2 === 0) {
        neighbors.push({
          worldX: x + t.w / 2,
          y: GROUND_Y - 36,
          w: 18, h: 36,
          alive: true,
          sayTimer: 0,
        });
      }
      x += t.w + 60 + Math.floor(Math.random() * 40);
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

    // Zona final: árbol gigante junto al bar Casablanca
    const finalX = PLAYER_SPEED * FINAL_TIME + 380;
    finalTree = {
      worldX: finalX,
      baseY: GROUND_Y,
      trunkW: 24,
      trunkH: 110,
      canopyR: 46,
      platformY: GROUND_Y - 110, // copa del árbol
      platformW: 60,
    };
    casablanca = {
      worldX: finalX + 90,
      y: GROUND_Y - 130,
      w: 160, h: 130,
    };
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
      if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') doJump();
      if (e.key === 'x' || e.key === 'Control' || e.key === 'z') doShoot();
    });
  }

  function doJump() {
    if (!running || phase === 'win' || phase === 'over') return;
    if (player.onGround) {
      player.vy = JUMP_VY;
      player.onGround = false;
    }
  }

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
    player.x = PLAYER_X;
    player.y = GROUND_Y - player.h;
    player.vy = 0;
    player.onGround = true;
    pressed = { jump: false, shoot: false };
    lastShoot = 0;
    seedWorld();
    updateHUD();
  }

  function update(dt) {
    if (phase === 'win' || phase === 'over') return;

    // Avance del mundo (mientras no estamos en la zona final)
    if (phase === 'run') {
      cameraX += PLAYER_SPEED * dt;
      timeLeft -= dt;
      if (timeLeft <= 0) timeLeft = 0;
      if (timeLeft <= DURATION - FINAL_TIME) {
        // Acercándose a la zona final: ralentizar
      }
      // Cambiar a 'final' cuando vemos el árbol en pantalla
      if (finalTree && finalTree.worldX - cameraX < VW - 80) {
        phase = 'final';
        // Anuncio
        popups.push({ worldX: cameraX + VW / 2, y: 60, text: '¡SALTO FINAL!', t: 2.0 });
      }
    } else if (phase === 'final') {
      // Detener el scroll, dejar que el jugador pueda saltar al árbol
      // (nada que avanzar)
    }

    // Físicas del jugador
    player.vy += GRAVITY * dt;
    player.y += player.vy * dt;
    player.onGround = false;

    // Suelo
    if (player.y + player.h >= GROUND_Y) {
      player.y = GROUND_Y - player.h;
      player.vy = 0;
      player.onGround = true;
    }

    // Plataforma del árbol (solo en fase final)
    if (phase === 'final' && finalTree) {
      const treeScreenX = finalTree.worldX - cameraX;
      const px = player.x;
      const py = player.y;
      const pw = player.w;
      const ph = player.h;
      const platLeft = treeScreenX - finalTree.platformW / 2;
      const platRight = treeScreenX + finalTree.platformW / 2;
      const platTop = finalTree.platformY;
      // Colisión por arriba si cae sobre la copa
      if (
        py + ph >= platTop && py + ph - player.vy * dt <= platTop + 4 &&
        px + pw > platLeft && px < platRight &&
        player.vy >= 0
      ) {
        player.y = platTop - ph;
        player.vy = 0;
        player.onGround = true;
        // ¡Victoria!
        win();
      }
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

    // Colisiones
    handleCollisions();
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

    // Jugador
    drawPlayer();

    // Popups (puntuaciones flotantes y textos)
    drawPopups();

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
      if (sx + h.w < -10 || sx > VW + 10) return;
      const y = GROUND_Y - h.h;
      // Cuerpo
      ctx.fillStyle = h.color;
      ctx.fillRect(sx, y, h.w, h.h);
      // Tejado
      ctx.fillStyle = h.roof;
      ctx.beginPath();
      ctx.moveTo(sx - 6, y);
      ctx.lineTo(sx + h.w / 2, y - 28);
      ctx.lineTo(sx + h.w + 6, y);
      ctx.closePath();
      ctx.fill();
      // Puerta
      ctx.fillStyle = COLORS.door;
      const dw = 18, dh = 30;
      ctx.fillRect(sx + h.w / 2 - dw / 2, y + h.h - dh, dw, dh);
      ctx.fillStyle = COLORS.yellow;
      ctx.fillRect(sx + h.w / 2 + 5, y + h.h - dh / 2 - 1, 2, 2); // pomo
      // Ventanas
      ctx.fillStyle = COLORS.windowFrame;
      const wW = 18, wH = 16;
      const wYs = [y + 16];
      const wXs = [sx + 14, sx + h.w - 14 - wW];
      wXs.forEach((wx) => {
        wYs.forEach((wy) => {
          ctx.fillRect(wx, wy, wW, wH);
          ctx.fillStyle = COLORS.window;
          ctx.fillRect(wx + 2, wy + 2, wW - 4, wH - 4);
          ctx.fillStyle = COLORS.windowFrame;
          ctx.fillRect(wx + wW / 2 - 1, wy + 2, 2, wH - 4);
          ctx.fillRect(wx + 2, wy + wH / 2 - 1, wW - 4, 2);
        });
      });
      // Número de portal
      ctx.fillStyle = '#fff';
      ctx.font = '6px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(String((h.idx % 9) + 1), sx + h.w / 2, y + h.h - dh - 4);
    });
  }

  function drawCasablanca() {
    if (!casablanca) return;
    const sx = casablanca.worldX - cameraX;
    if (sx + casablanca.w < -10 || sx > VW + 10) return;
    const y = GROUND_Y - casablanca.h;
    // Cuerpo
    ctx.fillStyle = COLORS.casablanca;
    ctx.fillRect(sx, y, casablanca.w, casablanca.h);
    // Tejado plano
    ctx.fillStyle = '#8a6a4a';
    ctx.fillRect(sx - 4, y - 10, casablanca.w + 8, 10);
    // Letrero
    ctx.fillStyle = COLORS.casablancaSign;
    ctx.fillRect(sx + 10, y + 6, casablanca.w - 20, 22);
    ctx.fillStyle = '#fff';
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('CASABLANCA', sx + casablanca.w / 2, y + 22);
    // Puerta
    ctx.fillStyle = COLORS.door;
    const dW = 30, dH = 50;
    ctx.fillRect(sx + casablanca.w / 2 - dW / 2, y + casablanca.h - dH, dW, dH);
    ctx.fillStyle = COLORS.yellow;
    ctx.fillRect(sx + casablanca.w / 2 + 8, y + casablanca.h - dH / 2, 3, 3);
    // Ventanal
    ctx.fillStyle = COLORS.windowFrame;
    ctx.fillRect(sx + 14, y + 40, 30, 30);
    ctx.fillStyle = COLORS.window;
    ctx.fillRect(sx + 16, y + 42, 26, 26);
    ctx.fillStyle = COLORS.windowFrame;
    ctx.fillRect(sx + 14, y + 40 + 13, 30, 2);
    ctx.fillRect(sx + 14 + 14, y + 40, 2, 30);
    // Toldo
    ctx.fillStyle = '#aa1f1f';
    ctx.fillRect(sx + 8, y + 30, casablanca.w - 16, 6);
  }

  function drawTree() {
    if (!finalTree) return;
    const sx = finalTree.worldX - cameraX;
    if (sx < -120 || sx > VW + 120) return;

    const baseY = finalTree.baseY;
    // Tronco
    ctx.fillStyle = COLORS.trunk;
    ctx.fillRect(sx - finalTree.trunkW / 2, baseY - finalTree.trunkH, finalTree.trunkW, finalTree.trunkH);
    ctx.fillStyle = COLORS.trunkDark;
    ctx.fillRect(sx - finalTree.trunkW / 2, baseY - finalTree.trunkH, 4, finalTree.trunkH);

    // Copa (varios círculos)
    const cy = baseY - finalTree.trunkH - 10;
    ctx.fillStyle = COLORS.leavesDark;
    [[-30, 6], [30, 6], [0, -10], [-18, -22], [18, -22]].forEach(([dx, dy]) => {
      ctx.beginPath();
      ctx.arc(sx + dx, cy + dy, finalTree.canopyR - 16, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = COLORS.leaves;
    [[-22, 0], [22, 0], [0, -18], [-12, -10], [12, -10]].forEach(([dx, dy]) => {
      ctx.beginPath();
      ctx.arc(sx + dx, cy + dy, finalTree.canopyR - 18, 0, Math.PI * 2);
      ctx.fill();
    });

    // Indicador de plataforma (flecha intermitente)
    if (phase === 'final') {
      const blink = Math.floor(performance.now() / 250) % 2 === 0;
      if (blink) {
        ctx.fillStyle = '#fff';
        ctx.font = '10px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('▼', sx, finalTree.platformY - 8);
      }
    }
  }

  function drawNeighbors() {
    neighbors.forEach((n) => {
      if (!n.alive) return;
      const sx = n.worldX - cameraX;
      if (sx < -30 || sx > VW + 30) return;

      // Cuerpo
      ctx.fillStyle = COLORS.shirt;
      ctx.fillRect(sx - 7, n.y + 10, 14, 16);
      // Piernas
      ctx.fillStyle = COLORS.pants;
      ctx.fillRect(sx - 6, n.y + 26, 5, 10);
      ctx.fillRect(sx + 1, n.y + 26, 5, 10);
      // Brazos
      ctx.fillStyle = COLORS.shirt;
      ctx.fillRect(sx - 10, n.y + 12, 3, 10);
      ctx.fillRect(sx + 7, n.y + 12, 3, 10);
      // Cabeza
      ctx.fillStyle = COLORS.skin;
      ctx.fillRect(sx - 6, n.y, 12, 12);
      ctx.fillStyle = '#000';
      ctx.fillRect(sx - 3, n.y + 4, 2, 2);
      ctx.fillRect(sx + 1, n.y + 4, 2, 2);
      // Boca enfadada
      ctx.fillRect(sx - 3, n.y + 8, 6, 1);

      // Bocadillo
      const showBubble = Math.floor(n.sayTimer * 0.8) % 2 === 0;
      if (showBubble) {
        const txt = '¿Y mi paquete?';
        ctx.font = '6px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        const w = ctx.measureText(txt).width + 8;
        const bx = sx - w / 2;
        const by = n.y - 22;
        ctx.fillStyle = '#fff';
        ctx.fillRect(bx, by, w, 12);
        ctx.fillStyle = '#000';
        ctx.fillRect(bx, by, w, 1);
        ctx.fillRect(bx, by + 11, w, 1);
        ctx.fillRect(bx, by, 1, 12);
        ctx.fillRect(bx + w - 1, by, 1, 12);
        ctx.fillRect(sx - 2, by + 12, 4, 2);
        ctx.fillStyle = '#000';
        ctx.fillText(txt, sx, by + 8);
      }
    });
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
    if (blink) return;

    const x = player.x;
    const y = player.y;

    // Cuerpo (polo amarillo Correos)
    ctx.fillStyle = COLORS.yellow;
    ctx.fillRect(x + 3, y + 14, player.w - 6, 14);
    // Brazo
    ctx.fillRect(x, y + 16, 4, 8);
    ctx.fillRect(x + player.w - 4, y + 16, 4, 8);
    // Mano
    ctx.fillStyle = COLORS.skin;
    ctx.fillRect(x, y + 22, 4, 4);
    ctx.fillRect(x + player.w - 4, y + 22, 4, 4);
    // Pantalón azul
    ctx.fillStyle = COLORS.blue;
    ctx.fillRect(x + 4, y + 28, player.w - 8, 8);
    // Piernas
    const stepPhase = !player.onGround ? 0 :
      (Math.floor((cameraX / 6) % 4) >= 2 ? 1 : -1);
    ctx.fillStyle = COLORS.blue;
    ctx.fillRect(x + 5, y + 32, 6, 6);
    ctx.fillRect(x + player.w - 11, y + 32, 6, 6);
    ctx.fillStyle = '#000';
    ctx.fillRect(x + 5 + (stepPhase > 0 ? 1 : 0), y + 36, 6, 2);
    ctx.fillRect(x + player.w - 11 + (stepPhase < 0 ? 1 : 0), y + 36, 6, 2);

    // Logo de Correos en el polo
    ctx.fillStyle = COLORS.blue;
    ctx.fillRect(x + player.w / 2 - 2, y + 19, 4, 4);

    // Bolsa de carteo
    ctx.fillStyle = '#8a5a2a';
    ctx.fillRect(x + player.w - 4, y + 18, 8, 12);
    ctx.strokeStyle = '#5a3416';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + player.w - 2, y + 14);
    ctx.lineTo(x + player.w + 4, y + 18);
    ctx.stroke();

    // Cabeza (cara de Blas dentro de un círculo)
    if (faceSprite) {
      ctx.drawImage(faceSprite, x + 2, y - 4, 22, 22);
    } else {
      // Fallback
      ctx.fillStyle = COLORS.skin;
      ctx.beginPath();
      ctx.arc(x + player.w / 2, y + 8, 10, 0, Math.PI*2);
      ctx.fill();
    }

    // Gorra amarilla sobre la cara
    ctx.fillStyle = COLORS.yellow;
    ctx.fillRect(x + 1, y - 4, player.w - 2, 5);
    ctx.fillRect(x - 2, y, player.w + 4, 3); // visera
    ctx.fillStyle = COLORS.blue;
    ctx.fillRect(x + player.w / 2 - 3, y - 2, 6, 3); // logo cornete
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
        loadImage('assets/blas.png'),
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
  }

  window.Level1 = { start, stop };
})();
