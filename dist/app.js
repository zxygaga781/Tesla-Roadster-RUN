import { Runner, CONFIG } from './core.js';
import { Renderer } from './renderer.js';

const $ = id => document.getElementById(id);
const storage = {
  get(key, fallback) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, String(value)); } catch { /* Private browsing can disable storage. */ } },
};
const savedBest = Number(storage.get('roadster-run-best', 0));
let renderer;
let milestoneUntil = 0;
let audioContext;
let soundOn = storage.get('roadster-run-sound', 'off') === 'on';
let lastUi = 0;
let previousNight = false;
const runner = new Runner({ best:Number.isFinite(savedBest) && savedBest >= 0 ? Math.floor(savedBest) : 0, onEvent });
renderer = new Renderer($('game'), runner);
renderer.preview($('model-preview'));

function tone(type) {
  if (!soundOn) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;
    const settings = { jump:[240, 610, .11], crash:[130, 40, .24], milestone:[660, 990, .16] }[type];
    if (!settings) return;
    oscillator.type = type === 'crash' ? 'sawtooth' : 'square';
    oscillator.frequency.setValueAtTime(settings[0], now);
    oscillator.frequency.exponentialRampToValueAtTime(settings[1], now + settings[2]);
    gain.gain.setValueAtTime(.035, now);
    gain.gain.exponentialRampToValueAtTime(.001, now + settings[2]);
    oscillator.connect(gain); gain.connect(audioContext.destination);
    oscillator.start(now); oscillator.stop(now + settings[2]);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  } catch { /* Sound is optional; the game works without Web Audio. */ }
}

function onEvent(event) {
  renderer?.burst(event);
  if (['jump', 'crash', 'milestone'].includes(event)) tone(event);
  if (event === 'crash') {
    storage.set('roadster-run-best', runner.best);
    $('announcer').textContent = `本次 ${runner.score} 分，最高 ${runner.best} 分。可以再来一局。`;
  }
  if (event === 'milestone') {
    milestoneUntil = performance.now() + 1100;
    $('milestone').textContent = `${String(runner.score).padStart(5,'0')} / KEEP GOING`;
    $('announcer').textContent = `已达到 ${runner.score} 分。`;
  }
  if (event === 'start' || event === 'intro') {
    $('announcer').textContent = '游戏开始。';
    milestoneUntil = 0;
  }
  syncUI();
}

function syncUI() {
  const state = runner.state;
  const running = state === 'running' || state === 'intro';
  $('overlay').hidden = running;
  $('stage').classList.toggle('crashed', state === 'crashed');
  $('score').textContent = String(runner.score).padStart(5,'0');
  $('best').textContent = String(Math.max(runner.best, runner.score)).padStart(5,'0');
  $('speed').textContent = `${(runner.speed / CONFIG.SPEED).toFixed(1)}×`;
  $('pause').disabled = state === 'ready' || state === 'crashed';
  $('pause').setAttribute('aria-label', state === 'paused' ? '继续游戏' : '暂停游戏');
  $('pause').innerHTML = state === 'paused' ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 4 13 8-13 8V4Z"/></svg>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>';
  $('start').disabled = state === 'crashed' && runner.crashAge < CONFIG.RESTART_DELAY;
  const labels = {
    ready:['TESLA ROADSTER','准备起飞','纯电超跑 Roadster（火箭版）','开始驾驶','等待出发'],
    crashed:[runner.newBest ? 'NEW HIGH SCORE' : 'GAME OVER','本次行驶结束',`本次 ${String(runner.score).padStart(5,'0')} 分${runner.newBest ? ' · 新纪录！' : ''}`,'重新出发','本次行驶结束'],
    paused:['PAUSED','已暂停','纯电超跑 Roadster（火箭版）','继续驾驶','已暂停'],
    running:['','','','','行驶中'],
    intro:['','','','','圆弧坡道起步'],
  }[state];
  if (!running) {
    $('overlay-eyebrow').textContent = labels[0];
    $('overlay-title').textContent = labels[1];
    $('overlay-copy').textContent = labels[2];
    $('start-label').textContent = labels[3];
    $('start-hint').innerHTML = state === 'crashed' ? '按 <kbd>SPACE</kbd> 或 <kbd>R</kbd> 再来一局' : state === 'paused' ? '按 <kbd>SPACE</kbd> 或 <kbd>P</kbd> 继续' : '或按 <kbd>SPACE</kbd> 起跳';
  }
  $('run-state').textContent = labels[4];
  const boosting = running && runner.player.jumping && runner.player.velocity < 1;
  $('system-label').textContent = boosting ? '火箭推进中' : state === 'crashed' ? '推进系统待命' : state === 'paused' ? '推进系统暂停' : running ? '推进系统在线' : '推进系统就绪';
  $('system-dot').style.background = boosting ? '#e72839' : '#7c8971';
  const night = runner.nightTime > 0;
  if (night !== previousNight) {
    $('stage').classList.toggle('night', night);
    $('day-icon').textContent = night ? '☾' : '☀';
    $('day-label').textContent = night ? 'NIGHT RUN' : 'DAY RUN';
    previousNight = night;
  }
}

function act() {
  if ($('credits').open) return;
  if (runner.state === 'paused') runner.resume();
  else if (runner.state === 'ready' || (runner.state === 'crashed' && runner.crashAge >= CONFIG.RESTART_DELAY)) runner.launch();
  else if (runner.state === 'running') runner.jump();
  $('game').focus({ preventScroll:true });
}

function togglePause() {
  if (runner.state === 'paused') runner.resume();
  else runner.pause();
}

$('start').addEventListener('click', act);
$('pause').addEventListener('click', togglePause);

document.addEventListener('keydown', event => {
  if ($('credits').open || event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.target.closest('button,a,input,textarea,select') && ['Space','Enter'].includes(event.code)) return;
  if (['Space','ArrowUp','ArrowDown','KeyP','KeyR','Escape','Enter'].includes(event.code)) event.preventDefault();
  if (event.repeat) return;
  if (event.code === 'Space' || event.code === 'ArrowUp') act();
  if (event.code === 'ArrowDown' && runner.state === 'running') runner.setDown(true);
  if (event.code === 'KeyP' || event.code === 'Escape') togglePause();
  if (event.code === 'KeyR' || (event.code === 'Enter' && runner.state === 'crashed')) {
    if (runner.state !== 'crashed' || runner.crashAge >= CONFIG.RESTART_DELAY) { runner.launch(); $('game').focus({preventScroll:true}); }
  }
});
document.addEventListener('keyup', event => {
  if (event.code === 'Space' || event.code === 'ArrowUp') runner.releaseJump();
  if (event.code === 'ArrowDown') runner.setDown(false);
});

function bindPointer(element, down, up) {
  element.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    element.setPointerCapture(event.pointerId);
    down();
  });
  for (const name of ['pointerup','pointercancel','lostpointercapture']) element.addEventListener(name, () => up());
}
bindPointer($('game'), act, () => runner.releaseJump());

function syncSound() {
  $('sound').setAttribute('aria-pressed', String(soundOn));
  $('sound').setAttribute('aria-label', soundOn ? '关闭音效' : '开启音效');
  $('sound-waves').setAttribute('d', soundOn ? 'M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14' : 'm16 9 6 6m0-6-6 6');
}
$('sound').addEventListener('click', () => { soundOn = !soundOn; storage.set('roadster-run-sound', soundOn ? 'on' : 'off'); syncSound(); if (soundOn) tone('jump'); });

$('fullscreen').addEventListener('click', async () => {
  const shell = $('game-shell');
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (shell.classList.contains('expanded')) shell.classList.remove('expanded');
    else if (shell.requestFullscreen) await shell.requestFullscreen();
    else shell.classList.add('expanded');
  } catch { shell.classList.toggle('expanded'); }
  $('fullscreen').setAttribute('aria-label', document.fullscreenElement || shell.classList.contains('expanded') ? '退出全屏' : '全屏游戏');
  renderer.resize();
});
document.addEventListener('fullscreenchange', () => {
  $('fullscreen').setAttribute('aria-label', document.fullscreenElement ? '退出全屏' : '全屏游戏');
  renderer.resize();
});

$('credits-open').addEventListener('click', () => { runner.pause(); $('credits').showModal(); });
$('credits-close').addEventListener('click', () => $('credits').close());
$('credits').addEventListener('click', event => { if (event.target === $('credits')) { const r = $('credits').getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) $('credits').close(); } });
window.addEventListener('blur', () => runner.pause());
document.addEventListener('visibilitychange', () => { if (document.hidden) runner.pause(); });
window.addEventListener('pagehide', () => storage.set('roadster-run-best', Math.max(runner.best, runner.score)));
new ResizeObserver(() => {
  const rect = $('game').getBoundingClientRect();
  const width = Math.max(280, Math.min(700, rect.width));
  if (Math.abs(width - renderer.width) > 1) runner.pause();
  renderer.resize();
}).observe($('stage'));

let lastTime = performance.now();
function frame(time) {
  const delta = Math.min(100, time - lastTime);
  lastTime = time;
  runner.tick(delta);
  renderer.draw(delta);
  if (time - lastUi > 80) { syncUI(); lastUi = time; }
  $('milestone').classList.toggle('show', time < milestoneUntil && runner.state === 'running');
  requestAnimationFrame(frame);
}
syncSound(); syncUI(); requestAnimationFrame(frame);
