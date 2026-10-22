const clamp = (value) => Math.min(1, Math.max(0, value));
const controls = 'button,a[href],input,select,textarea,[contenteditable]:not([contenteditable="false"]),[role="button"],[data-no-attack]';

export function bindInput(target, game, {
  now = () => performance.now(),
  onGesture = () => {},
} = {}) {
  const doc = target.ownerDocument;
  const win = doc.defaultView;
  const removers = [];
  const originalTabIndex = target.getAttribute('tabindex');
  const originalTouchAction = target.style.touchAction;
  if (originalTabIndex === null) target.tabIndex = 0;
  target.style.touchAction = 'none';

  let pointerId = null;
  let spaceHeld = false;
  let disposed = false;

  function listen(element, type, handler, options) {
    element.addEventListener(type, handler, options);
    removers.push(() => element.removeEventListener(type, handler, options));
  }

  function gesture() {
    // Audio is optional. Failure or browser rejection must not eat the punch.
    try {
      const result = onGesture();
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch { /* Keep playing without audio. */ }
  }

  function position(event) {
    const rect = target.getBoundingClientRect();
    return {
      x: rect.width ? clamp((event.clientX - rect.left) / rect.width) : 0.5,
      y: rect.height ? clamp((event.clientY - rect.top) / rect.height) : 0.5,
    };
  }

  function isControl(event) {
    const element = event.target?.closest?.(controls);
    return element && element !== target;
  }

  function stopPointer() {
    const previous = pointerId;
    pointerId = null;
    if (previous === null) return;
    game.release();
    try {
      if (target.hasPointerCapture(previous)) target.releasePointerCapture(previous);
    } catch { /* Pointer may already have been cancelled by the browser. */ }
  }

  function releaseAll() {
    stopPointer();
    spaceHeld = false;
    game.release();
  }

  function down(event) {
    if (disposed || pointerId !== null || spaceHeld || event.isPrimary === false ||
      event.button !== 0 || isControl(event)) return;
    event.preventDefault();
    pointerId = event.pointerId;
    try { target.focus({ preventScroll: true }); } catch { /* Focus is optional. */ }
    gesture();
    try { target.setPointerCapture(pointerId); } catch { /* Window listeners cover release. */ }
    game.press(position(event), now());
  }

  function move(event) {
    if (event.pointerId === pointerId) game.move(position(event));
  }

  function up(event) {
    if (event.pointerId === pointerId) stopPointer();
  }

  const isSpace = (event) => event.code === 'Space' || event.key === ' ';

  function keydown(event) {
    if (!isSpace(event) || doc.activeElement !== target || isControl(event)) return;
    event.preventDefault();
    if (event.repeat || spaceHeld || pointerId !== null || disposed) return;
    spaceHeld = true;
    gesture();
    game.press({ x: 0.5, y: 0.5 }, now());
  }

  function keyup(event) {
    if (!isSpace(event) || !spaceHeld) return;
    event.preventDefault();
    spaceHeld = false;
    game.release();
  }

  function visibility() {
    if (doc.hidden) releaseAll();
  }

  listen(target, 'pointerdown', down, { passive: false });
  listen(target, 'pointermove', move);
  listen(target, 'pointerup', up);
  listen(target, 'pointercancel', up);
  listen(target, 'lostpointercapture', up);
  listen(win, 'pointerup', up);
  listen(win, 'pointercancel', up);
  listen(win, 'blur', releaseAll);
  listen(target, 'blur', releaseAll);
  listen(target, 'keydown', keydown);
  listen(win, 'keyup', keyup);
  listen(doc, 'visibilitychange', visibility);

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      releaseAll();
      for (const remove of removers) remove();
      if (originalTabIndex === null) target.removeAttribute('tabindex');
      target.style.touchAction = originalTouchAction;
    },
  };
}
