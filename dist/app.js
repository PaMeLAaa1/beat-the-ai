import { CONFIG } from './config.js';
import { LINES } from './lines.js';
import { createGame } from './game.js';
import { bindInput } from './input.js';
import { createView } from './view.js';
import { createAudio } from './audio.js';

const arena = document.querySelector('#arena');
const soundButton = document.querySelector('#sound-toggle');
const motionButton = document.querySelector('#motion-toggle');
const preferenceKey = 'beat-the-ai.preferences.v1';
let saved = {};
try {
  const value = JSON.parse(localStorage.getItem(preferenceKey) || '{}');
  if (value && typeof value === 'object') saved = value;
} catch { /* Settings are optional, including in private browsing. */ }
let muted = typeof saved.muted === 'boolean' ? saved.muted : false;
let reducedMotion = typeof saved.reducedMotion === 'boolean'
  ? saved.reducedMotion
  : window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const view = createView(arena);
const audio = createAudio();
const game = createGame(CONFIG, LINES, {
  onEvent(event) {
    view.effect(event);
    audio.play(event);
  },
});
function unlockAudio() {
  try { Promise.resolve(audio.unlock()).catch(() => {}); } catch { /* Silent play remains available. */ }
}
bindInput(arena, game, { now: () => performance.now(), onGesture: unlockAudio });
function applyPreferences() {
  audio.setMuted(muted);
  view.setReducedMotion(reducedMotion);
  document.documentElement.classList.toggle('reduced-motion', reducedMotion);
  soundButton.setAttribute('aria-pressed', String(muted));
  soundButton.setAttribute('aria-label', '静音');
  soundButton.textContent = muted ? '声音：关' : '声音：开';
  motionButton.setAttribute('aria-pressed', String(reducedMotion));
  motionButton.setAttribute('aria-label', '减弱动态效果');
  motionButton.textContent = reducedMotion ? '动态：减弱' : '动态：开';
}
function savePreferences() {
  try { localStorage.setItem(preferenceKey, JSON.stringify({ muted, reducedMotion })); } catch { /* No persistence is also fine. */ }
}
soundButton.addEventListener('click', () => {
  muted = !muted;
  applyPreferences();
  savePreferences();
  if (!muted) unlockAudio();
});
motionButton.addEventListener('click', () => {
  reducedMotion = !reducedMotion;
  applyPreferences();
  savePreferences();
});
applyPreferences();
view.render(game.getState());

let frame = 0;
let suspended = false;
function loop(now) {
  frame = 0;
  if (suspended) return;
  game.tick(now);
  view.render(game.getState());
  frame = requestAnimationFrame(loop);
}
function suspend() {
  if (suspended) return;
  suspended = true;
  game.setPaused(true, performance.now());
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
}
function resume() {
  if (document.hidden) return;
  if (suspended) {
    game.setPaused(false, performance.now());
    suspended = false;
  }
  if (!frame) frame = requestAnimationFrame(loop);
}
document.addEventListener('visibilitychange', () => document.hidden ? suspend() : resume());
window.addEventListener('pagehide', suspend);
window.addEventListener('pageshow', resume);
if (document.hidden) suspend();
else resume();
