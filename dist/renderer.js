import { CONFIG } from './core.js';

const DAY = { sky:'#eef1ed', far:'#e9ece5', farWindow:'#f4f5ef', near:'#d8ded3', nearWindow:'#f1f3ec', line:'#9ba791', road:'#f4f6ef', lane:'#d9dfd0', ink:'#687460', cloud:'#e4e8de' };
const NIGHT = { sky:'#20272d', far:'#2d3840', farWindow:'#35434a', near:'#3c4b50', nearWindow:'#9b9b72', line:'#718b85', road:'#263036', lane:'#41534f', ink:'#b4c3b2', cloud:'#44544f' };

function seeded(seed) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }

export class Renderer {
  constructor(canvas, runner) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha:false });
    this.runner = runner;
    this.particles = [];
    this.time = 0;
    this.skyline = [this.buildings(72, false), this.buildings(88, true)];
    this.resize();
  }

  buildings(seed, near) {
    const random = seeded(seed);
    const result = [];
    let x = 0;
    while (x < 1200) {
      const w = Math.floor(23 + random() * 45);
      result.push({ x, w, h:Math.floor((near ? 20 : 44) + random() * (near ? 52 : 75)), roof:Math.floor(random() * 4), windows:random() > .25 });
      x += w + Math.floor(5 + random() * 10);
    }
    return { buildings:result, width:x };
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(600, Math.min(700, rect.width));
    this.height = Math.max(175, Math.round(rect.height * this.width / Math.max(1, rect.width)));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(this.canvas.width / this.width, 0, 0, this.canvas.height / this.height, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    const ground = this.height - 34;
    const shift = ground - this.runner.ground;
    this.runner.player.y += shift;
    for (const obstacle of this.runner.obstacles) obstacle.y += shift;
    this.runner.ground = ground;
    this.runner.width = this.width;
    this.draw(0);
  }

  rect(x, y, w, h, color) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  poly(points, color) {
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    points.forEach(([x,y], i) => i ? this.ctx.lineTo(Math.round(x),Math.round(y)) : this.ctx.moveTo(Math.round(x),Math.round(y)));
    this.ctx.closePath();
    this.ctx.fill();
  }

  draw(delta) {
    const game = this.runner;
    const active = game.state === 'running' || game.state === 'intro';
    if (active) this.time += delta;
    const t = this.time;
    const night = game.nightTime > 0;
    const c = night ? NIGHT : DAY;
    const W = this.width, H = this.height, G = game.ground;
    const intro = game.state === 'intro' || (game.state === 'paused' && game.pausedFrom === 'intro');
    const introProgress = Math.min(1, game.introTime / CONFIG.INTRO_DURATION);
    const camera = intro ? 220 * this.ease(Math.max(0, (introProgress - .62) / .38)) : 0;
    const traveled = game.distance + (intro ? camera : game.sceneOffset);
    this.rect(0, 0, W, H, c.sky);

    if (night) {
      for (let i = 0; i < 28; i++) {
        const x = (i * 83 + 42) % W;
        const y = 23 + (i * 37 % Math.max(40, G - 90));
        this.rect(x, y, i % 4 ? 1 : 2, 1, i % 3 ? '#647d7b' : '#becbc1');
      }
      this.rect(W - 90, 42, 15, 20, '#d1dbbf');
      this.rect(W - 94, 46, 22, 12, '#d1dbbf');
      this.rect(W - 87, 39, 15, 17, c.sky);
    } else {
      this.rect(W - 106, 49, 20, 2, '#d8ddcf');
      this.rect(W - 110, 53, 28, 2, '#d8ddcf');
      this.rect(W - 112, 57, 32, 10, '#edf0e5');
      this.rect(W - 110, 69, 28, 2, '#d8ddcf');
      this.rect(W - 106, 73, 20, 2, '#d8ddcf');
    }
    for (let i = 0; i < 4; i++) {
      let x = ((i * 203 + 86 - traveled * .035) % (W + 150) + W + 150) % (W + 150) - 60;
      const y = 47 + (i % 3) * 21;
      this.rect(x, y + 7, 40, 1, c.cloud);
      this.rect(x + 6, y + 3, 7, 4, c.cloud);
      this.rect(x + 13, y, 12, 1, c.cloud);
      this.rect(x + 25, y + 1, 1, 5, c.cloud);
      this.rect(x + 26, y + 5, 10, 1, c.cloud);
    }

    this.skyline.forEach((layer, i) => {
      const offset = (traveled * (i ? .14 : .055)) % layer.width;
      const baseline = G - (i ? 12 : 20);
      for (let repeat = -1; repeat <= 1; repeat++) {
        for (const b of layer.buildings) {
          const x = b.x - offset + repeat * layer.width;
          if (x + b.w < 0 || x > W) continue;
          const y = baseline - b.h;
          const color = i ? c.near : c.far;
          this.rect(x, y, b.w, b.h, color);
          if (b.roof === 1) { this.rect(x + 5, y - 5, b.w - 10, 5, color); this.rect(x + b.w / 2, y - 15, 1, 10, color); }
          if (b.roof === 2) { this.rect(x + 5, y - 10, b.w - 10, 10, color); this.rect(x + 11, y - 17, b.w - 22, 7, color); }
          if (b.windows) {
            for (let wx = 6; wx < b.w - 5; wx += i ? 10 : 8) {
              for (let wy = 9; wy < b.h - 6; wy += 12) {
                if (night && (wx + wy + b.x) % 7 > 3) continue;
                this.rect(x + wx, y + wy, i ? 3 : 2, i ? 4 : 3, i ? c.nearWindow : c.farWindow);
              }
            }
          }
        }
      }
    });

    // Pavement, street lights and a very small roadside sign.
    this.rect(0, G - 13, W, 12, c.sky);
    this.rect(0, G - 9, W, 1, c.lane);
    const furnitureOffset = (traveled * .6) % 330;
    for (let x = 210 - furnitureOffset; x < W + 30; x += 330) {
      this.rect(x, G - 58, 2, 48, c.line);
      this.rect(x - 1, G - 59, 19, 2, c.line);
      this.rect(x + 11, G - 57, 8, 3, night ? '#ccd2a4' : c.line);
      this.rect(x - 2, G - 13, 6, 3, c.line);
    }
    const signX = ((W - 60 - traveled * .6) % (W + 230) + W + 230) % (W + 230);
    this.rect(signX, G - 30, 1, 20, c.line);
    this.rect(signX - 18, G - 40, 38, 13, c.line);
    this.ctx.fillStyle = c.sky;
    this.ctx.font = '6px monospace';
    this.ctx.fillText('CITY 01', Math.round(signX - 14), Math.round(G - 31));

    this.rect(0, G, W, H - G, c.road);
    this.rect(0, G, W, 1, c.line);
    this.rect(0, G + 3, W, 1, c.lane);
    for (let x = -(traveled % 80); x < W; x += 80) this.rect(x, G + 19, 33, 2, c.lane);
    for (let i = 0; i < 15; i++) {
      const x = ((i * 73 - traveled) % (W + 50) + W + 50) % (W + 50);
      this.rect(x, G + 7 + i % 5, i % 3 ? 3 : 6, 1, c.lane);
    }

    if (game.state === 'ready' || intro) this.ramp(c, camera);
    if (game.state === 'ready') {
      this.obstacle({ type:'compact', x:W - 90, y:G - 25, width:32, height:25, unitWidth:32, count:1, variant:0 }, c, t);
    }
    for (const obstacle of game.obstacles) this.obstacle(obstacle, c, t);
    if (intro) {
      this.introCar(introProgress, camera, t, c);
      return;
    }

    const p = game.player;
    const height = G - (p.y + p.height);
    this.rect(p.x + 5 + height * .05, G + 3, Math.max(35, 78 - height * .25), 3, night ? '#151e23' : '#c2ccc2');
    if (p.jumping && p.velocity < 1 && !p.speedDrop) {
      this.airJets(p.x, p.y, t, night);
    }

    this.roadster(p.x, p.y, p.ducking, game.state === 'crashed', t, c);

    if (active) {
      this.particles = this.particles.filter(particle => particle.life > 0);
      for (const particle of this.particles) {
        particle.x += particle.vx * delta / 16.667;
        particle.y += particle.vy * delta / 16.667;
        particle.vy += .1 * delta / 16.667;
        particle.life -= delta;
      }
    }
    for (const particle of this.particles) this.rect(particle.x, particle.y, particle.size, particle.size, particle.color);
    if (game.state === 'crashed') {
      const x = p.x + 89, y = p.y + 10;
      for (const [dx,dy,w,h] of [[2,-8,2,5],[9,-4,5,2],[11,4,5,2],[6,10,2,5]]) this.rect(x+dx,y+dy,w,h,'#e72839');
    }
  }

  ease(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }

  preview(canvas) {
    const old = this.ctx;
    this.ctx = canvas.getContext('2d');
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.ctx.save();
    this.ctx.scale(3.2, 3.2);
    this.roadster(4, 2, false, false, 0, DAY);
    this.ctx.restore();
    this.ctx = old;
  }

  ramp(c, camera) {
    const G = this.runner.ground;
    const r = Math.min(78, (G - 38) / 2);
    const cx = 210 - camera, cy = G - r;
    const surface = [], underside = [];
    for (let i = 0; i <= 40; i++) {
      const angle = i / 40 * Math.PI;
      surface.push([cx + Math.sin(angle) * r, cy + Math.cos(angle) * r]);
      underside.unshift([cx + Math.sin(angle) * (r + 12), cy + Math.cos(angle) * (r + 12)]);
    }
    this.rect(cx + r + 9, cy, 3, r, '#8b9793');
    this.rect(cx + r - 14, G - 2, 45, 3, '#84928d');
    this.poly([...surface, ...underside], '#b0bbb5');
    this.ctx.lineWidth = 2;
    this.ctx.strokeStyle = '#566760';
    this.ctx.beginPath();
    surface.forEach(([x,y],i) => i ? this.ctx.lineTo(x,y) : this.ctx.moveTo(x,y));
    this.ctx.stroke();
    this.ctx.strokeStyle = '#f8faf5';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    for (let i = 0; i <= 40; i++) {
      const angle = i / 40 * Math.PI;
      const x = cx + Math.sin(angle) * (r + 5), y = cy + Math.cos(angle) * (r + 5);
      i ? this.ctx.lineTo(x,y) : this.ctx.moveTo(x,y);
    }
    this.ctx.stroke();
    this.rect(cx - 42, G - 2 * r - 5, 42, 5, '#66776e');
    this.rect(cx - 42, G - 2 * r - 7, 42, 2, '#d1dad3');
    this.ctx.fillStyle = '#66766c';
    this.ctx.font = '6px monospace';
    this.ctx.fillText('TESLA', cx + r + 18, G - 5);
  }

  introCar(progress, camera, time, c) {
    const G = this.runner.ground, r = Math.min(78, (G - 38) / 2);
    let x, y, angle = 0;
    if (progress < .18) {
      x = 94 + (210 - 94) * this.ease(progress / .18);
      y = G;
    } else if (progress < .62) {
      const a = this.ease((progress - .18) / .44) * Math.PI;
      x = 210 + Math.sin(a) * r;
      y = G - r + Math.cos(a) * r;
      angle = -a;
    } else {
      const t = this.ease((progress - .62) / .38);
      x = 210 + 104 * t;
      y = G - 2 * r * (1 - t);
      angle = -Math.PI - Math.PI * t;
    }
    this.ctx.save();
    this.ctx.translate(Math.round(x - camera), Math.round(y));
    this.ctx.rotate(angle);
    if (progress > .59 && progress < .98) this.airJets(-44, -30, time, false);
    this.roadster(-44, -30, false, false, time, c);
    this.ctx.restore();
  }

  airJets(x, y, time, night) {
    // Cold gas: opaque white cores surrounded by diffuse grey-white air. No fire.
    const flick = Math.floor(time / 45) % 3;
    for (const [port, phase] of [[18, flick], [70, (flick + 1) % 3]]) {
      const length = 16 + phase * 5;
      this.rect(x + port - 3, y + 27, 8, length, night ? '#93a9ae' : '#bcc9c8');
      this.rect(x + port - 1, y + 27, 4, length + 3, '#ffffff');
      this.rect(x + port - 5, y + 29 + length, 12, 6, '#d7e1de');
      this.rect(x + port - 3, y + 29 + length, 8, 4, '#ffffff');
      this.rect(x + port - 9, y + 33 + length, 7, 4, '#dce5e0');
      this.rect(x + port + 4, y + 35 + length, 9, 3, '#dce5e0');
    }
  }

  roadster(x, y, duck, crashed, time, c) {
    const wheelFrame = Math.floor(time / 75) % 2;
    this.ctx.save();
    this.ctx.translate(Math.round(x), Math.round(y + (duck ? 18 : 0)));
    if (duck) this.ctx.scale(1, .4);
    // 2026 launch car: white angular wedge, dark canopy, long nose and large wheels.
    this.poly([[0,12],[14,10],[29,1],[48,0],[65,9],[81,12],[88,16],[86,24],[2,24]], '#65727b');
    this.poly([[2,12],[15,11],[30,2],[48,1],[65,10],[81,13],[86,16],[84,22],[3,22]], '#eef1f2');
    this.poly([[17,10],[30,3],[47,2],[60,10]], '#17242c');
    this.poly([[29,4],[33,3],[46,3],[55,8],[31,8]], '#34444a');
    this.rect(45, 3, 2, 7, '#19262c');
    this.poly([[4,13],[27,12],[62,11],[81,14],[82,17],[8,17]], '#ffffff');
    this.poly([[27,17],[51,16],[65,14],[62,22],[24,22]], '#aebcc3');
    this.poly([[27,17],[52,17],[59,15],[56,20],[29,20]], '#e5eaeb');
    this.rect(2, 22, 83, 3, '#253239');
    this.rect(7, 9, 17, 2, '#c8d2d5');
    this.rect(6, 8, 17, 1, '#5f6e77');
    this.rect(1, 12, 4, 2, '#e72839');
    this.rect(78, 13, 8, 2, '#ffffff');
    this.rect(81, 15, 5, 1, '#29373f');
    this.rect(82, 20, 5, 3, '#17262b');
    this.rect(57, 15, 3, 1, '#697a83');
    this.rect(3, 20, 6, 3, '#121f26');
    // Tesla badge, defined as pixels so it stays legible in the enlarged preview.
    this.rect(39, 13, 5, 1, '#4d5c63');
    this.rect(41, 14, 1, 4, '#4d5c63');
    for (const wx of [11,66]) {
      this.poly([[wx+2,15],[wx+11,15],[wx+14,18],[wx+14,26],[wx+11,29],[wx+2,29],[wx,26],[wx,18]], '#172229');
      this.rect(wx + 3, 17, 8, 10, '#8d9da6');
      this.rect(wx + 2, 19, 10, 6, '#b6c2c7');
      this.rect(wx + 5, 20, 4, 4, '#3d505b');
      this.rect(wx + (wheelFrame && !crashed ? 6 : 4), 17, 2, 10, '#5d727c');
      this.rect(wx + 3, 21, 8, 2, '#738994');
    }
    if (crashed) { this.rect(79, 10, 2, 10, '#687b84'); this.rect(77, 17, 6, 2, '#687b84'); }
    this.ctx.restore();
  }

  obstacle(o, c, time) {
    if (o.type === 'drone') {
      const x = Math.round(o.x), y = Math.round(o.y);
      this.rect(x + 1, y + 4, 40, 2, c.ink);
      this.rect(x + 7, y + 5, 2, 8, c.ink);
      this.rect(x + 33, y + 5, 2, 8, c.ink);
      this.rect(x + 15, y + 7, 13, 7, c.ink);
      this.rect(x + 18, y + 14, 6, 2, c.ink);
      this.rect(x + 19, y + 9, 3, 2, '#e72839');
      const spin = Math.floor(time / 80) % 2;
      this.rect(x + (spin ? 2 : 0), y + 1, spin ? 12 : 16, 1, c.line);
      this.rect(x + (spin ? 26 : 24), y + 1, spin ? 12 : 16, 1, c.line);
      return;
    }
    for (let i = 0; i < o.count; i++) {
      const x = Math.round(o.x + i * o.unitWidth), y = Math.round(o.y), w = o.unitWidth, h = o.height;
      const body = o.variant === 1 ? c.ink : c.line;
      this.ctx.save();
      this.ctx.translate(x, y);
      this.poly([[0,h-14],[5,h-15],[9,2],[w-12,2],[w-7,h-15],[w-2,h-13],[w-1,h-5],[1,h-5]],body);
      this.poly([[10,5],[w-14,5],[w-10,h-15],[7,h-15]], c.sky);
      this.rect(w / 2 - 1, 4, 2, h - 17, body);
      this.rect(2, h - 12, 3, 2, '#d7bdb1');
      this.rect(w - 6, h - 12, 3, 2, '#e8e9d6');
      this.rect(3, h - 7, w - 7, 1, c.ink);
      for (const wx of [5,w - 11]) {
        this.rect(wx, h - 8, 6, 7, '#404a43');
        this.rect(wx + 1, h - 6, 4, 3, '#bfc7bb');
      }
      if (o.type === 'suv') this.rect(9, 0, w - 21, 2, c.ink);
      this.ctx.restore();
    }
  }

  burst(kind) {
    const { player:p, ground:G } = this.runner;
    if (kind === 'start' || kind === 'intro') this.particles = [];
    if (kind !== 'land' && kind !== 'jump') return;
    for (let i = 0; i < 7; i++) this.particles.push({ x:p.x + 10 + i * 10, y:G - 2, vx:-1 - Math.random() * 2, vy:-Math.random() * 1.5, life:170 + Math.random() * 150, size:1 + i % 2, color:kind === 'jump' ? '#ffffff' : '#d2dbd5' });
  }
}
