/* ============================================================
   main.js - máquina de estados de pantallas
   ============================================================ */
(function () {
  'use strict';

  const screens = document.querySelectorAll('.screen');
  let currentLevel = null; // 'level1' | 'level2'

  function showScreen(name) {
    screens.forEach((s) => {
      s.classList.toggle('is-active', s.dataset.screen === name);
    });

    // Arranca/para los motores de cada nivel según la pantalla activa
    if (name === 'level1') {
      currentLevel = 'level1';
      window.Level2 && window.Level2.stop();
      window.Level3 && window.Level3.stop();
      window.Level1 && window.Level1.start();
    } else if (name === 'level2') {
      currentLevel = 'level2';
      window.Level1 && window.Level1.stop();
      window.Level3 && window.Level3.stop();
      window.Level2 && window.Level2.start();
    } else if (name === 'level3') {
      currentLevel = 'level3';
      window.Level1 && window.Level1.stop();
      window.Level2 && window.Level2.stop();
      window.Level3 && window.Level3.start();
    } else {
      window.Level1 && window.Level1.stop();
      window.Level2 && window.Level2.stop();
      window.Level3 && window.Level3.stop();
    }

    // Mensaje contextual en la pantalla de Game Over
    if (name === 'gameover') {
      const msg = document.getElementById('gameoverMsg');
      if (msg) {
        if (currentLevel === 'level2') {
          msg.textContent = '¡Vengaaaa! Que no puedes tirarte toda la mañana almorzando.';
        } else if (currentLevel === 'level3') {
          msg.textContent = '¡Hoy ganan los campeones! Vuelve a intentarlo.';
        } else {
          msg.textContent = 'Se te han escapado los buzones… ¡vuelve a intentarlo!';
        }
      }
    }

    // Sonido de transición específico para algunas pantallas
    if (window.SFX) {
      if (name === 'level1-success' || name === 'level2-success' || name === 'level3-success') SFX.play('win');
      else if (name === 'gameover') SFX.play('gameover');
      else if (name === 'level1' || name === 'level2' || name === 'level3') SFX.play('start');
    }
  }

  // Cableado de botones por data-action
  document.addEventListener('click', (ev) => {
    const target = ev.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;

    // Click UI por defecto (se suprime para acciones específicas que ya
    // disparan otro sonido en showScreen, p. ej. ir a un nivel).
    if (window.SFX) SFX.play('click');

    switch (action) {
      case 'go-intro':
        showScreen('intro');
        break;
      case 'go-level1-warning':
        showScreen('rotate-warning');
        break;
      case 'go-level1':
        showScreen('level1');
        break;
      case 'go-level2':
        showScreen('level2');
        break;
      case 'go-level3':
        showScreen('level3');
        break;
      case 'retry-current':
        // Reintenta el último nivel jugado
        showScreen(currentLevel || 'level1');
        break;
      case 'go-welcome':
        showScreen('welcome');
        break;
    }
  });

  // API expuesta a los niveles
  window.Game = {
    onLevelComplete:    () => showScreen('level1-success'),
    onGameOver:         () => showScreen('gameover'),
    onLevel2Complete:   () => showScreen('level2-success'),
    onLevel2GameOver:   () => showScreen('gameover'),
    onLevel3Complete:   () => showScreen('level3-success'),
    onLevel3GameOver:   () => showScreen('gameover'),
  };

  // ----------------------------------------------------------
  // Modo debug oculto: pulsar la foto de Blas en la bienvenida
  // ----------------------------------------------------------
  window.debugMode = false;

  // Orden de pantallas accesibles desde la barra de debug (1..9)
  const DEBUG_SCREENS = [
    'welcome',
    'intro',
    'rotate-warning',
    'level1',
    'level1-success',
    'level2',
    'level2-success',
    'level3',
    'level3-success',
    'gameover',
  ];

  function toggleDebug() {
    window.debugMode = !window.debugMode;
    document.body.classList.toggle('debug-mode', window.debugMode);
  }

  // Clic en la foto de Blas de la pantalla de bienvenida
  const heroImg = document.querySelector('.hero__img');
  if (heroImg) {
    heroImg.addEventListener('click', (e) => {
      e.preventDefault();
      toggleDebug();
    });
  }

  // Botones de la barra: saltar de pantalla
  const debugBar = document.getElementById('debugBar');
  if (debugBar) {
    debugBar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-debug-screen]');
      if (!btn) return;
      e.preventDefault();
      showScreen(btn.dataset.debugScreen);
    });
  }

  // Atajos de teclado 1..9 cuando está activo
  window.addEventListener('keydown', (e) => {
    if (!window.debugMode) return;
    if (e.key >= '1' && e.key <= '9') {
      const idx = parseInt(e.key, 10) - 1;
      if (DEBUG_SCREENS[idx]) {
        e.preventDefault();
        showScreen(DEBUG_SCREENS[idx]);
      }
    }
  });

  // Botón global de silenciar
  const muteBtn = document.getElementById('muteBtn');
  if (muteBtn && window.SFX) {
    muteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.SFX.toggle();
    });
    window.SFX.syncUI();
  }
})();
