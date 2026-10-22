import test from 'node:test';
import assert from 'node:assert/strict';
import { bindInput } from '../dist/input.js';
import { createGame } from '../dist/game.js';

// A minimal event/DOM double: these are unit tests, not real-browser coverage.
class EventHub {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
  }
  removeEventListener(type, handler) { this.listeners.get(type)?.delete(handler); }
  emit(type, fields = {}) {
    const event = {
      type, target: this, pointerId: 1, isPrimary: true, button: 0,
      clientX: 300, clientY: 300, repeat: false, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; }, ...fields,
    };
    for (const handler of [...(this.listeners.get(type) || [])]) handler(event);
    return event;
  }
  listenerCount() {
    return [...this.listeners.values()].reduce((sum, listeners) => sum + listeners.size, 0);
  }
}
class Arena extends EventHub {
  constructor(doc) {
    super();
    this.ownerDocument = doc;
    this.attrs = new Map();
    this.style = { touchAction: 'pan-y' };
    this.captures = new Set();
    this.rect = { left: 100, top: 200, width: 400, height: 200 };
  }
  getAttribute(key) { return this.attrs.get(key) ?? null; }
  setAttribute(key, value) { this.attrs.set(key, String(value)); }
  removeAttribute(key) { this.attrs.delete(key); }
  set tabIndex(value) { this.setAttribute('tabindex', value); }
  get tabIndex() { return Number(this.getAttribute('tabindex')); }
  closest() { return null; }
  focus() { this.ownerDocument.activeElement = this; }
  getBoundingClientRect() { return this.rect; }
  setPointerCapture(id) { this.captures.add(id); }
  hasPointerCapture(id) { return this.captures.has(id); }
  releasePointerCapture(id) {
    if (this.captures.delete(id)) this.emit('lostpointercapture', { pointerId: id });
  }
}
function fixture({ tabIndex = null, audioThrows = false } = {}) {
  const win = new EventHub();
  const doc = new EventHub();
  doc.defaultView = win;
  doc.activeElement = null;
  doc.hidden = false;
  const target = new Arena(doc);
  if (tabIndex !== null) target.setAttribute('tabindex', tabIndex);
  const events = [];
  const game = createGame(undefined, undefined, { onEvent: event => events.push(event) });
  let time = 0;
  let gestures = 0;
  const binding = bindInput(target, game, {
    now: () => time,
    onGesture() {
      gestures += 1;
      if (audioThrows) throw new Error('audio unavailable');
    },
  });
  return {
    target, doc, win, game, binding, events,
    get gestures() { return gestures; },
    at(value) { time = value; },
    tick(value) { time = value; game.tick(value); },
  };
}
test('pointerdown plus native click cannot double-hit; new presses still work without audio', () => {
  const h = fixture({ audioThrows: true });
  h.target.emit('pointerdown');
  h.target.emit('click');
  h.target.emit('pointerdown');
  assert.equal(h.game.getState().totalHits, 1);
  assert.equal(h.gestures, 1);
  h.target.emit('pointerup');
  h.at(100);
  h.target.emit('pointerdown');
  h.target.emit('click');
  assert.equal(h.game.getState().totalHits, 2);
  assert.equal(h.gestures, 2);
  h.binding.dispose();
});
test('only one primary left-button pointer controls attack and release', () => {
  const h = fixture();
  h.target.emit('pointerdown', { isPrimary: false, pointerId: 2 });
  h.target.emit('pointerdown', { button: 2 });
  assert.equal(h.game.getState().totalHits, 0);
  h.target.emit('pointerdown', { pointerId: 1 });
  assert.ok(h.target.hasPointerCapture(1));
  h.target.emit('pointerdown', { pointerId: 2 });
  h.win.emit('pointerup', { pointerId: 2 });
  h.tick(250);
  assert.equal(h.game.getState().totalHits, 2);
  h.win.emit('pointerup', { pointerId: 1 });
  h.tick(500);
  assert.equal(h.game.getState().totalHits, 2);
  assert.equal(h.target.hasPointerCapture(1), false);
  h.binding.dispose();
});
test('cancel, lost capture, blur and hidden document stop held attacks', () => {
  const h = fixture();
  const cancel = [
    () => h.target.emit('pointercancel'),
    () => h.target.emit('lostpointercapture'),
    () => h.win.emit('blur'),
    () => { h.doc.hidden = true; h.doc.emit('visibilitychange'); },
  ];
  cancel.forEach((stop, index) => {
    h.doc.hidden = false;
    h.at(index * 2000);
    h.target.emit('pointerdown');
    assert.equal(h.game.getState().totalHits, index + 1);
    stop();
    h.tick(index * 2000 + 1000);
    assert.equal(h.game.getState().totalHits, index + 1);
  });
  h.binding.dispose();
});
test('Space requires arena focus, ignores repeats, releases globally and leaves controls alone', () => {
  const h = fixture();
  const space = { code: 'Space', key: ' ' };
  h.target.emit('keydown', space);
  assert.equal(h.game.getState().totalHits, 0);
  h.target.focus();
  assert.ok(h.target.emit('keydown', space).defaultPrevented);
  h.target.emit('keydown', { ...space, repeat: true });
  h.target.emit('keydown', space);
  h.tick(250);
  assert.equal(h.game.getState().totalHits, 2);
  h.win.emit('keyup', space);
  h.tick(500);
  assert.equal(h.game.getState().totalHits, 2);
  h.target.emit('keydown', { code: 'Enter', key: 'Enter' });
  const button = { closest() { return this; } };
  h.doc.activeElement = button;
  const event = h.target.emit('keydown', { ...space, target: button });
  assert.equal(event.defaultPrevented, false);
  h.target.emit('pointerdown', { target: button });
  assert.equal(h.game.getState().totalHits, 2);
  h.at(1000);
  h.target.focus();
  h.target.emit('keydown', space);
  h.win.emit('blur');
  h.tick(2000);
  assert.equal(h.game.getState().totalHits, 3);
  h.binding.dispose();
});
test('pointer coordinates follow the current arena rect and clamp at edges', () => {
  const h = fixture();
  h.target.emit('pointerdown', { clientX: 0, clientY: 900 });
  h.target.rect = { left: 0, top: 0, width: 200, height: 400 };
  h.target.emit('pointermove', { clientX: 50, clientY: 100 });
  h.target.emit('pointermove', { pointerId: 2, clientX: 200, clientY: 400 });
  h.tick(250);
  let hits = h.events.filter(event => event.type === 'hit');
  assert.deepEqual([hits[0].x, hits[0].y], [0, 1]);
  assert.deepEqual([hits[1].x, hits[1].y], [0.25, 0.25]);
  h.target.emit('pointerup');
  h.target.rect = { left: 0, top: 0, width: 0, height: 0 };
  h.at(400);
  h.target.emit('pointerdown');
  hits = h.events.filter(event => event.type === 'hit');
  assert.deepEqual([hits[2].x, hits[2].y], [0.5, 0.5]);
  h.binding.dispose();
});
test('dispose releases input, removes listeners and restores owned DOM settings', () => {
  const h = fixture();
  assert.equal(h.target.getAttribute('tabindex'), '0');
  assert.equal(h.target.style.touchAction, 'none');
  h.target.emit('pointerdown');
  h.binding.dispose();
  h.binding.dispose();
  h.tick(1000);
  h.target.emit('pointerdown');
  h.target.emit('keydown', { code: 'Space', key: ' ' });
  assert.equal(h.game.getState().totalHits, 1);
  assert.equal(h.target.getAttribute('tabindex'), null);
  assert.equal(h.target.style.touchAction, 'pan-y');
  assert.equal(h.target.captures.size, 0);
  assert.equal(h.target.listenerCount() + h.doc.listenerCount() + h.win.listenerCount(), 0);
  const existing = fixture({ tabIndex: '3' });
  existing.binding.dispose();
  assert.equal(existing.target.getAttribute('tabindex'), '3');
});

test('moving focus away from arena releases held Space and pointer input', () => {
  const h = fixture();
  const space = { code: 'Space', key: ' ' };
  h.target.focus();
  h.target.emit('keydown', space);
  h.doc.activeElement = { tagName: 'BUTTON' };
  h.target.emit('blur');
  h.tick(500);
  assert.equal(h.game.getState().totalHits, 1, 'Space must stop when focus leaves arena');
  h.at(600);
  h.target.focus();
  h.target.emit('keydown', space);
  h.win.emit('keyup', space);
  assert.equal(h.game.getState().totalHits, 2, 'refocusing allows a new Space press');
  h.at(800);
  h.target.emit('pointerdown');
  h.target.emit('blur');
  h.tick(1300);
  assert.equal(h.game.getState().totalHits, 3, 'pointer hold must also stop after focus leaves');
  assert.equal(h.target.captures.size, 0);
  h.binding.dispose();
});
