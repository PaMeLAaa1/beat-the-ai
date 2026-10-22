import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../dist/config.js';
import { LINES } from '../dist/lines.js';
import { createGame } from '../dist/game.js';

const center = { x: 0.5, y: 0.5 };
function fixture(overrides = {}) {
  const events = [];
  const game = createGame({ ...CONFIG, ...overrides }, LINES, { onEvent: event => events.push(event) });
  return { game, events };
}
function tap(game, time, point = center) { game.press(point, time); game.release(); }

test('initial state is immutable and has the fixed opening line', () => {
  const { game } = fixture();
  assert.deepEqual(game.getState(), {
    phase: 'active', mood: 'smug', replacement: 100, combo: 0,
    totalHits: 0, round: 1, lineId: LINES.smug[0].id, line: LINES.smug[0].text,
  });
  assert.ok(Object.isFrozen(game.getState()));
});
test('a press hits once and all presses share the rate limit', () => {
  const { game, events } = fixture();
  tap(game, 0);
  tap(game, 69);
  assert.equal(game.getState().totalHits, 1);
  tap(game, 70);
  tap(game, 30); // A stale clock cannot rewind the hit limiter.
  assert.equal(game.getState().replacement, 92);
  assert.equal(events.filter(event => event.type === 'hit').length, 2);
});
test('hold delay, repeat interval, release and slow-frame cap', () => {
  const { game } = fixture();
  game.press(center, 0);
  game.press(center, 100);
  game.tick(249);
  assert.equal(game.getState().totalHits, 1);
  game.tick(250);
  assert.equal(game.getState().totalHits, 2);
  game.tick(349);
  assert.equal(game.getState().totalHits, 2);
  game.tick(350);
  game.tick(10000);
  assert.equal(game.getState().totalHits, 4);
  game.release();
  game.tick(20000);
  assert.equal(game.getState().totalHits, 4);
});
test('pointer positions are clamped and move changes the next repeat position', () => {
  const { game, events } = fixture();
  game.press({ x: -5, y: 9 }, 0);
  game.move({ x: 0.2, y: 0.8 });
  game.tick(250);
  const hits = events.filter(event => event.type === 'hit');
  assert.deepEqual([hits[0].x, hits[0].y], [0, 1]);
  assert.deepEqual([hits[1].x, hits[1].y], [0.2, 0.8]);
  assert.ok(Object.isFrozen(hits[0]));
});
test('mood changes at exactly 60 and 24, regardless of line cooldown', () => {
  const { game } = fixture();
  for (let index = 0; index < 9; index += 1) tap(game, index * 70);
  assert.equal(game.getState().replacement, 64);
  assert.equal(game.getState().mood, 'smug');
  tap(game, 630);
  assert.equal(game.getState().replacement, 60);
  assert.equal(game.getState().mood, 'nervous');
  assert.equal(game.getState().lineId, LINES.nervous[0].id);
  for (let index = 10; index < 19; index += 1) tap(game, index * 70);
  assert.equal(game.getState().replacement, 24);
  assert.equal(game.getState().mood, 'glitch');
  assert.equal(game.getState().lineId, LINES.glitch[0].id);
});
test('same-mood dialogue obeys its cooldown', () => {
  const { game } = fixture();
  tap(game, 0);
  tap(game, 600);
  assert.equal(game.getState().lineId, LINES.smug[0].id);
  tap(game, 700);
  assert.equal(game.getState().lineId, LINES.smug[1].id);
});
test('combo expires at its boundary without changing progress', () => {
  const { game } = fixture();
  tap(game, 0);
  game.tick(899);
  assert.equal(game.getState().combo, 1);
  game.tick(900);
  assert.equal(game.getState().combo, 0);
  assert.equal(game.getState().replacement, 96);
  tap(game, 1000);
  assert.equal(game.getState().combo, 1);
});
test('overkill clamps to zero and emits broken once', () => {
  const { game, events } = fixture({ damage: 120 });
  tap(game, 0);
  tap(game, 100);
  game.tick(200);
  assert.equal(game.getState().replacement, 0);
  assert.equal(game.getState().phase, 'broken');
  assert.equal(game.getState().totalHits, 1);
  assert.equal(events.filter(event => event.type === 'phase' && event.phase === 'broken').length, 1);
});
test('phase timing is exact and a reboot requires a new press', () => {
  const { game } = fixture({ damage: 100 });
  game.press(center, 0);
  game.tick(899);
  assert.equal(game.getState().phase, 'broken');
  game.tick(900);
  assert.equal(game.getState().phase, 'rebooting');
  game.tick(1499);
  assert.equal(game.getState().phase, 'rebooting');
  game.tick(1500);
  assert.equal(game.getState().phase, 'active');
  assert.equal(game.getState().round, 2);
  assert.equal(game.getState().combo, 0);
  assert.equal(game.getState().replacement, 100);
  game.tick(5000);
  assert.equal(game.getState().totalHits, 1);
  tap(game, 5000);
  assert.equal(game.getState().totalHits, 2);
});
test('pausing active play clears hold and never catches up on resume', () => {
  const { game } = fixture();
  game.press(center, 0);
  game.tick(250);
  game.setPaused(true, 300);
  game.tick(30000);
  game.press(center, 31000);
  game.setPaused(false, 40000);
  game.tick(60000);
  assert.equal(game.getState().totalHits, 2);
  assert.equal(game.getState().combo, 0);
  tap(game, 60100);
  assert.equal(game.getState().totalHits, 3);
});
test('pause freezes remaining broken and reboot durations', () => {
  const { game } = fixture({ damage: 100 });
  tap(game, 100);
  game.setPaused(true, 400);
  game.tick(10000);
  game.setPaused(false, 20000);
  game.tick(20599);
  assert.equal(game.getState().phase, 'broken');
  game.tick(20600);
  assert.equal(game.getState().phase, 'rebooting');
  game.setPaused(true, 20800);
  game.setPaused(false, 30000);
  game.tick(30399);
  assert.equal(game.getState().phase, 'rebooting');
  game.tick(30400);
  assert.equal(game.getState().phase, 'active');
});
test('ten complete rounds maintain exact hit and phase counts', () => {
  const { game, events } = fixture();
  let time = 0;
  for (let round = 0; round < 10; round += 1) {
    for (let hit = 0; hit < 25; hit += 1) { tap(game, time); time += 100; }
    game.tick(time + 1400);
    time += 1500;
  }
  assert.equal(game.getState().round, 11);
  assert.equal(game.getState().totalHits, 250);
  assert.equal(game.getState().phase, 'active');
  assert.equal(events.filter(event => event.type === 'hit').length, 250);
  assert.equal(events.filter(event => event.type === 'phase').length, 30);
});
test('event callbacks see committed state and cannot recursively mutate it', () => {
  let game;
  let callbacks = 0;
  game = createGame(CONFIG, LINES, { onEvent(event) {
    if (event.type !== 'hit') return;
    callbacks += 1;
    assert.equal(game.getState().totalHits, callbacks);
    game.release();
    game.press(center, 100000);
    game.tick(200000);
    game.setPaused(true, 300000);
  } });
  tap(game, 0);
  tap(game, 100);
  assert.equal(callbacks, 2);
  assert.equal(game.getState().totalHits, 2);
});
test('a throwing callback does not permanently lock the game', () => {
  let shouldThrow = true;
  const game = createGame(CONFIG, LINES, { onEvent() {
    if (shouldThrow) { shouldThrow = false; throw new Error('view failed'); }
  } });
  assert.throws(() => game.press(center, 0), /view failed/);
  game.release();
  tap(game, 100);
  assert.equal(game.getState().totalHits, 2);
});
test('disposing from a callback stops queued and future events', () => {
  let game;
  const events = [];
  game = createGame({ ...CONFIG, damage: 100 }, LINES, { onEvent(event) {
    events.push(event);
    game.dispose();
  } });
  game.press(center, 0);
  game.tick(10000);
  game.press(center, 11000);
  game.dispose();
  assert.equal(events.length, 1);
  assert.equal(game.getState().totalHits, 1);
});
test('invalid timing and missing dialogue are rejected immediately', () => {
  assert.throws(() => createGame({ repeatIntervalMs: 0 }), TypeError);
  assert.throws(() => createGame({ damage: NaN }), TypeError);
  assert.throws(() => createGame({ initialReplacement: 101 }), RangeError);
  assert.throws(() => createGame(CONFIG, { ...LINES, smug: [] }), TypeError);
});
