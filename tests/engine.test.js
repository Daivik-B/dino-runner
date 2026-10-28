// Tests for the game rules. Run with:  npm test   (or: node --test)
// They use Node's built-in test runner, so nothing needs to be installed.
const test = require("node:test");
const assert = require("node:assert/strict");
const { WORLD, createRng, Entity, Dino, Cactus, Bird, Spawner, Game } = require("../js/engine.js");

const DT = 1 / 120;
function run(thing, seconds, ...args) {
  for (let t = 0; t < seconds; t += DT) thing.update(DT, ...args);
}

test("rectangles that overlap collide; ones that don't, don't", () => {
  const a = new Entity(0, 0, 10, 10);
  assert.equal(a.intersects(new Entity(5, 5, 10, 10)), true);
  assert.equal(a.intersects(new Entity(10, 0, 10, 10)), false); // only touching edges
  assert.equal(a.intersects(new Entity(0, 20, 10, 10)), false);
});

test("the hit box is smaller than the drawing, so near-misses are fair", () => {
  const a = new Entity(0, 0, 20, 20);
  a.hitInset = 4;
  assert.equal(a.intersects(new Entity(17, 0, 10, 10)), false); // overlaps the drawing only
});

test("the dino jumps from the ground and lands again", () => {
  const dino = new Dino();
  const startY = dino.y;
  assert.equal(dino.jump(), true);
  run(dino, 0.2);
  assert.ok(dino.y < startY - 50, "it should be well above the ground");
  run(dino, 1);
  assert.equal(dino.y, startY);
  assert.equal(dino.onGround, true);
});

test("no double jumps", () => {
  const dino = new Dino();
  dino.jump();
  run(dino, 0.1);
  assert.equal(dino.jump(), false);
});

test("a short press gives a lower jump than a long press", () => {
  const high = new Dino();
  const low = new Dino();
  high.jump();
  low.jump();
  run(high, 0.05);
  run(low, 0.05);
  low.releaseJump();
  let highest = Infinity;
  let lowest = Infinity;
  for (let t = 0; t < 0.6; t += DT) {
    high.update(DT);
    low.update(DT);
    highest = Math.min(highest, high.y);
    lowest = Math.min(lowest, low.y);
  }
  assert.ok(highest < lowest, "full jump should go higher");
});

test("ducking makes the dino lower and longer, standing up restores it", () => {
  const dino = new Dino();
  dino.duck(true);
  assert.equal(dino.height, Dino.DUCK.height);
  assert.equal(dino.y + dino.height, WORLD.groundY);
  dino.duck(false);
  assert.equal(dino.height, Dino.STAND.height);
});

test("the max jump clears the tallest cactus", () => {
  const peak = (Dino.JUMP_SPEED ** 2) / (2 * WORLD.gravity);
  assert.ok(peak > new Cactus(0, 3).height + 20);
});

test("each bird height needs the right move", () => {
  const standing = new Dino();
  const ducking = new Dino();
  ducking.duck(true);
  const [low, middle, high] = [0, 1, 2].map((level) => new Bird(standing.x, level));
  assert.equal(standing.intersects(low), true); // low bird: must jump
  assert.equal(standing.intersects(middle), true); // middle bird: hits a standing dino...
  assert.equal(ducking.intersects(middle), false); // ...but not a ducking one
  assert.equal(standing.intersects(high), false); // high bird: run underneath
});

test("the random generator repeats with the same seed", () => {
  const a = createRng(42);
  const b = createRng(42);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
});

test("obstacle gaps grow with speed and stay within range", () => {
  assert.ok(Spawner.gapRange(800).min > Spawner.gapRange(400).min);
  const spawner = new Spawner(createRng(1));
  spawner.distanceToNext = 0;
  spawner.update(DT, 500, 0);
  const { min, max } = Spawner.gapRange(500);
  assert.ok(spawner.distanceToNext >= min && spawner.distanceToNext <= max + 70);
});

test("birds only appear after 300 points", () => {
  const spawner = new Spawner(createRng(7));
  for (let i = 0; i < 200; i++) assert.ok(spawner.choose(299) instanceof Cactus);
  const later = Array.from({ length: 200 }, () => spawner.choose(500));
  assert.ok(later.some((o) => o instanceof Bird));
});

test("the game starts on the first jump and the score grows over time", () => {
  const game = new Game({ seed: 3 });
  assert.equal(game.state, "ready");
  game.pressJump();
  assert.equal(game.state, "running");
  game.obstacles = [];
  game.spawner.distanceToNext = Infinity; // keep the track clear for this test
  for (let t = 0; t < 2; t += DT) game.step(DT);
  assert.ok(game.score > 50, `score was ${game.score}`);
});

test("speed increases but never passes the maximum", () => {
  const game = new Game({ seed: 3 });
  game.pressJump();
  game.spawner.distanceToNext = Infinity;
  for (let t = 0; t < 200; t += DT) game.step(DT);
  assert.equal(game.speed, Game.MAX_SPEED);
});

test("hitting a cactus ends the game and records the best score", () => {
  const game = new Game({ seed: 3, highScore: 0 });
  game.pressJump(); // start (and jump)
  for (let t = 0; t < 1; t += DT) game.step(DT); // land again
  game.distance = 1234;
  game.obstacles = [new Cactus(game.dino.x + 10, 1)];
  const events = game.step(DT);
  assert.equal(events.crashed, true);
  assert.equal(game.state, "over");
  assert.equal(game.highScore, 123);
});

test("after a crash, play again only works after a short delay", () => {
  const game = new Game({ seed: 3 });
  game.state = "over";
  game.timeSinceOver = 0;
  game.pressJump();
  assert.equal(game.state, "over"); // too soon: a held key shouldn't restart
  for (let t = 0; t < 0.5; t += DT) game.step(DT);
  game.pressJump();
  assert.equal(game.state, "running");
  assert.equal(game.score, 0); // fresh run
});

test("pause stops the world", () => {
  const game = new Game({ seed: 3 });
  game.pressJump();
  game.togglePause();
  const before = game.distance;
  for (let t = 0; t < 1; t += DT) game.step(DT);
  assert.equal(game.distance, before);
});
