import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

if (typeof WebSocket !== 'function') throw new Error('Browser smoke requires Node.js 22 or newer');
const root = fileURLToPath(new URL('../', import.meta.url));
const profile = await mkdtemp(join(tmpdir(), 'beat-the-ai-chrome-'));
const output = join(root, '.artifacts');
await mkdir(output, { recursive: true });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const launchErrors = [];
const server = spawn(process.execPath, ['scripts/serve.mjs'], {
  cwd: root, env: { ...process.env, PORT: '3100', HOST: '127.0.0.1' }, stdio: ['ignore', 'ignore', 'pipe'],
});
const browser = spawn(process.env.BROWSER || 'google-chrome', [
  '--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
  '--remote-debugging-port=9222', '--user-data-dir=' + profile, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
for (const child of [server, browser]) child.on('error', error => launchErrors.push(error.message));
server.stderr.on('data', chunk => process.stderr.write(chunk));
browser.stderr.on('data', () => {});
async function until(check, label, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (launchErrors.length) throw new Error(launchErrors.join('; '));
    const result = await check();
    if (result) return result;
    await delay(80);
  }
  throw new Error('Timed out: ' + label);
}
let socket;
const pending = new Map();
let sequence = 0;
const exceptions = [];
const eventWaiters = new Map();
function onceEvent(method) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { eventWaiters.delete(method); reject(new Error('CDP event timeout: ' + method)); }, 15000);
    eventWaiters.set(method, { resolve, timer });
  });
}
async function stop(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise(resolve => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 2000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
    child.kill('SIGTERM');
  });
}
async function send(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 10000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
const stateExpression = `(() => {
  const arena = document.querySelector('#arena');
  const meter = arena?.querySelector('[role="progressbar"]');
  return { ready: Boolean(meter), value: Number(meter?.getAttribute('aria-valuenow')), phase: arena?.dataset.phase,
    overflow: document.documentElement.scrollWidth > innerWidth + 1 };
})()`;
const state = () => evaluate(stateExpression);
async function click(selector) {
  const point = await evaluate(`(() => { const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
}
async function screenshot(name) {
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(join(output, name + '.png'), Buffer.from(shot.data, 'base64'));
  if (process.env.PLAYTEST_INLINE_SCREENSHOTS === '1') {
    const preview = await send('Page.captureScreenshot', { format: 'jpeg', quality: 65, captureBeyondViewport: false });
    console.log('PLAYTEST_IMAGE ' + name + ' ' + preview.data);
  }
}
try {
  await until(async () => { try { return (await fetch('http://127.0.0.1:3100/', { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; } }, 'HTTP server');
  const pages = await until(async () => { try { const list = await (await fetch('http://127.0.0.1:9222/json/list', { signal: AbortSignal.timeout(1500) })).json(); return list.find(page => page.type === 'page'); } catch { return false; } }, 'Chrome debugger');
  socket = new WebSocket(pages.webSocketDebuggerUrl);
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails);
    const waiter = eventWaiters.get(message.method);
    if (waiter) { clearTimeout(waiter.timer); eventWaiters.delete(message.method); waiter.resolve(message.params); }
    const item = pending.get(message.id);
    if (!item) return;
    clearTimeout(item.timer);
    pending.delete(message.id);
    if (message.error) item.reject(new Error(JSON.stringify(message.error)));
    else item.resolve(message.result);
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { reject(new Error('Chrome WebSocket handshake timeout')); socket.close(); }, 10000);
    socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener('error', error => { clearTimeout(timer); reject(error); }, { once: true });
    socket.addEventListener('close', () => { clearTimeout(timer); reject(new Error('Chrome WebSocket closed')); }, { once: true });
  });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await Promise.all([onceEvent('Page.loadEventFired'), send('Page.navigate', { url: 'http://127.0.0.1:3100/' })]);
  await until(async () => (await state())?.ready, 'game boot');
  assert.equal((await state()).value, 100);
  await delay(600);
  await screenshot('desktop-initial');
  await click('#arena');
  await until(async () => (await state()).value === 96, 'single hit');
  await click('#sound-toggle');
  assert.equal(await evaluate("document.querySelector('#sound-toggle').getAttribute('aria-pressed')"), 'true');
  assert.equal((await state()).value, 96, 'settings must not hit AI');
  await click('#motion-toggle');
  assert.equal(await evaluate("document.documentElement.classList.contains('reduced-motion')"), true);
  assert.equal((await state()).value, 96);
  await delay(90);
  await evaluate("document.querySelector('#arena').focus()");
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
  await until(async () => (await state()).value === 92, 'keyboard hit');
  const point = await evaluate("(() => { const r=document.querySelector('#arena').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()");
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
  await until(async () => (await state()).value === 0, 'held input breaks AI', 8000);
  await screenshot('human-takeover');
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
  await until(async () => (await state()).value === 100, 'automatic reboot', 5000);
  await delay(500);
  assert.equal((await state()).value, 100, 'reboot must require another press');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await delay(150);
  assert.equal((await state()).overflow, false, 'mobile layout must not overflow horizontally');
  await screenshot('mobile-390');
  await Promise.all([onceEvent('Page.loadEventFired'), send('Page.reload')]);
  await until(async () => (await state())?.ready, 'reload after settings');
  assert.equal(await evaluate("document.querySelector('#sound-toggle').getAttribute('aria-pressed')"), 'true');
  assert.equal(await evaluate("document.documentElement.classList.contains('reduced-motion')"), true);
  assert.deepEqual(exceptions, [], 'uncaught browser exceptions');

  const playtestFailures = [];
  async function checkCase(name, action) {
    try { if (await action() !== false) console.log('PLAYTEST_PASS ' + name); }
    catch (error) { playtestFailures.push(name + ': ' + error.message); console.error('PLAYTEST_FAIL ' + name + ': ' + error.message); }
  }
  async function reloadGame() {
    await Promise.all([onceEvent('Page.loadEventFired'), send('Page.reload')]);
    await until(async () => (await state())?.ready, 'fresh game');
  }
  async function hitCount() { return evaluate("Number(document.querySelector('[data-hits]').textContent)"); }
  async function arenaPoint() {
    return evaluate("(() => { const r=document.querySelector('#arena').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()");
  }
  async function mouse(type, point) {
    await send('Input.dispatchMouseEvent', { type, button: 'left', clickCount: 1, ...point });
  }

  await checkCase('Space stops when arena loses focus', async () => {
    await reloadGame();
    await evaluate("document.querySelector('#arena').focus()");
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
    await until(async () => (await hitCount()) === 1, 'focus test first hit');
    await evaluate("document.querySelector('#sound-toggle').focus()");
    const before = await hitCount();
    await delay(450);
    const after = await hitCount();
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
    assert.equal(after, before, 'moving focus to settings must release held Space');
  });

  for (const [width, height] of [[320, 568], [360, 640], [390, 844]]) {
    await checkCase('layout ' + width + 'x' + height, async () => {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
      await reloadGame();
      await delay(600);
      const layout = await evaluate(`(() => {
        const rect = selector => { const r=document.querySelector(selector).getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right}; };
        return {overflow:document.documentElement.scrollWidth > innerWidth+1,
          machine:rect('.machine-svg'), meter:rect('.plan-track'),
          controls:[rect('#sound-toggle'),rect('#motion-toggle')]};
      })()`);
      console.log('PLAYTEST_LAYOUT ' + width + ' ' + JSON.stringify(layout));
      assert.equal(layout.overflow, false);
      assert.ok(layout.machine.y >= 0 && layout.machine.bottom <= height, 'AI must be visible on first screen');
      assert.ok(layout.meter.y >= 0 && layout.meter.bottom <= height, 'progress must be visible');
      for (const control of layout.controls) {
        assert.ok(control.width >= 44 && control.height >= 44, 'touch controls must be at least 44px');
        assert.ok(control.x >= 0 && control.right <= width, 'touch controls must fit viewport');
      }
      await screenshot('mobile-' + width + '-playtest');
    });
  }

  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  await checkCase('touch, second finger and cancellation', async () => {
    await reloadGame();
    const p = await arenaPoint();
    const first = { ...p, id: 1 };
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first] });
    await until(async () => (await hitCount()) === 1, 'touch first hit');
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first, { x:p.x+30, y:p.y+20, id:2 }] });
    assert.equal(await hitCount(), 1, 'second finger must not add a hit');
    await send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await delay(500);
    assert.equal(await hitCount(), 1, 'touch cancellation must stop repeat');
  });
  await checkCase('touch drag outside and release', async () => {
    await reloadGame();
    const p = await arenaPoint();
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{...p,id:1}] });
    await until(async () => (await hitCount()) === 1, 'drag first hit');
    await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{x:2,y:2,id:1}] });
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const before = await hitCount();
    await delay(500);
    assert.equal(await hitCount(), before, 'releasing outside arena must stop repeat');
  });
  await send('Emulation.setTouchEmulationEnabled', { enabled: false });

  await checkCase('background and return', async () => {
    await reloadGame();
    const p = await arenaPoint();
    const current = await send('Target.getTargetInfo');
    let other;
    try {
      await mouse('mousePressed', p);
      await until(async () => (await hitCount()) >= 1, 'background first hit');
      other = await send('Target.createTarget', { url:'about:blank', background:false });
      await send('Target.activateTarget', { targetId:other.targetId });
      let hidden = false;
      const deadline = Date.now()+2500;
      while (Date.now()<deadline) {
        if (await evaluate('document.hidden')) { hidden=true; break; }
        await delay(100);
      }
      if (!hidden) {
        console.log('PLAYTEST_SKIP background: headless Chrome did not hide the original tab');
        return false;
      }
      const before = await hitCount();
      await delay(700);
      await send('Target.activateTarget', { targetId:current.targetInfo.targetId });
      await until(async () => !(await evaluate('document.hidden')), 'return from background');
      await delay(450);
      assert.equal(await hitCount(), before, 'background return must not resume held input or catch up');
    } finally {
      await send('Target.activateTarget', { targetId:current.targetInfo.targetId });
      if (other) await send('Target.closeTarget', { targetId:other.targetId });
      await mouse('mouseReleased', p);
    }
  });

  const stressDuration = Number(process.env.PLAYTEST_DURATION_MS || 0);
  if (stressDuration > 0) {
    assert.ok(Number.isFinite(stressDuration) && stressDuration <= 120000, 'stress duration must be at most two minutes');
    await checkCase('continuous normal-effects play', async () => {
      await evaluate('localStorage.clear()');
      await reloadGame();
      const p = await arenaPoint();
      const began = Date.now();
      let rounds = 0;
      let maxEffects = 0;
      while (Date.now()-began < stressDuration) {
        await mouse('mousePressed', p);
        await until(async () => {
          const sample = await evaluate(`({value:Number(document.querySelector('[role="progressbar"]').getAttribute('aria-valuenow')),effects:document.querySelector('.fx-layer').childElementCount})`);
          maxEffects = Math.max(maxEffects, sample.effects);
          assert.ok(sample.effects <= 36, 'effect node limit');
          return sample.value === 0;
        }, 'stress round defeat', 6000);
        await mouse('mouseReleased', p);
        rounds += 1;
        if (rounds === 1) await screenshot('normal-effects-takeover');
        await until(async () => (await state()).value === 100, 'stress reboot', 4000);
      }
      await delay(800);
      assert.equal(await evaluate("document.querySelector('.fx-layer').childElementCount"), 0, 'effects must clean up');
      const hits = await hitCount();
      assert.equal(hits, rounds*25, 'each round must count exactly 25 hits');
      console.log('PLAYTEST_STRESS ' + JSON.stringify({durationMs:Date.now()-began, rounds,hits,maxEffects}));
    });
  }
  assert.deepEqual(exceptions, [], 'uncaught browser exceptions during extended play');
  assert.deepEqual(playtestFailures, [], 'extended playtest failures');

  console.log('Chrome smoke passed: boot, click, Space, hold, reboot, settings, persistence and mobile width.');
} finally {
  for (const item of pending.values()) clearTimeout(item.timer);
  for (const item of eventWaiters.values()) clearTimeout(item.timer);
  socket?.close();
  await Promise.all([stop(browser), stop(server)]);
  try { await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
  catch (error) { console.warn('Could not remove temporary Chrome profile: ' + error.message); }
}
