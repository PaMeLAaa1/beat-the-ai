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
  console.log('Chrome smoke passed: boot, click, Space, hold, reboot, settings, persistence and mobile width.');
} finally {
  for (const item of pending.values()) clearTimeout(item.timer);
  for (const item of eventWaiters.values()) clearTimeout(item.timer);
  socket?.close();
  await Promise.all([stop(browser), stop(server)]);
  try { await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
  catch (error) { console.warn('Could not remove temporary Chrome profile: ' + error.message); }
}
