// Jump physics, acceleration, distance scale and obstacle gap calculation adapted
// from Chromium's T-Rex runner (2014 The Chromium Authors), via wayou/t-rex-runner.
// BSD-3-Clause. See LICENSE-chromium.txt and LICENSE-t-rex-runner.txt.

export const CONFIG = Object.freeze({
  FPS: 60, SPEED: 6, ACCELERATION: .001, MAX_SPEED: 13,
  GRAVITY: .6, JUMP_VELOCITY: -10, DROP_VELOCITY: -5,
  MIN_JUMP_HEIGHT: 30, MAX_JUMP_HEIGHT: 63, SPEED_DROP: 3,
  CLEAR_TIME: 3000, SCORE_FACTOR: .025, INVERT_DISTANCE: 700,
  NIGHT_DURATION: 12000, RESTART_DELAY: 750, INTRO_DURATION: 3200,
});

const TYPES = {
  compact: { width: 32, height: 25, minGap: 120, minSpeed: 0, multipleSpeed: 7 },
  suv: { width: 38, height: 34, minGap: 120, minSpeed: 0, multipleSpeed: 8 },
  drone: { width: 42, height: 17, minGap: 150, minSpeed: 8.5, multipleSpeed: Infinity },
};

export function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export class Runner {
  constructor({ width = 700, ground = 198, random = Math.random, best = 0, onEvent = () => {} } = {}) {
    Object.assign(this, { width, ground, random, best, onEvent });
    this.reset();
    this.state = 'ready';
  }

  reset() {
    this.state = 'running';
    this.speed = CONFIG.SPEED;
    this.distance = 0;
    this.score = 0;
    this.elapsed = 0;
    this.accumulator = 0;
    this.obstacles = [];
    this.obstacleHistory = [];
    this.nightTime = 0;
    this.nextNight = CONFIG.INVERT_DISTANCE;
    this.nextMilestone = 100;
    this.crashAge = 0;
    this.lastScore = 0;
    this.newBest = false;
    this.jumpHeld = false;
    this.downHeld = false;
    this.introTime = 0;
    this.sceneOffset = 0;
    this.pausedFrom = 'running';
    this.player = { x: 50, y: this.ground - 30, width: 88, height: 30, velocity: 0, jumping: false, ducking: false, speedDrop: false, reachedMin: false };
  }

  launch() {
    this.reset();
    this.state = 'intro';
    this.onEvent('intro');
  }

  start() {
    this.reset();
    this.onEvent('start');
    this.jump();
  }

  jump() {
    if (this.state !== 'running' || this.player.jumping || this.player.ducking) return false;
    const p = this.player;
    p.velocity = CONFIG.JUMP_VELOCITY - this.speed / 10;
    p.jumping = true;
    p.reachedMin = false;
    p.speedDrop = false;
    this.jumpHeld = true;
    this.onEvent('jump');
    return true;
  }

  releaseJump() { this.jumpHeld = false; }

  setDown(pressed) {
    this.downHeld = pressed;
    const p = this.player;
    p.ducking = pressed && !p.jumping;
    if (pressed && p.jumping && !p.speedDrop) {
      p.speedDrop = true;
      p.velocity = 1;
    }
  }

  pause() {
    if (this.state !== 'running' && this.state !== 'intro') return;
    this.pausedFrom = this.state;
    this.state = 'paused';
    this.jumpHeld = false;
    this.setDown(false);
    this.accumulator = 0;
    this.onEvent('pause');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = this.pausedFrom;
    this.accumulator = 0;
    this.onEvent('resume');
  }

  tick(delta) {
    if (this.state === 'crashed') { this.crashAge += delta; return; }
    if (this.state === 'intro') {
      this.introTime = Math.min(CONFIG.INTRO_DURATION, this.introTime + Math.min(Math.max(delta, 0), 100));
      if (this.introTime >= CONFIG.INTRO_DURATION) {
        this.state = 'running';
        this.sceneOffset = 220;
        this.onEvent('start');
        this.onEvent('land');
      }
      return;
    }
    if (this.state !== 'running') return;
    // Fixed 60 Hz simulation: identical difficulty on 60/120/144 Hz displays.
    this.accumulator += Math.min(Math.max(delta, 0), 100);
    const step = 1000 / CONFIG.FPS;
    while (this.accumulator + 1e-8 >= step && this.state === 'running') {
      this.accumulator -= step;
      this.step();
    }
  }

  step() {
    this.elapsed += 1000 / CONFIG.FPS;
    const p = this.player;
    const restY = this.ground - p.height;
    if (p.jumping) {
      p.y += Math.round(p.velocity * (p.speedDrop ? CONFIG.SPEED_DROP : 1));
      p.velocity += CONFIG.GRAVITY;
      if (p.y < restY - CONFIG.MIN_JUMP_HEIGHT || p.speedDrop) p.reachedMin = true;
      if ((p.reachedMin && !this.jumpHeld) || p.y < restY - CONFIG.MAX_JUMP_HEIGHT || p.speedDrop) {
        if (p.velocity < CONFIG.DROP_VELOCITY) p.velocity = CONFIG.DROP_VELOCITY;
      }
      if (p.y >= restY) {
        p.y = restY;
        p.velocity = 0;
        p.jumping = false;
        p.speedDrop = false;
        p.ducking = this.downHeld;
        this.onEvent('land');
      }
    }

    for (const obstacle of this.obstacles) obstacle.x -= this.speed + obstacle.speedOffset;
    this.obstacles = this.obstacles.filter(o => o.x + o.width > -20);
    if (this.elapsed >= CONFIG.CLEAR_TIME) {
      const last = this.obstacles.at(-1);
      if (!last || last.x + last.width + last.gap < this.width) this.spawn();
    }

    const playerBoxes = this.playerBoxes();
    for (const obstacle of this.obstacles) {
      if (obstacle.x > p.x + p.width + 5) break;
      if (this.obstacleBoxes(obstacle).some(b => playerBoxes.some(a => overlaps(a, b)))) {
        this.crash();
        return;
      }
    }

    this.distance += this.speed;
    this.speed = Math.min(CONFIG.MAX_SPEED, this.speed + CONFIG.ACCELERATION);
    this.score = Math.round(this.distance * CONFIG.SCORE_FACTOR);
    if (this.score >= this.nextMilestone) {
      this.nextMilestone += 100;
      this.onEvent('milestone');
    }
    if (this.nightTime > 0) this.nightTime = Math.max(0, this.nightTime - 1000 / CONFIG.FPS);
    if (this.score >= this.nextNight) {
      this.nightTime = CONFIG.NIGHT_DURATION;
      this.nextNight += CONFIG.INVERT_DISTANCE;
      this.onEvent('night');
    }
  }

  spawn() {
    let allowed = Object.keys(TYPES).filter(key => this.speed >= TYPES[key].minSpeed);
    if (this.obstacleHistory.length >= 2 && this.obstacleHistory.at(-1) === this.obstacleHistory.at(-2)) {
      allowed = allowed.filter(key => key !== this.obstacleHistory.at(-1));
    }
    const type = allowed[this.integer(0, allowed.length - 1)];
    const config = TYPES[type];
    const count = this.speed >= config.multipleSpeed ? this.integer(1, 3) : 1;
    const width = config.width * count;
    const minGap = Math.round(width * this.speed + config.minGap * .6);
    const altitude = type === 'drone' ? [16, 54, 88][this.integer(0, 2)] : 0;
    const obstacle = {
      type, count, width, height: config.height, unitWidth: config.width,
      x: this.width + 16, y: this.ground - config.height - altitude,
      gap: this.integer(minGap, Math.round(minGap * 1.5)),
      speedOffset: type === 'drone' ? (this.random() > .5 ? .8 : -.8) : 0,
      variant: this.integer(0, 2),
    };
    this.obstacleHistory.push(type);
    if (this.obstacleHistory.length > 3) this.obstacleHistory.shift();
    this.obstacles.push(obstacle);
    return obstacle;
  }

  integer(min, max) { return Math.floor(this.random() * (max - min + 1)) + min; }

  playerBoxes() {
    const p = this.player;
    if (p.ducking) return [{ x: p.x + 3, y: this.ground - 11, w: 82, h: 9 }];
    return [
      { x: p.x + 27, y: p.y + 2, w: 29, h: 10 },
      { x: p.x + 3, y: p.y + 12, w: 80, h: 11 },
      { x: p.x + 12, y: p.y + 23, w: 12, h: 6 },
      { x: p.x + 67, y: p.y + 23, w: 12, h: 6 },
    ];
  }

  obstacleBoxes(o) {
    if (o.type === 'drone') return [{ x: o.x + 2, y: o.y + 4, w: 38, h: 5 }, { x: o.x + 14, y: o.y + 6, w: 15, h: 10 }];
    const boxes = [];
    for (let i = 0; i < o.count; i++) {
      const x = o.x + i * o.unitWidth;
      boxes.push({ x: x + 8, y: o.y + 2, w: o.unitWidth - 17, h: o.height - 5 });
      boxes.push({ x: x + 2, y: o.y + o.height * .44, w: o.unitWidth - 4, h: o.height * .5 });
    }
    return boxes;
  }

  crash() {
    this.state = 'crashed';
    this.lastScore = this.score;
    this.newBest = this.score > this.best;
    this.best = Math.max(this.best, this.score);
    this.crashAge = 0;
    this.onEvent('crash');
  }
}
