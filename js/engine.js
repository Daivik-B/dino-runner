/* Dino Runner: the game's rules and objects.
 *
 * There is no page (DOM) code in this file, only classes and maths, so the
 * same file runs in the browser AND in Node for the automated tests.
 *
 * Class map:
 *   Entity            anything with a position and a size; knows how to collide
 *     ├─ Dino         the player: jumps, ducks, falls with gravity
 *     ├─ Obstacle     anything that scrolls towards the player
 *     │    ├─ Cactus  ground obstacle: jump over it
 *     │    └─ Bird    flying obstacle at three heights: jump, duck or run under
 *     └─ Cloud        background decoration, moves slowly
 *   Spawner           decides when the next obstacle appears, and which one
 *   Game              holds everything together: state, score, speed, collisions
 */
(function (exports) {
  "use strict";

  // Sizes are in "world pixels". The canvas is scaled to fit the screen.
  const WORLD = { width: 800, height: 260, groundY: 222, gravity: 2600 };

  const INK = "#13213A";
  const PAPER = "#FBFAF6";
  const ACCENT = "#2448E0";
  const FAINT = "#C9CCD3";

  /* A small random number generator that can be "seeded": the same seed gives
   * the same sequence every time, which makes the tests repeatable. */
  function createRng(seed) {
    let a = seed >>> 0;
    return function rng() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Draws a picture described as rows of text: '#' = ink, 'o' = paper (eyes). */
  function drawSprite(ctx, rows, x, y, cell, color) {
    rows.forEach((row, r) => {
      [...row].forEach((ch, c) => {
        if (ch === ".") return;
        ctx.fillStyle = ch === "o" ? PAPER : color;
        ctx.fillRect(Math.round(x + c * cell), Math.round(y + r * cell), cell, cell);
      });
    });
  }

  // ---------------------------------------------------------------- Entity
  class Entity {
    constructor(x, y, width, height) {
      this.x = x;
      this.y = y;
      this.width = width;
      this.height = height;
      this.hitInset = 0; // shrink the collision box a little so near-misses feel fair
    }

    get hitbox() {
      const i = this.hitInset;
      return { x: this.x + i, y: this.y + i, width: this.width - 2 * i, height: this.height - 2 * i };
    }

    /* Axis-aligned bounding box (AABB) test: two rectangles overlap only if
     * they overlap on the x axis AND on the y axis. */
    intersects(other) {
      const a = this.hitbox;
      const b = other.hitbox;
      return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
    }

    update() {}
    draw() {}
  }

  // ---------------------------------------------------------------- Dino
  const DINO_STAND = [
    "......####.",
    ".....##o###",
    ".....######",
    ".....###...",
    "#...######.",
    "##.#######.",
    "#########..",
    ".########..",
    "..######...",
  ];
  const LEGS_A = ["..##..##...", "..#....#...", "..##...##.."];
  const LEGS_B = ["...##.##...", "...#..#....", "...##.##..."];
  const DINO_DUCK = [
    "#.......######",
    "##.....##o####",
    "###########...",
    ".##########...",
    "..########....",
  ];
  const DUCK_LEGS_A = ["..##..##......", "..#....#......"];
  const DUCK_LEGS_B = ["...##.##......", "...#..#......."];

  class Dino extends Entity {
    constructor() {
      super(60, WORLD.groundY - Dino.STAND.height, Dino.STAND.width, Dino.STAND.height);
      this.vy = 0; // vertical speed; negative means moving up
      this.ducking = false;
      this.runTime = 0; // drives the leg animation
      this.hitInset = 6;
    }

    get onGround() {
      return this.y + this.height >= WORLD.groundY;
    }

    /* Jumping only works from the ground: no double jumps. */
    jump() {
      if (!this.onGround || this.ducking) return false;
      this.vy = -Dino.JUMP_SPEED;
      return true;
    }

    /* Letting go of jump early cuts the jump short, for small hops. */
    releaseJump() {
      if (this.vy < -Dino.JUMP_SPEED / 2) this.vy = -Dino.JUMP_SPEED / 2;
    }

    /* On the ground, ducking makes the dino low and long.
     * In the air, holding duck makes it fall faster instead. */
    duck(wantsToDuck) {
      if (wantsToDuck && !this.onGround) {
        this.vy = Math.max(this.vy, Dino.FAST_FALL_SPEED);
        return;
      }
      if (wantsToDuck === this.ducking) return;
      this.ducking = wantsToDuck;
      const size = wantsToDuck ? Dino.DUCK : Dino.STAND;
      this.width = size.width;
      this.height = size.height;
      this.y = WORLD.groundY - this.height;
    }

    update(dt) {
      this.vy += WORLD.gravity * dt; // gravity changes speed...
      this.y += this.vy * dt; //        ...and speed changes position
      if (this.y + this.height >= WORLD.groundY) {
        this.y = WORLD.groundY - this.height; // landed
        this.vy = 0;
      }
      this.runTime += dt;
    }

    draw(ctx, crashed = false) {
      const frameA = Math.floor(this.runTime * 10) % 2 === 0 || !this.onGround || crashed;
      if (this.ducking) {
        drawSprite(ctx, DINO_DUCK.concat(frameA ? DUCK_LEGS_A : DUCK_LEGS_B), this.x, this.y, 4, INK);
      } else {
        drawSprite(ctx, DINO_STAND.concat(frameA ? LEGS_A : LEGS_B), this.x, this.y, 4, INK);
      }
      if (crashed) { // a cross for an eye when the game is over
        ctx.fillStyle = PAPER;
        ctx.fillRect(this.x + (this.ducking ? 36 : 28), this.y + 4, 4, 4);
        ctx.strokeStyle = ACCENT;
        ctx.lineWidth = 2;
        const ex = this.x + (this.ducking ? 36 : 28);
        const ey = this.y + 4;
        ctx.beginPath();
        ctx.moveTo(ex - 1, ey - 1); ctx.lineTo(ex + 5, ey + 5);
        ctx.moveTo(ex + 5, ey - 1); ctx.lineTo(ex - 1, ey + 5);
        ctx.stroke();
      }
    }
  }
  Dino.STAND = { width: 44, height: 48 };
  Dino.DUCK = { width: 56, height: 28 };
  Dino.JUMP_SPEED = 860; // with gravity 2600: about 140 px high, 0.66 s in the air
  Dino.FAST_FALL_SPEED = 900;

  // ---------------------------------------------------------------- Obstacles
  class Obstacle extends Entity {
    update(dt, speed) {
      this.x -= speed * dt;
    }

    get offScreen() {
      return this.x + this.width < 0;
    }
  }

  class Cactus extends Obstacle {
    /* size 1-3: how many stems stand side by side */
    constructor(x, size) {
      const width = 16 * size + 6 * (size - 1);
      const height = size === 1 ? 36 : 46;
      super(x, WORLD.groundY - height, width, height);
      this.size = size;
      this.hitInset = 3;
    }

    draw(ctx) {
      ctx.fillStyle = INK;
      for (let i = 0; i < this.size; i++) {
        const sx = this.x + i * 22;
        const top = this.y + (i % 2 === 1 ? 6 : 0);
        ctx.fillRect(sx + 5, top, 6, WORLD.groundY - top); // trunk
        ctx.fillRect(sx, top + 12, 3, 12); // left arm
        ctx.fillRect(sx, top + 22, 6, 3);
        ctx.fillRect(sx + 13, top + 8, 3, 12); // right arm
        ctx.fillRect(sx + 10, top + 18, 6, 3);
      }
    }
  }

  class Bird extends Obstacle {
    /* level 0: low (jump over), 1: middle (duck under), 2: high (run under) */
    constructor(x, level) {
      super(x, Bird.BOTTOMS[level] - Bird.SIZE.height, Bird.SIZE.width, Bird.SIZE.height);
      this.level = level;
      this.flapTime = 0;
      this.hitInset = 4;
    }

    update(dt, speed) {
      super.update(dt, speed + Bird.EXTRA_SPEED); // birds fly a little faster than the ground scrolls
      this.flapTime += dt;
    }

    draw(ctx) {
      const wingsUp = Math.floor(this.flapTime * 6) % 2 === 0;
      const { x, y } = this;
      ctx.fillStyle = INK;
      ctx.fillRect(x + 6, y + 12, 26, 7); // body
      ctx.fillRect(x, y + 14, 8, 3); // beak
      ctx.fillRect(x + 30, y + 10, 8, 4); // tail
      ctx.beginPath(); // wing
      if (wingsUp) {
        ctx.moveTo(x + 12, y + 12); ctx.lineTo(x + 20, y); ctx.lineTo(x + 26, y + 12);
      } else {
        ctx.moveTo(x + 12, y + 18); ctx.lineTo(x + 20, y + 30); ctx.lineTo(x + 26, y + 18);
      }
      ctx.fill();
      ctx.fillStyle = PAPER;
      ctx.fillRect(x + 9, y + 13, 2, 2); // eye
    }
  }
  Bird.SIZE = { width: 40, height: 28 };
  // Where the bird's bottom edge sits, measured against the dino's sizes:
  //   low:    below a standing dino's knees      -> must jump
  //   middle: between duck height and full height -> must duck
  //   high:   above a standing dino's head        -> just keep running
  Bird.BOTTOMS = [WORLD.groundY - 6, WORLD.groundY - 32, WORLD.groundY - 62];
  Bird.EXTRA_SPEED = 40;

  class Cloud extends Entity {
    constructor(x, y) {
      super(x, y, 60, 18);
    }

    update(dt, speed) {
      this.x -= speed * 0.15 * dt; // parallax: far things move slowly
      if (this.x + this.width < 0) this.x = WORLD.width + 20;
    }

    draw(ctx) {
      ctx.strokeStyle = FAINT;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y + this.height);
      ctx.lineTo(this.x + this.width, this.y + this.height);
      ctx.arc(this.x + 40, this.y + this.height, 14, 0, Math.PI, true);
      ctx.arc(this.x + 20, this.y + this.height, 10, 0, Math.PI, true);
      ctx.stroke();
    }
  }

  // ---------------------------------------------------------------- Spawner
  class Spawner {
    constructor(rng) {
      this.rng = rng;
      this.distanceToNext = 420; // a calm start
    }

    /* The faster the game, the further apart obstacles must be, so that a
     * jump (about 0.66 s in the air) can always clear them. */
    static gapRange(speed) {
      const min = speed * 0.75 + 140;
      return { min, max: min * 1.9 };
    }

    choose(score) {
      if (score >= Spawner.BIRDS_FROM_SCORE && this.rng() < 0.3) {
        return new Bird(WORLD.width + 10, Math.floor(this.rng() * 3));
      }
      const size = score < 100 ? 1 + Math.floor(this.rng() * 2) : 1 + Math.floor(this.rng() * 3);
      return new Cactus(WORLD.width + 10, size);
    }

    /* Returns a new obstacle when it is time for one, otherwise null. */
    update(dt, speed, score) {
      this.distanceToNext -= speed * dt;
      if (this.distanceToNext > 0) return null;
      const obstacle = this.choose(score);
      const { min, max } = Spawner.gapRange(speed);
      this.distanceToNext = min + this.rng() * (max - min) + obstacle.width;
      return obstacle;
    }
  }
  Spawner.BIRDS_FROM_SCORE = 300;

  // ---------------------------------------------------------------- Game
  class Game {
    constructor({ seed = Date.now(), highScore = 0 } = {}) {
      this.rng = createRng(seed);
      this.highScore = highScore;
      this.state = "ready"; // "ready" -> "running" <-> "paused"; "running" -> "over"
      this.reset();
    }

    reset() {
      this.dino = new Dino();
      this.obstacles = [];
      this.clouds = [new Cloud(150, 50), new Cloud(470, 80), new Cloud(700, 40)];
      this.spawner = new Spawner(this.rng);
      this.speed = Game.START_SPEED;
      this.distance = 0;
      this.timeSinceOver = 0;
    }

    get score() {
      return Math.floor(this.distance / 10);
    }

    /* One button does three jobs: start, jump, and play again. */
    pressJump() {
      if (this.state === "ready") {
        this.state = "running";
        this.dino.jump();
      } else if (this.state === "running") {
        this.dino.jump();
      } else if (this.state === "over" && this.timeSinceOver >= Game.RESTART_DELAY) {
        this.reset();
        this.state = "running";
      }
    }

    releaseJump() {
      this.dino.releaseJump();
    }

    togglePause() {
      if (this.state === "running") this.state = "paused";
      else if (this.state === "paused") this.state = "running";
    }

    /* Advance the world by dt seconds. Returns what happened, for the page to react to. */
    step(dt, input = { duck: false }) {
      const events = { crashed: false, milestone: false };
      if (this.state === "over") {
        this.timeSinceOver += dt;
        return events;
      }
      if (this.state !== "running") return events;

      const before = this.score;
      this.dino.duck(input.duck);
      this.dino.update(dt);
      this.speed = Math.min(Game.MAX_SPEED, this.speed + Game.ACCELERATION * dt);
      this.distance += this.speed * dt;

      this.obstacles.forEach((o) => o.update(dt, this.speed));
      this.obstacles = this.obstacles.filter((o) => !o.offScreen);
      const next = this.spawner.update(dt, this.speed, this.score);
      if (next) this.obstacles.push(next);
      this.clouds.forEach((c) => c.update(dt, this.speed));

      if (Math.floor(this.score / 100) > Math.floor(before / 100)) events.milestone = true;

      if (this.obstacles.some((o) => this.dino.intersects(o))) {
        this.state = "over";
        this.timeSinceOver = 0;
        this.highScore = Math.max(this.highScore, this.score);
        events.crashed = true;
      }
      return events;
    }

    /* uiScale enlarges the text on small screens, where the whole game is shrunk to fit. */
    draw(ctx, uiScale = 1) {
      ctx.fillStyle = PAPER;
      ctx.fillRect(0, 0, WORLD.width, WORLD.height);
      this.clouds.forEach((c) => c.draw(ctx));

      // Ground line with small stones that scroll at ground speed
      ctx.fillStyle = INK;
      ctx.fillRect(0, WORLD.groundY - 1, WORLD.width, 2);
      const offset = this.distance % 40;
      for (let gx = -offset; gx < WORLD.width; gx += 40) {
        ctx.fillRect(gx + 8, WORLD.groundY + 8, 6, 2);
        ctx.fillRect(gx + 27, WORLD.groundY + 15, 3, 2);
      }

      this.obstacles.forEach((o) => o.draw(ctx));
      this.dino.draw(ctx, this.state === "over");

      // Score, top right
      const size = (px) => Math.round(px * uiScale);
      ctx.textAlign = "right";
      ctx.textBaseline = "alphabetic";
      ctx.font = `600 ${size(16)}px ui-monospace, Menlo, Consolas, monospace`;
      ctx.fillStyle = INK;
      ctx.fillText(String(this.score).padStart(5, "0"), WORLD.width - 20, 14 + size(16));
      const scoreWidth = ctx.measureText("00000").width;
      ctx.fillStyle = "#5B6578";
      ctx.fillText(`BEST ${String(this.highScore).padStart(5, "0")}`, WORLD.width - 36 - scoreWidth, 14 + size(16));

      // Messages, on a paper-coloured card so clouds never run through the text
      const lines = {
        ready: [["Press Space or tap to start", INK, 600, 18]],
        paused: [["Paused. Press P to continue", INK, 600, 18]],
        over: [["Game over", ACCENT, 600, 18], ["Press Space or tap to play again", INK, 400, 15]],
      }[this.state];
      if (lines) {
        ctx.textAlign = "center";
        const lineHeight = size(26);
        const top = 112 - (lines.length * lineHeight) / 2;
        let widest = 0;
        lines.forEach(([text, , weight, px]) => {
          ctx.font = `${weight} ${size(px)}px system-ui, -apple-system, Segoe UI, sans-serif`;
          widest = Math.max(widest, ctx.measureText(text).width);
        });
        ctx.fillStyle = PAPER;
        ctx.fillRect(WORLD.width / 2 - widest / 2 - 16, top - 8, widest + 32, lines.length * lineHeight + 12);
        lines.forEach(([text, color, weight, px], i) => {
          ctx.font = `${weight} ${size(px)}px system-ui, -apple-system, Segoe UI, sans-serif`;
          ctx.fillStyle = color;
          ctx.fillText(text, WORLD.width / 2, top + (i + 0.75) * lineHeight);
        });
      }
    }
  }
  Game.START_SPEED = 380; // px per second
  Game.ACCELERATION = 8; // px per second, every second
  Game.MAX_SPEED = 900;
  Game.RESTART_DELAY = 0.4; // seconds, so a held key doesn't restart instantly

  Object.assign(exports, { WORLD, createRng, Entity, Dino, Obstacle, Cactus, Bird, Cloud, Spawner, Game });
})(typeof module !== "undefined" ? module.exports : (window.DinoEngine = {}));
