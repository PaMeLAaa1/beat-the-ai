import { CONFIG } from './config.js';
import { LINES } from './lines.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const pointOf = (point) => ({
  x: Number.isFinite(point?.x) ? clamp(point.x, 0, 1) : 0.5,
  y: Number.isFinite(point?.y) ? clamp(point.y, 0, 1) : 0.5,
});

export function createGame(config = CONFIG, lines = LINES, { onEvent = () => {} } = {}) {
  const c = { ...CONFIG, ...config };
  for (const [key, value] of Object.entries(c)) {
    if (!Number.isFinite(value) || value < 0) throw new TypeError('Invalid config: ' + key);
  }
  for (const key of ['initialReplacement', 'damage', 'repeatIntervalMs',
    'minHitIntervalMs', 'comboTimeoutMs', 'brokenDurationMs', 'rebootDurationMs']) {
    if (c[key] <= 0) throw new TypeError('Config must be positive: ' + key);
  }
  if (c.initialReplacement > 100) throw new RangeError('initialReplacement must be <= 100');
  if (typeof onEvent !== 'function') throw new TypeError('onEvent must be a function');

  const bank = {};
  for (const mood of ['smug', 'nervous', 'glitch']) {
    if (!Array.isArray(lines[mood]) || !lines[mood].length) {
      throw new TypeError('Missing lines: ' + mood);
    }
    bank[mood] = lines[mood].map((entry) => {
      if (typeof entry?.id !== 'string' || typeof entry?.text !== 'string') {
        throw new TypeError('Each line needs id and text');
      }
      return { id: entry.id, text: entry.text };
    });
  }

  const moodOf = (value) => value <= 24 ? 'glitch' : value <= 60 ? 'nervous' : 'smug';
  const initialMood = moodOf(c.initialReplacement);
  const state = {
    phase: 'active', mood: initialMood, replacement: c.initialReplacement,
    combo: 0, totalHits: 0, round: 1,
    lineId: bank[initialMood][0].id, line: bank[initialMood][0].text,
  };
  const cursors = { smug: 0, nervous: 0, glitch: 0 };
  let clock = 0;
  let lastRaw = null;
  let lastHit = -Infinity;
  let lastLine = 0;
  let phaseDeadline = Infinity;
  let held = false;
  let nextRepeat = Infinity;
  let point = { x: 0.5, y: 0.5 };
  let paused = false;
  let disposed = false;
  let busy = false;
  let queue = [];

  function advanceClock(raw) {
    if (!Number.isFinite(raw)) return;
    if (lastRaw === null) { lastRaw = raw; return; }
    const delta = Math.max(0, raw - lastRaw);
    lastRaw = Math.max(raw, lastRaw);
    if (!paused) clock += delta;
  }

  // State commits before events. Callback-triggered mutations are ignored;
  // dispose is always allowed. A throwing callback cannot leave the lock held.
  function transact(raw, action) {
    if (disposed || busy) return;
    busy = true;
    queue = [];
    try {
      advanceClock(raw);
      action();
      while (!disposed && queue.length) onEvent(Object.freeze(queue.shift()));
    } finally {
      queue = [];
      busy = false;
    }
  }

  function clearHeld() {
    held = false;
    nextRepeat = Infinity;
  }

  function changeLine(entry) {
    if (state.lineId === entry.id && state.line === entry.text) return;
    state.lineId = entry.id;
    state.line = entry.text;
    lastLine = clock;
    queue.push({ type: 'line', lineId: entry.id, text: entry.text });
  }

  function changePhase(phase) {
    state.phase = phase;
    queue.push({ type: 'phase', phase });
  }

  function refresh() {
    if (state.combo && clock - lastHit >= c.comboTimeoutMs) state.combo = 0;
    if (state.phase === 'broken' && clock >= phaseDeadline) {
      changePhase('rebooting');
      phaseDeadline += c.rebootDurationMs;
      changeLine({ id: 'system-rebooting', text: '正在重启嘴硬模块……' });
    }
    if (state.phase === 'rebooting' && clock >= phaseDeadline) {
      state.replacement = c.initialReplacement;
      state.mood = initialMood;
      state.combo = 0;
      state.round += 1;
      lastHit = -Infinity;
      lastLine = clock;
      phaseDeadline = Infinity;
      clearHeld();
      for (const key of Object.keys(cursors)) cursors[key] = 0;
      changePhase('active');
      changeLine(bank[initialMood][0]);
    }
  }

  function strike() {
    if (paused || state.phase !== 'active' || clock - lastHit < c.minHitIntervalMs) return;
    const oldMood = state.mood;
    lastHit = clock;
    state.replacement = Math.max(0, state.replacement - c.damage);
    state.combo += 1;
    state.totalHits += 1;
    state.mood = moodOf(state.replacement);
    queue.push({
      type: 'hit', x: point.x, y: point.y, combo: state.combo,
      intensity: Math.min(1, 0.2 + state.combo * 0.06),
    });

    if (state.replacement === 0) {
      clearHeld();
      phaseDeadline = clock + c.brokenDurationMs;
      changePhase('broken');
      changeLine({ id: 'system-broken', text: '人工接管。嘴硬模块已停止。' });
    } else if (state.mood !== oldMood) {
      cursors[state.mood] = 0;
      changeLine(bank[state.mood][0]);
    } else if (clock - lastLine >= c.lineIntervalMs) {
      const mood = state.mood;
      cursors[mood] = (cursors[mood] + 1) % bank[mood].length;
      changeLine(bank[mood][cursors[mood]]);
    }
  }

  return Object.freeze({
    press(nextPoint, now) {
      transact(now, () => {
        if (paused) return;
        refresh();
        if (held || state.phase !== 'active') return;
        point = pointOf(nextPoint);
        held = true;
        nextRepeat = clock + c.holdDelayMs;
        strike();
      });
    },
    move(nextPoint) {
      transact(undefined, () => { point = pointOf(nextPoint); });
    },
    release() {
      transact(undefined, clearHeld);
    },
    tick(now) {
      transact(now, () => {
        if (paused) return;
        refresh();
        if (held && state.phase === 'active' && clock >= nextRepeat) {
          // Never catch up missed attacks in a loop after a slow frame.
          nextRepeat = clock + c.repeatIntervalMs;
          strike();
        }
      });
    },
    setPaused(value, now) {
      transact(now, () => {
        const next = Boolean(value);
        if (next === paused) return;
        paused = next;
        clearHeld();
        state.combo = 0;
      });
    },
    getState() {
      return Object.freeze({ ...state });
    },
    dispose() {
      disposed = true;
      clearHeld();
      queue.length = 0;
    },
  });
}
