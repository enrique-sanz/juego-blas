/* ============================================================
   level2.js - Reto 2: almuerzo en el bar Casablanca
   Pantalla vertical. Un camarero colombiano lanza desde arriba
   comida y bebida. Blas, abajo, debe atrapar carne y bebidas
   (positivo) y esquivar verduras (negativo). Llegar a 1000 puntos.
   ============================================================ */
(function () {
  'use strict';

  // -------------------- Configuración --------------------
  const VW = 360;             // ancho lógico (vertical)
  const VH = 640;             // alto lógico
  const RENDER_SCALE = 4;
  const GRAVITY = 600;        // px/s²
  const PLAYER_SPEED = 260;   // px/s
  const TIME_LIMIT = 60;      // segundos
  const SCORE_GOAL = 1000;

  // Catálogo de items lanzables
  // type: 'meat' (carne, suma) | 'drink' (bebida, suma) | 'veg' (verdura, resta)
  const ITEMS = [
    // CARNE +
    { emoji: '🍖', points: 100, type: 'meat' },
    { emoji: '🍗', points: 75,  type: 'meat' },
    { emoji: '🥩', points: 120, type: 'meat' },
    { emoji: '🍔', points: 110, type: 'meat' },
    { emoji: '🌭', points: 80,  type: 'meat' },
    { emoji: '🥓', points: 90,  type: 'meat' },
    { emoji: '🍤', points: 90,  type: 'meat' },
    // BEBIDA +
    { emoji: '🍺', points: 75,  type: 'drink' },
    { emoji: '🍷', points: 75,  type: 'drink' },
    { emoji: '🥃', points: 100, type: 'drink' },
    { emoji: '☕', points: 50,  type: 'drink' },
    // VERDURA -
    { emoji: '🥬', points: -75, type: 'veg' },
    { emoji: '🥦', points: -100, type: 'veg' },
    { emoji: '🥕', points: -50, type: 'veg' },
    { emoji: '🥒', points: -75, type: 'veg' },
    { emoji: '🌶️', points: -120, type: 'veg' },
  ];

  // -------------------- Estado --------------------
  let canvas, ctx;
  let raf = null;
  let lastTime = 0;
  let running = false;
  let inited = false;

  let score = 0;
  let timeLeft = TIME_LIMIT;
  let phase = 'play';   // 'play' | 'win' | 'over'

  const player = {
    x: VW / 2 - 30,
    y: VH - 110,
    w: 60,
    h: 90,
    vx: 0,
    dir: 0,            // -1, 0, 1
  };

  const waiter = {
    x: VW / 2,
    y: 90,
    armSwing: 0,       // 0..1 anim al lanzar
  };

  let items = [];        // { emoji, points, type, x, y, vx, vy, rot, rotV, alive, w, h }
  let popups = [];       // { x, y, text, color, t }
  let spawnTimer = 1.2;  // se decrementa hasta lanzar
  let nextSpawn = 1.2;
  let touchLeftDown = false;
  let touchRightDown = false;

  let faceSprite = null; // sprite cabeza Blas

  // -------------------- Helpers --------------------
  function rand(min, max) { return min + Math.random() * (max - min); }
  function randInt(min, max) { return Math.floor(rand(min, max + 1)); }

  function loadImage(src) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = src;
    });
  }

  function buildFaceSprite(img) {
    // Cabeza de Blas pre-renderizada (igual que en level1)
    const TARGET_W = 64 * 4;
    const TARGET_H = Math.round(TARGET_W * img.height / img.width);
    const c = document.createElement('canvas');
    c.width = TARGET_W; c.height = TARGET_H;
    const cx = c.getContext('2d');
    cx.imageSmoothingEnabled = true;
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(img, 0, 0, img.width, img.height, 0, 0, TARGET_W, TARGET_H);
    c._ratio = img.height / img.width;
    return c;
  }

  // -------------------- Controles --------------------
  function bindControls() {
    const tL = document.getElementById('touchLeft');
    const tR = document.getElementById('touchRight');

    const setPad = (which, val) => (e) => {
      e.preventDefault();
      if (which === 'L') touchLeftDown = val;
      else               touchRightDown = val;
    };

    ['touchstart','mousedown','pointerdown'].forEach((ev) => {
      tL.addEventListener(ev, setPad('L', true), { passive: false });
      tR.addEventListener(ev, setPad('R', true), { passive: false });
    });
    ['touchend','touchcancel','mouseup','mouseleave','pointerup','pointercancel'].forEach((ev) => {
      tL.addEventListener(ev, setPad('L', false), { passive: false });
      tR.addEventListener(ev, setPad('R', false), { passive: false });
    });

    // Teclado (para desktop)
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

  // -------------------- Lógica --------------------
  function reset() {
    score = 0;
    timeLeft = TIME_LIMIT;
    phase = 'play';
    player.x = VW / 2 - player.w / 2;
    player.vx = 0;
    player.dir = 0;
    items = [];
    popups = [];
    spawnTimer = 0.8;
    nextSpawn = 1.0;
    waiter.armSwing = 0;
    touchLeftDown = false;
    touchRightDown = false;
    updateHUD();
  }

  function spawnItem() {
    // Probabilidades: 50% carne, 25% bebida, 25% verdura
    const r = Math.random();
    let pool;
    if (r < 0.5)       pool = ITEMS.filter((i) => i.type === 'meat');
    else if (r < 0.75) pool = ITEMS.filter((i) => i.type === 'drink');
    else               pool = ITEMS.filter((i) => i.type === 'veg');
    const proto = pool[randInt(0, pool.length - 1)];

    // Velocidades iniciales: pequeño impulso horizontal para variar
    const vx = rand(-110, 110);
    const vy = rand(20, 80);

    items.push({
      emoji: proto.emoji,
      points: proto.points,
      type: proto.type,
      x: waiter.x + rand(-10, 10),
      y: waiter.y + 30,
      vx, vy,
      rot: 0,
      rotV: rand(-3, 3),
      w: 44, h: 44,
      alive: true,
    });
    waiter.armSwing = 1;
  }

  function update(dt) {
    if (phase !== 'play') return;

    // En modo debug el tiempo se congela (vidas/tiempo infinitos)
    if (!window.debugMode) {
      timeLeft -= dt;
      if (timeLeft <= 0) {
        timeLeft = 0;
        if (score >= SCORE_GOAL) {
          winLevel();
        } else {
          loseLevel();
        }
        return;
      }
    }

    // Spawning. La cadencia se acelera con el tiempo.
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnItem();
      const elapsed = TIME_LIMIT - timeLeft;
      // Cadencia: empieza en 1.0s, baja hasta ~0.45s al final
      const next = Math.max(0.45, 1.0 - elapsed * 0.012);
      spawnTimer = next + rand(-0.1, 0.15);
    }

    // Animación del brazo del camarero
    waiter.armSwing = Math.max(0, waiter.armSwing - dt * 3);

    // Movimiento del jugador
    let targetDir = 0;
    if (touchLeftDown && !touchRightDown) targetDir = -1;
    else if (touchRightDown && !touchLeftDown) targetDir = 1;
    player.dir = targetDir;
    player.x += targetDir * PLAYER_SPEED * dt;
    if (player.x < 4) player.x = 4;
    if (player.x + player.w > VW - 4) player.x = VW - 4 - player.w;

    // Físicas y limpieza de items
    items.forEach((it) => {
      if (!it.alive) return;
      it.vy += GRAVITY * dt;
      it.x += it.vx * dt;
      it.y += it.vy * dt;
      it.rot += it.rotV * dt;
      // Rebote suave en paredes laterales
      if (it.x < 4 && it.vx < 0) { it.x = 4; it.vx = -it.vx * 0.6; }
      if (it.x + it.w > VW - 4 && it.vx > 0) { it.x = VW - 4 - it.w; it.vx = -it.vx * 0.6; }
    });

    // Colisiones contra Blas (rectángulo "boca")
    const mouth = {
      x: player.x + 8,
      y: player.y + 14,
      w: player.w - 16,
      h: player.h - 24,
    };
    items.forEach((it) => {
      if (!it.alive) return;
      const ix = it.x, iy = it.y, iw = it.w, ih = it.h;
      if (ix < mouth.x + mouth.w && ix + iw > mouth.x &&
          iy < mouth.y + mouth.h && iy + ih > mouth.y) {
        // ¿Lo come?
        if (it.type === 'veg') {
          // Le entra una verdura sin querer: resta
          score += it.points; // negativo
          popups.push({
            x: it.x + iw / 2, y: it.y, text: '¡PUAJ! ' + it.points,
            color: '#ff6b6b', t: 1.0,
          });
        } else {
          score += it.points;
          popups.push({
            x: it.x + iw / 2, y: it.y, text: '+' + it.points,
            color: '#7eff7e', t: 1.0,
          });
        }
        it.alive = false;
        updateHUD();
        if (score >= SCORE_GOAL) winLevel();
      }
    });

    // Items que tocan el suelo: se rompen sin más
    items.forEach((it) => {
      if (!it.alive) return;
      if (it.y + it.h >= VH - 4) {
        it.alive = false;
        // Si era bueno y se ha perdido, una pequeña penalización suave
        if (it.type !== 'veg') {
          popups.push({
            x: it.x + it.w / 2, y: VH - 30,
            text: 'perdido',
            color: '#cccccc', t: 0.8,
          });
        }
      }
    });

    items = items.filter((it) => it.alive);

    popups.forEach((p) => { p.t -= dt; });
    popups = popups.filter((p) => p.t > 0);
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

  function updateHUD() {
    const s = document.getElementById('hud2Score');
    const t = document.getElementById('hud2Time');
    if (s) s.textContent = score;
    if (t) t.textContent = Math.max(0, Math.ceil(timeLeft));
  }

  // -------------------- Render --------------------
  function draw() {
    const sf = ctx._scaleFactor || RENDER_SCALE;
    ctx.setTransform(sf, 0, 0, sf, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    drawBackground();
    drawWaiter();
    drawItems();
    drawPlayer();
    drawPopups();
    drawProgress();
  }

  function drawBackground() {
    // Paredes del bar: marrón cálido con un panel de madera
    const grad = ctx.createLinearGradient(0, 0, 0, VH);
    grad.addColorStop(0, '#5a2f10');
    grad.addColorStop(0.6, '#6e3a18');
    grad.addColorStop(1, '#3a1c08');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VW, VH);

    // Barra del camarero (cinturón horizontal)
    ctx.fillStyle = '#3a1c08';
    ctx.fillRect(0, 130, VW, 14);
    ctx.fillStyle = '#7a4a1c';
    ctx.fillRect(0, 128, VW, 4);
    // Tablones verticales sobre la barra
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let x = 16; x < VW; x += 40) {
      ctx.fillRect(x, 0, 1, 130);
    }

    // Cartel "CASABLANCA" en una banderola arriba
    ctx.fillStyle = '#aa1f1f';
    ctx.fillRect(50, 12, VW - 100, 26);
    ctx.strokeStyle = '#5a0a0a';
    ctx.lineWidth = 2;
    ctx.strokeRect(50, 12, VW - 100, 26);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('CASABLANCA', VW / 2, 25);

    // Suelo: línea inferior
    ctx.fillStyle = '#2c1408';
    ctx.fillRect(0, VH - 8, VW, 8);

    // Mesa (rectángulo en el que se apoya Blas)
    ctx.fillStyle = '#8a5a2a';
    ctx.fillRect(player.x - 24, player.y + player.h - 4, player.w + 48, 16);
    ctx.fillStyle = '#5a3416';
    ctx.fillRect(player.x - 24, player.y + player.h + 10, player.w + 48, 2);
  }

  function drawWaiter() {
    const x = waiter.x;
    const y = waiter.y;

    // Cuerpo (camisa colombiana con tres colores: amarillo, azul, rojo en bandas)
    ctx.fillStyle = '#fcd116'; // amarillo
    ctx.fillRect(x - 22, y - 4, 44, 30);
    ctx.fillStyle = '#003893'; // azul
    ctx.fillRect(x - 22, y + 26, 44, 8);
    ctx.fillStyle = '#ce1126'; // rojo
    ctx.fillRect(x - 22, y + 34, 44, 8);

    // Hombros / cuello sombreado
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(x - 22, y - 4, 44, 3);

    // Cabeza
    ctx.fillStyle = '#caa07a'; // piel morena
    ctx.beginPath();
    ctx.ellipse(x, y - 18, 13, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    // Sombra lateral
    ctx.fillStyle = '#9a7050';
    ctx.beginPath();
    ctx.ellipse(x + 5, y - 16, 5, 11, 0, 0, Math.PI * 2);
    ctx.fill();

    // Pelo oscuro
    ctx.fillStyle = '#2a1a10';
    ctx.fillRect(x - 12, y - 28, 24, 6);
    ctx.fillRect(x - 14, y - 26, 4, 8);
    ctx.fillRect(x + 10, y - 26, 4, 8);

    // Sombrero panamá (paja clara con banda negra)
    ctx.fillStyle = '#f0d9a8';
    // Copa
    ctx.beginPath();
    ctx.ellipse(x, y - 30, 14, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    // Ala (más ancha)
    ctx.fillStyle = '#e6c98c';
    ctx.beginPath();
    ctx.ellipse(x, y - 25, 22, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    // Banda negra
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(x - 13, y - 29, 26, 3);

    // Ojos
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - 5, y - 19, 3, 3);
    ctx.fillRect(x + 2, y - 19, 3, 3);
    ctx.fillStyle = '#000';
    ctx.fillRect(x - 4, y - 19, 2, 2);
    ctx.fillRect(x + 3, y - 19, 2, 2);
    // Cejas
    ctx.fillRect(x - 6, y - 21, 4, 1);
    ctx.fillRect(x + 2, y - 21, 4, 1);

    // Bigote negro grande (estilo "señor colombiano")
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.ellipse(x, y - 12, 9, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x - 9, y - 13, 18, 2);

    // Sonrisa bajo el bigote
    ctx.strokeStyle = '#5a2a2a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y - 8, 4, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();

    // Brazo derecho (lanzando): se mueve según armSwing
    const swing = waiter.armSwing;
    const armAngle = -0.4 + swing * 1.6;
    ctx.save();
    ctx.translate(x + 18, y + 6);
    ctx.rotate(armAngle);
    ctx.fillStyle = '#fcd116';
    ctx.fillRect(0, -3, 20, 6);
    ctx.fillStyle = '#caa07a';
    ctx.fillRect(20, -3, 5, 6);
    ctx.restore();

    // Brazo izquierdo apoyado
    ctx.fillStyle = '#fcd116';
    ctx.fillRect(x - 32, y + 4, 12, 6);
    ctx.fillStyle = '#caa07a';
    ctx.fillRect(x - 36, y + 4, 5, 6);

    // Bandeja en mano izquierda
    ctx.fillStyle = '#a0a0a0';
    ctx.beginPath();
    ctx.ellipse(x - 40, y + 6, 12, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawItems() {
    items.forEach((it) => {
      if (!it.alive) return;
      ctx.save();
      ctx.translate(it.x + it.w / 2, it.y + it.h / 2);
      ctx.rotate(it.rot);
      // Sombra circular suave detrás del emoji
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.arc(2, 4, it.w * 0.45, 0, Math.PI * 2);
      ctx.fill();
      // Emoji
      ctx.font = '34px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(it.emoji, 0, 0);
      ctx.restore();
    });
  }

  function drawPlayer() {
    const px = player.x;
    const py = player.y;
    const pw = player.w;
    const ph = player.h;

    // Sombra
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(px + pw / 2, py + ph - 2, pw * 0.45, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Cuerpo: polo amarillo Correos
    ctx.fillStyle = '#c79c00';
    ctx.fillRect(px + 6, py + 30, pw - 12, ph - 40);
    ctx.fillStyle = '#ffd200';
    ctx.fillRect(px + 8, py + 30, pw - 16, ph - 44);
    // Cuello sombra
    ctx.fillStyle = '#9a7050';
    ctx.fillRect(px + pw / 2 - 4, py + 26, 8, 6);
    // Brazos
    const armOffset = player.dir * 3;
    ctx.fillStyle = '#ffd200';
    ctx.fillRect(px + 2, py + 36 + armOffset, 8, 22);
    ctx.fillRect(px + pw - 10, py + 36 - armOffset, 8, 22);
    // Manos
    ctx.fillStyle = '#f0c89a';
    ctx.fillRect(px + 2, py + 56 + armOffset, 8, 6);
    ctx.fillRect(px + pw - 10, py + 56 - armOffset, 8, 6);
    // Logo cornete
    ctx.fillStyle = '#003399';
    ctx.fillRect(px + pw / 2 - 5, py + 42, 10, 8);
    ctx.fillStyle = '#ffd200';
    ctx.fillRect(px + pw / 2 - 3, py + 44, 6, 1);

    // Cabeza (sprite con la cara) — un poco más grande para que se note
    if (faceSprite) {
      const fw = 56;
      const fh = fw * (faceSprite._ratio || 1.0);
      const fx = px + pw / 2 - fw / 2;
      const fy = py + 28 - fh;
      ctx.drawImage(faceSprite, fx, fy, fw, fh);
    }
  }

  function drawPopups() {
    popups.forEach((p) => {
      ctx.save();
      const a = Math.min(1, p.t * 2);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.font = 'bold 14px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const offset = (1 - p.t) * 20;
      ctx.fillText(p.text, p.x, p.y - offset);
      ctx.restore();
    });
  }

  function drawProgress() {
    // Barra de progreso en el lateral derecho para visualizar puntos/meta
    const W = 8, H = VH - 200;
    const x = VW - W - 8;
    const y = 100;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x - 2, y - 2, W + 4, H + 4);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(x, y, W, H);
    // Marca meta
    const frac = Math.max(0, Math.min(1, score / SCORE_GOAL));
    const fillH = H * frac;
    const grad = ctx.createLinearGradient(0, y + H, 0, y);
    grad.addColorStop(0, '#3a8a3a');
    grad.addColorStop(0.6, '#ffd200');
    grad.addColorStop(1, '#ff8a3a');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y + H - fillH, W, fillH);
    // Líneas cada 250 pts
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const yy = y + H - (i / 4) * H;
      ctx.beginPath();
      ctx.moveTo(x, yy);
      ctx.lineTo(x + W, yy);
      ctx.stroke();
    }
  }

  // -------------------- Bucle --------------------
  function tick(ts) {
    if (!running) return;
    if (!lastTime) lastTime = ts;
    const dt = Math.min(0.05, (ts - lastTime) / 1000);
    lastTime = ts;
    update(dt);
    draw();
    raf = requestAnimationFrame(tick);
  }

  // -------------------- Canvas sizing --------------------
  function resizeCanvas() {
    if (!canvas) return;
    const stage = document.getElementById('gameStage2');
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = VW * RENDER_SCALE * dpr;
    canvas.height = VH * RENDER_SCALE * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx._scaleFactor = RENDER_SCALE * dpr;
  }

  function checkOrientation() {
    const overlay = document.getElementById('rotateOverlay2');
    if (!overlay) return;
    const isPortrait = window.innerHeight >= window.innerWidth;
    const isSmallScreen = window.innerWidth < 700;
    // En móviles pequeños en horizontal, pedir vertical
    overlay.classList.toggle('is-active', !isPortrait && isSmallScreen);
  }

  // -------------------- API pública --------------------
  async function init() {
    if (inited) return;
    inited = true;
    canvas = document.getElementById('gameCanvas2');
    ctx = canvas.getContext('2d');
    bindControls();
    window.addEventListener('resize', () => { resizeCanvas(); checkOrientation(); });
    window.addEventListener('orientationchange', () => { resizeCanvas(); checkOrientation(); });
    try {
      const img = await loadImage('assets/blas-face.png');
      faceSprite = buildFaceSprite(img);
    } catch (e) {
      console.warn('No se pudo cargar blas-face.png en level2:', e);
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

  window.Level2 = { start, stop };
})();
