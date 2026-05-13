/* ============================================================
   main.js - máquina de estados de pantallas
   ============================================================ */
(function () {
  'use strict';

  const screens = document.querySelectorAll('.screen');

  function showScreen(name) {
    screens.forEach((s) => {
      s.classList.toggle('is-active', s.dataset.screen === name);
    });
    // Avisar al nivel 1 que entra o sale
    if (name === 'level1') {
      window.Level1 && window.Level1.start();
    } else {
      window.Level1 && window.Level1.stop();
    }
  }

  // Cableado de botones por data-action
  document.addEventListener('click', (ev) => {
    const target = ev.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;

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
      case 'retry-level1':
        showScreen('level1');
        break;
      case 'go-next-placeholder':
        showScreen('soon');
        break;
      case 'go-welcome':
        showScreen('welcome');
        break;
    }
  });

  // Expone API mínima para que level1.js notifique fin del nivel
  window.Game = {
    onLevelComplete: () => showScreen('level1-success'),
    onGameOver: () => showScreen('gameover'),
  };
})();
