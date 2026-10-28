/* Dino Runner: connects the game to the page (canvas, keyboard, touch, loop). */
(function () {
  "use strict";
  const { WORLD, Game } = window.DinoEngine;

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const status = document.getElementById("status");
  const STEP = 1 / 120; // physics runs at a fixed 120 steps per second on every screen

  // ----- High score, remembered in this browser only
  function loadBest() {
    try { return Number(localStorage.getItem("dino-runner-best")) || 0; } catch { return 0; }
  }
  function saveBest(value) {
    try { localStorage.setItem("dino-runner-best", String(value)); } catch { /* storage unavailable */ }
  }

  const game = new Game({ highScore: loadBest() });
  const input = { duck: false };

  // ----- Sharp drawing on high-resolution screens
  function fitCanvas() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = WORLD.width * ratio;
    canvas.height = WORLD.height * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  fitCanvas();
  window.addEventListener("resize", fitCanvas);

  // ----- Keyboard
  const JUMP_KEYS = new Set(["Space", "ArrowUp", "KeyW"]);
  const DUCK_KEYS = new Set(["ArrowDown", "KeyS"]);
  window.addEventListener("keydown", (event) => {
    if (event.target.closest && event.target.closest("a, button")) return; // let links/buttons work normally
    if (JUMP_KEYS.has(event.code)) {
      event.preventDefault(); // stop Space from scrolling the page
      if (!event.repeat) game.pressJump();
    } else if (DUCK_KEYS.has(event.code)) {
      event.preventDefault();
      input.duck = true;
    } else if (event.code === "KeyP" || event.code === "Escape") {
      game.togglePause();
    }
  });
  window.addEventListener("keyup", (event) => {
    if (JUMP_KEYS.has(event.code)) game.releaseJump();
    if (DUCK_KEYS.has(event.code)) input.duck = false;
  });

  // ----- Touch / mouse: tap the game to jump, or use the buttons
  canvas.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    game.pressJump();
  });
  canvas.addEventListener("pointerup", () => game.releaseJump());

  const jumpButton = document.getElementById("jump");
  const duckButton = document.getElementById("duck");
  const pauseButton = document.getElementById("pause");
  jumpButton.addEventListener("pointerdown", (event) => { event.preventDefault(); game.pressJump(); });
  jumpButton.addEventListener("pointerup", () => game.releaseJump());
  jumpButton.addEventListener("click", (event) => { if (event.detail === 0) game.pressJump(); }); // keyboard "click"
  duckButton.addEventListener("pointerdown", (event) => { event.preventDefault(); input.duck = true; });
  ["pointerup", "pointerleave", "pointercancel"].forEach((name) =>
    duckButton.addEventListener(name, () => { input.duck = false; }));
  pauseButton.addEventListener("click", () => game.togglePause());

  // Pause automatically when the tab is hidden
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && game.state === "running") game.togglePause();
  });

  // ----- The loop: run as many fixed physics steps as real time requires, then draw once
  let last = performance.now();
  let leftover = 0;
  function frame(now) {
    leftover += Math.min(0.25, (now - last) / 1000); // cap, so a long pause doesn't fast-forward
    last = now;
    while (leftover >= STEP) {
      const events = game.step(STEP, input);
      if (events.crashed) {
        saveBest(game.highScore);
        status.textContent = `Game over. Score ${game.score}. Best ${game.highScore}.`;
      }
      leftover -= STEP;
    }
    pauseButton.textContent = game.state === "paused" ? "Resume" : "Pause";
    // On a narrow phone the 800px-wide world is shrunk to fit, so enlarge the text to stay readable.
    const uiScale = Math.min(2.2, Math.max(1, (WORLD.width / canvas.clientWidth) * 0.85));
    game.draw(ctx, uiScale);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
