import test from 'node:test';
import assert from 'node:assert/strict';
import { Runner, CONFIG, overlaps } from '../dist/core.js';

function frames(game, count, clear = false) {
  for (let i = 0; i < count; i++) {
    if (clear) game.obstacles = [];
    game.tick(1000 / 60);
  }
}
function obstacle(game, type = 'compact', x = 600) {
  return { type, x, y:game.ground - 25, width:32, height:25, unitWidth:32, count:1, gap:300, speedOffset:0, variant:0 };
}

test('ready screen does not advance; first action starts and jumps', () => {
  const g = new Runner();
  frames(g, 120);
  assert.equal(g.score, 0);
  assert.equal(g.state, 'ready');
  g.start();
  frames(g, 6);
  assert.ok(g.player.jumping);
  assert.ok(g.player.y < g.ground - 30);
  assert.ok(g.score > 0);
});

test('short press and long press produce different jump heights and no double jump', () => {
  const short = new Runner(), long = new Runner();
  short.start(); long.start(); short.releaseJump();
  let shortPeak = short.player.y, longPeak = long.player.y;
  assert.equal(short.jump(), false);
  for (let i = 0; i < 60; i++) {
    frames(short, 1); frames(long, 1);
    shortPeak = Math.min(shortPeak, short.player.y);
    longPeak = Math.min(longPeak, long.player.y);
  }
  assert.ok(longPeak < shortPeak - 15);
  assert.equal(long.player.jumping, false);
  assert.equal(long.player.y, long.ground - 30);
  assert.equal(long.jump(), true);
});

test('down accelerates landing and remains ducked until release', () => {
  const g = new Runner(); g.start(); frames(g, 8); g.setDown(true);
  frames(g, 20);
  assert.equal(g.player.jumping, false);
  assert.equal(g.player.ducking, true);
  assert.equal(g.jump(), false);
  g.setDown(false);
  assert.equal(g.player.ducking, false);
  assert.equal(g.jump(), true);
});

test('pausing freezes all simulation and resuming does not fast forward', () => {
  const g = new Runner(); g.start(); frames(g, 8); g.pause();
  const snapshot = [g.distance, g.player.y, g.elapsed];
  g.tick(10000);
  assert.deepEqual([g.distance, g.player.y, g.elapsed], snapshot);
  g.resume(); frames(g, 1);
  assert.ok(g.distance < snapshot[0] + 7);
});

test('60 Hz and 144 Hz advance the same simulation over equal elapsed time', () => {
  const a = new Runner(), b = new Runner(); a.start(); b.start();
  frames(a, 120);
  for (let i = 0; i < 288; i++) b.tick(1000 / 144);
  assert.equal(a.score, b.score);
  assert.equal(a.distance, b.distance);
  assert.equal(a.player.y, b.player.y);
});

test('three-second clear period, bounded speed, increasing score', () => {
  const g = new Runner(); g.start(); frames(g, 178);
  assert.equal(g.obstacles.length, 0);
  frames(g, 3);
  assert.ok(g.obstacles.length > 0);
  frames(g, 8000, true);
  assert.equal(g.speed, CONFIG.MAX_SPEED);
  assert.ok(g.score > 1000);
});

test('ground vehicle collision ends the run and records the best score', () => {
  const g = new Runner({ best:5 }); g.start(); frames(g, 60);
  g.obstacles = [obstacle(g, 'compact', g.player.x + 25)];
  frames(g, 1);
  assert.equal(g.state, 'crashed');
  assert.equal(g.best, g.score);
  assert.equal(g.newBest, true);
  const score = g.score;
  frames(g, 60);
  assert.equal(g.score, score);
  assert.ok(g.crashAge >= CONFIG.RESTART_DELAY);
  g.start();
  assert.equal(g.best, score);
  assert.equal(g.score, 0);
  assert.equal(g.obstacles.length, 0);
});

test('jump clears cars; low drone hits standing car but clears a ducked car', () => {
  const jumping = new Runner(); jumping.start(); frames(jumping, 8);
  jumping.obstacles = [obstacle(jumping, 'compact', jumping.player.x + 20)];
  frames(jumping, 1);
  assert.equal(jumping.state, 'running');
  for (const duck of [false, true]) {
    const g = new Runner(); g.start(); frames(g, 60); g.setDown(duck);
    g.obstacles = [{ ...obstacle(g), type:'drone', x:g.player.x + 18, y:g.ground - 33, height:17, width:42 }];
    frames(g, 1);
    assert.equal(g.state, duck ? 'running' : 'crashed');
  }
});

test('night begins at 700 points and expires after 12 seconds of active play', () => {
  const g = new Runner(); g.start(); g.distance = 700 / CONFIG.SCORE_FACTOR;
  frames(g, 1);
  assert.equal(g.nightTime, CONFIG.NIGHT_DURATION);
  frames(g, 721, true);
  assert.equal(g.nightTime, 0);
});

test('obstacles remain valid across desktop widths and fastest speed, without three repeating types', () => {
  let seed = 7;
  const random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
  for (const width of [600, 700, 900]) {
    const g = new Runner({ width, random });
    g.speed = 13;
    const types = [];
    for (let i = 0; i < 200; i++) {
      const o = g.spawn(); types.push(o.type);
      assert.ok(o.gap >= 120);
      assert.ok(o.count >= 1 && o.count <= 3);
      assert.ok(o.width <= 114);
      assert.ok(o.y > 0 && o.y + o.height <= g.ground);
      if (i >= 2) assert.ok(!(types[i] === types[i-1] && types[i] === types[i-2]));
    }
    assert.ok(types.includes('drone'));
  }
});

test('touching rectangle edges is not a collision', () => {
  assert.equal(overlaps({x:0,y:0,w:10,h:10}, {x:10,y:0,w:10,h:10}), false);
});

test('ramp launch does not score or spawn obstacles and can pause, resume and restart', () => {
  const events = [];
  const g = new Runner({ onEvent:event => events.push(event) });
  g.launch(); frames(g, 90);
  assert.equal(g.state, 'intro');
  assert.equal(g.distance, 0);
  assert.equal(g.obstacles.length, 0);
  const elapsed = g.introTime;
  g.pause(); frames(g, 120);
  assert.equal(g.introTime, elapsed);
  g.resume();
  assert.equal(g.state, 'intro');
  frames(g, 110);
  assert.equal(g.state, 'running');
  assert.equal(g.sceneOffset, 220);
  assert.equal(g.player.y + g.player.height, g.ground);
  assert.ok(events.includes('intro') && events.includes('start'));
  g.launch();
  assert.equal(g.introTime, 0);
  assert.equal(g.sceneOffset, 0);
});
