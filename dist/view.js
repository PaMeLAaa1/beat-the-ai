let instanceCount = 0;

const HIT_WORDS = ["咚！", "再嘴硬？", "人工介入！", "啪！", "轮到我了"];
const MOOD_LABELS = { smug: "自信过载", nervous: "开始心虚", glitch: "系统失控" };
const MAX_EFFECTS = 36;
const FIST = '<svg viewBox="0 0 90 86" aria-hidden="true"><path d="M25 69 14 52c-5-9-5-19 1-24l8-5 1-11c1-6 10-8 14-3 4-8 14-8 18 0 6-5 15-2 16 5 8-1 13 5 12 12l-3 23-15 21Z" fill="#ff7847" stroke="#13212b" stroke-width="5" stroke-linejoin="round"/><path d="m24 23 1 19m14-29 1 23m16-22 1 20m14-14-1 17M15 34c9-8 24-2 24 9l-1 7" fill="none" stroke="#13212b" stroke-width="4" stroke-linecap="round"/><path d="m25 64 42-2 6 14-43 7Z" fill="#fff6df" stroke="#13212b" stroke-width="5" stroke-linejoin="round"/></svg>';

function number(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

export function createView(target) {
  if (!target || typeof target.querySelector !== "function") {
    throw new TypeError("createView requires an arena element.");
  }
  const doc = target.ownerDocument;
  const patternId = "ai-scan-" + (++instanceCount);
  let disposed = false;
  let reduced = Boolean(doc.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  let hitAnimation = null;
  let shakeAnimation = null;
  let textAnimation = null;
  let lastLineId = null;
  let lastLine = null;
  let lastState = {};
  let hitSequence = 0;
  const effects = new Map();

  target.dataset.phase = "active";
  target.dataset.mood = "smug";
  target.dataset.reducedMotion = String(reduced);
  target.innerHTML = [
    '<div class="arena-status">',
      '<div class="enemy-name"><span class="ai-token">AI</span><strong>全自动超级员工</strong><span class="model-version">v.∞</span></div>',
      '<span class="state-indicator"><i></i><span data-readout>自信过载</span></span>',
    '</div>',
    '<div class="replacement-plan">',
      '<div class="plan-heading"><span>取代人类计划</span><strong><span data-percent>100</span><small>%</small></strong></div>',
      '<div class="plan-track" role="progressbar" aria-label="AI 虚构的取代计划进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100" aria-valuetext="虚构计划进度 100%，点击可击退"><span class="plan-fill"></span><span class="plan-segments"></span></div>',
    '</div>',
    '<div class="machine-stage">',
      '<div class="target-ring" aria-hidden="true"></div>',
      '<span class="float-tag tag-left" aria-hidden="true"><span>24/7</span> 全年无休</span>',
      '<span class="float-tag tag-right" aria-hidden="true">工资 <span>¥0</span></span>',
      '<span class="stage-coordinate coordinate-left" aria-hidden="true">TARGET_01</span>',
      '<span class="stage-coordinate coordinate-right" aria-hidden="true">CONFIDENCE: ∞</span>',
      '<div class="machine-float"><div class="machine">',
        '<svg class="machine-svg" viewBox="0 0 360 306" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">',
          '<defs><pattern id="' + patternId + '" width="4" height="5" patternUnits="userSpaceOnUse"><path d="M0 1h4" stroke="#14231d" stroke-opacity=".09" stroke-width="1"/></pattern></defs>',
          '<ellipse class="machine-shadow" cx="180" cy="285" rx="108" ry="13" fill="#061017" opacity=".58"/>',
          '<g class="machine-part part-stand" stroke="#14212b" stroke-width="5" stroke-linejoin="round"><path d="M146 239h68l13 39h-94Z" fill="#ff7847"/><rect x="108" y="271" width="144" height="22" rx="8" fill="#fff6df"/><path d="M156 248h46" stroke="#cf5134"/></g>',
          '<g class="machine-part part-antenna" stroke="#14212b" stroke-width="5"><path d="M180 67V34" stroke="#fff6df" stroke-width="9"/><circle cx="180" cy="25" r="13" fill="#ff7847"/><circle class="antenna-glint" cx="176" cy="21" r="4" fill="#fff6df" stroke="none"/></g>',
          '<g class="machine-part part-left" stroke="#14212b" stroke-width="5"><rect x="34" y="125" width="31" height="71" rx="12" fill="#ff7847"/><path d="M43 141v34" stroke="#fff6df" stroke-width="3"/></g>',
          '<g class="machine-part part-right" stroke="#14212b" stroke-width="5"><rect x="295" y="125" width="31" height="71" rx="12" fill="#ff7847"/><path d="M317 141v34" stroke="#cf5134" stroke-width="3"/></g>',
          '<g class="machine-part part-shell">',
            '<rect x="55" y="65" width="252" height="190" rx="33" fill="#99a89e" stroke="#14212b" stroke-width="5"/>',
            '<rect x="52" y="58" width="252" height="190" rx="33" fill="#fff6df" stroke="#14212b" stroke-width="5"/>',
            '<path d="M72 78q0-8 12-8h188" fill="none" stroke="#fffdf7" stroke-width="5" stroke-linecap="round"/>',
            '<g class="machine-part part-screen">',
              '<rect class="crt-screen" x="74" y="82" width="208" height="130" rx="17" fill="#caff4c" stroke="#14212b" stroke-width="5"/>',
              '<rect x="77" y="85" width="202" height="124" rx="14" fill="url(#' + patternId + ')"/>',
              '<text x="89" y="102" class="screen-caption" font-family="monospace" font-size="8" letter-spacing="1">AI / AUTO WORKER</text>',
              '<circle class="screen-led" cx="266" cy="98" r="3" fill="currentColor"/>',
              '<g class="face face-smug" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">',
                '<path d="m110 126 28 9m80 0 28-9"/>',
                '<g class="blink-eyes"><path d="M114 147h23m85 0h23" stroke-width="9"/></g>',
                '<path d="M145 168q35 23 73-4l-5 25q-32 22-62-1Z" fill="#fffdf0"/>',
                '<path d="M149 179q31 19 65-3" stroke-width="3"/>',
                '<path d="m102 164 6-3m141 2 6 3" stroke-width="3"/>',
              '</g>',
              '<g class="face face-nervous" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round">',
                '<path d="m110 128 25-9m82 0 26 9"/>',
                '<circle cx="124" cy="150" r="13" fill="#fffdf0"/><circle cx="231" cy="150" r="13" fill="#fffdf0"/>',
                '<circle cx="128" cy="152" r="4" fill="#14212b" stroke="none"/><circle cx="227" cy="152" r="4" fill="#14212b" stroke="none"/>',
                '<path d="M159 188q21-14 42 0"/>',
                '<path d="M258 118c0 0-8 13-8 18a8 8 0 0 0 16 0c0-5-8-18-8-18Z" fill="#89d8ff" stroke-width="3"/>',
              '</g>',
              '<g class="face face-glitch" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="square">',
                '<path d="m110 137 27 24m0-24-27 24m107-24 27 24m0-24-27 24"/>',
                '<path d="M145 180h13v12h13v-12h14v12h14v-12h13" stroke-width="5"/>',
                '<g class="glitch-bars" stroke="none"><rect x="87" y="115" width="51" height="5" fill="#ff7847"/><rect x="216" y="171" width="49" height="5" fill="#caff4c"/><rect x="159" y="131" width="30" height="3" fill="#fff6df"/></g>',
              '</g>',
              '<path class="screen-crack" d="m212 83-15 33 18 15-30 31 13 16-17 34m34-81 30-9" fill="none" stroke="#fff6df" stroke-width="3" stroke-linejoin="bevel"/>',
            '</g>',
            '<path d="M80 229h31m-31 7h31" fill="none" stroke="#79827b" stroke-width="3" stroke-linecap="round"/>',
            '<text x="131" y="235" font-family="monospace" font-size="8" letter-spacing="1.5" fill="#14212b">SUPER EMPLOYEE</text>',
            '<circle cx="272" cy="231" r="6" fill="#ff7847" stroke="#14212b" stroke-width="3"/>',
          '</g>',
          '<g class="loose-chip chip-one"><path d="M89 117h18v18H89Z" fill="#caff4c" stroke="#14212b" stroke-width="4"/><path d="M93 113v-6m10 6v-6m-10 32v6m10-6v6" stroke="#fff6df" stroke-width="3"/></g>',
          '<g class="loose-chip chip-two"><path d="M246 176h21v13h-21Z" fill="#ff7847" stroke="#14212b" stroke-width="4"/></g>',
          '<g class="loose-chip chip-three"><path d="m127 206 15-8 7 13-15 8Z" fill="#fff6df" stroke="#14212b" stroke-width="4"/></g>',
        '</svg>',
      '</div></div>',
      '<div class="takeover" aria-hidden="true"><span class="takeover-kicker">HUMAN OVERRIDE</span><strong class="takeover-title">人工接管</strong><span class="takeover-note">控制权，回到你手里。</span></div>',
      '<span class="tap-hint" aria-hidden="true">点它，别客气 <span>↗</span></span>',
    '</div>',
    '<div class="ai-speech"><span class="speech-label"><span></span> AI 说</span><p><span class="speech-copy">你的工作，我已经学会了。</span><span class="typing-cursor" aria-hidden="true">▌</span></p></div>',
    '<div class="game-stats">',
      '<div class="stat stat-combo"><span class="stat-label">连击 <small>COMBO</small></span><strong><span data-combo>0</span><small>×</small></strong></div>',
      '<div class="stat"><span class="stat-label">已接管</span><strong><span data-rounds>0</span><small>次</small></strong></div>',
      '<div class="stat"><span class="stat-label">累计拳数</span><strong data-hits>0</strong></div>',
    '</div>',
    '<div class="fx-layer" aria-hidden="true"></div>',
    '<span class="sr-only phase-announcer" role="status" aria-live="polite"></span>'
  ].join("");

  const find = selector => target.querySelector(selector);
  const refs = {
    readout: find("[data-readout]"), percent: find("[data-percent]"),
    track: find(".plan-track"), fill: find(".plan-fill"),
    machine: find(".machine"), stage: find(".machine-stage"),
    speech: find(".speech-copy"), combo: find("[data-combo]"),
    comboStat: find(".stat-combo"), rounds: find("[data-rounds]"),
    hits: find("[data-hits]"), title: find(".takeover-title"),
    kicker: find(".takeover-kicker"), note: find(".takeover-note"),
    announcer: find(".phase-announcer"), fx: find(".fx-layer")
  };
  function cancelAnimation(animation) {
    if (!animation) return;
    try { animation.cancel(); } catch {}
  }
  function setLine(id, text) {
    const nextId = String(id ?? "");
    const nextText = String(text ?? "");
    if (lastLineId === nextId && lastLine === nextText) return;
    lastLineId = nextId;
    lastLine = nextText;
    cancelAnimation(textAnimation);
    textAnimation = null;
    refs.speech.textContent = nextText;
    if (!reduced && nextText && typeof refs.speech.animate === "function") {
      textAnimation = refs.speech.animate(
        [{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }],
        { duration: Math.min(550, nextText.length * 25),
          easing: "steps(" + Math.max(1, nextText.length) + ", end)" }
      );
    }
  }
  function removeEffect(node) {
    const record = effects.get(node);
    if (!record) return;
    effects.delete(node);
    if (record.timer) clearTimeout(record.timer);
    if (record.animation) {
      record.animation.onfinish = null;
      record.animation.oncancel = null;
      cancelAnimation(record.animation);
    }
    node.remove();
  }
  function clearEffects() {
    for (const node of Array.from(effects.keys())) removeEffect(node);
  }
  function transient(className, x, y, content, frames, options, html = false) {
    while (effects.size >= MAX_EFFECTS) removeEffect(effects.keys().next().value);
    const node = doc.createElement("span");
    node.className = className;
    node.style.left = (x * 100) + "%";
    node.style.top = (y * 100) + "%";
    if (html) node.innerHTML = content;
    else node.textContent = content;
    refs.fx.append(node);
    const record = { animation: null, timer: null };
    effects.set(node, record);
    if (typeof node.animate === "function") {
      record.animation = node.animate(frames, { ...options, fill: "both" });
      record.animation.onfinish = () => removeEffect(node);
      record.animation.oncancel = () => removeEffect(node);
    }
    record.timer = setTimeout(() => removeEffect(node),
      number(options.duration, 300) + number(options.delay) + 80);
    return node;
  }
  function particles(x, y, count, intensity) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = 28 + Math.random() * 40 + intensity * 26;
      const dx = Math.cos(angle) * distance;
      const dy = Math.sin(angle) * distance - 12;
      transient("hit-particle particle-" + (i % 3), x, y, "", [
        { transform: "translate(-50%, -50%) rotate(0deg) scale(1)", opacity: 1 },
        { transform: "translate(calc(-50% + " + dx + "px), calc(-50% + " + dy + "px)) rotate(" + (140 + i * 43) + "deg) scale(.4)", opacity: 0 }
      ], { duration: 280 + Math.random() * 130, easing: "cubic-bezier(.12,.65,.3,1)" });
    }
  }
  function render(state) {
    if (disposed || !state) return;
    const phase = ["active", "broken", "rebooting"].includes(state.phase) ? state.phase : "active";
    const mood = ["smug", "nervous", "glitch"].includes(state.mood) ? state.mood : "smug";
    const replacement = clamp(number(state.replacement, 100), 0, 100);
    const combo = Math.max(0, Math.floor(number(state.combo)));
    const hits = Math.max(0, Math.floor(number(state.totalHits)));
    const rounds = Math.max(0, Math.floor(number(state.round, 1)) - 1 + (phase === "active" ? 0 : 1));
    if (phase !== lastState.phase) {
      target.dataset.phase = phase;
      const rebooting = phase === "rebooting";
      refs.title.textContent = rebooting ? "正在重启" : "人工接管";
      refs.kicker.textContent = rebooting ? "REBOOTING EGO…" : "HUMAN OVERRIDE";
      refs.note.textContent = rebooting ? "正在重新加载嘴硬模块…" : "控制权，回到你手里。";
      refs.announcer.textContent = phase === "broken" ? "AI 已崩溃，人工接管。"
        : rebooting ? "AI 正在重启。"
          : lastState.phase ? "AI 已重启，可以继续攻击。" : "AI 已上线。点击或按住攻击。";
    }
    if (mood !== lastState.mood) target.dataset.mood = mood;
    if (phase !== lastState.phase || mood !== lastState.mood) {
      refs.readout.textContent = phase === "broken" ? "人工接管"
        : phase === "rebooting" ? "嘴硬重启中" : MOOD_LABELS[mood];
    }
    if (replacement !== lastState.replacement) {
      refs.fill.style.width = replacement + "%";
      refs.percent.textContent = String(Math.round(replacement));
      refs.track.setAttribute("aria-valuenow", String(replacement));
      refs.track.setAttribute("aria-valuetext", "虚构计划进度 " + Math.round(replacement) + "%，点击可击退");
    }
    if (combo !== lastState.combo) {
      refs.combo.textContent = String(combo);
      refs.comboStat.classList.toggle("is-hot", combo >= 10);
    }
    if (hits !== lastState.hits) {
      refs.hits.textContent = String(hits);
      target.dataset.touched = String(hits > 0);
    }
    if (rounds !== lastState.rounds) refs.rounds.textContent = String(rounds);
    setLine(state.lineId, state.line);
    lastState = { phase, mood, replacement, combo, hits, rounds };
  }
  function effect(event) {
    if (disposed || !event) return;
    if (event.type === "line") { setLine(event.lineId, event.text); return; }
    if (event.type === "hit") {
      hitSequence += 1;
      cancelAnimation(textAnimation);
      textAnimation = null;
      const x = clamp(number(event.x, 0.5), 0.12, 0.88);
      const y = clamp(number(event.y, 0.5), 0.16, 0.82);
      const intensity = clamp(number(event.intensity, 0.3), 0, 1);
      const direction = x < 0.5 ? 1 : -1;
      cancelAnimation(hitAnimation);
      cancelAnimation(shakeAnimation);
      hitAnimation = null;
      shakeAnimation = null;
      if (reduced) {
        transient("hit-word reduced-hit", x, y, "命中", [{ opacity: 1 }, { opacity: 0 }], { duration: 220 });
        return;
      }
      if (typeof refs.machine.animate === "function") {
        hitAnimation = refs.machine.animate([
          { transform: "translate(0, 0) rotate(0) scale(1)" },
          { transform: "translate(" + (direction * (7 + intensity * 7)) + "px, 4px) rotate(" + (direction * 4) + "deg) scale(.94, 1.04)", offset: 0.22 },
          { transform: "translate(" + (-direction * 3) + "px, -2px) rotate(" + (-direction * 1.5) + "deg) scale(1.02, .98)", offset: 0.65 },
          { transform: "translate(0, 0) rotate(0) scale(1)" }
        ], { duration: 230, easing: "cubic-bezier(.2,.8,.3,1)" });
        if (intensity > 0.45) {
          shakeAnimation = refs.stage.animate([
            { transform: "translate(0, 0)" }, { transform: "translate(2px, -2px)" },
            { transform: "translate(-2px, 1px)" }, { transform: "translate(0, 0)" }
          ], { duration: 110 });
        }
      }
      transient("hit-ring", x, y, "", [
        { transform: "translate(-50%, -50%) scale(.3)", opacity: 0.95 },
        { transform: "translate(-50%, -50%) scale(1.5)", opacity: 0 }
      ], { duration: 260, easing: "ease-out" });
      transient("punch-fist", x, y, FIST, [
        { transform: "translate(-42%, -25%) rotate(" + (direction * -20) + "deg) scale(1.35)", opacity: 0 },
        { transform: "translate(-50%, -50%) rotate(" + (direction * -10) + "deg) scale(.95)", opacity: 1, offset: 0.2 },
        { transform: "translate(-50%, -42%) rotate(" + (direction * -4) + "deg) scale(.8)", opacity: 0 }
      ], { duration: 250, easing: "ease-out" }, true);
      if (hitSequence % 2 === 1 || number(event.combo) % 10 === 0) {
        const word = number(event.combo) > 0 && number(event.combo) % 10 === 0
          ? String(event.combo) + " 连击！" : HIT_WORDS[hitSequence % HIT_WORDS.length];
        transient("hit-word", x, Math.max(0.13, y - 0.08), word, [
          { transform: "translate(-50%, -50%) rotate(-9deg) scale(.7)", opacity: 1 },
          { transform: "translate(-50%, -70%) rotate(-9deg) scale(1.1)", opacity: 1, offset: 0.3 },
          { transform: "translate(-50%, -110%) rotate(-5deg) scale(1)", opacity: 0 }
        ], { duration: 400, easing: "ease-out" });
      }
      particles(x, y, intensity > 0.6 ? 5 : 3, intensity);
      return;
    }
    if (event.type === "phase" && event.phase === "broken") {
      cancelAnimation(hitAnimation);
      cancelAnimation(shakeAnimation);
      hitAnimation = null;
      shakeAnimation = null;
      clearEffects();
      if (!reduced) {
        transient("hit-ring break-ring", 0.5, 0.45, "", [
          { transform: "translate(-50%, -50%) scale(.4)", opacity: 1 },
          { transform: "translate(-50%, -50%) scale(3.8)", opacity: 0 }
        ], { duration: 460, easing: "ease-out" });
        particles(0.5, 0.45, 10, 1);
      }
    }
  }
  function setReducedMotion(enabled) {
    if (disposed) return;
    reduced = Boolean(enabled);
    target.dataset.reducedMotion = String(reduced);
    if (reduced) {
      cancelAnimation(hitAnimation);
      cancelAnimation(shakeAnimation);
      cancelAnimation(textAnimation);
      hitAnimation = shakeAnimation = textAnimation = null;
      clearEffects();
    }
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    clearEffects();
    cancelAnimation(hitAnimation);
    cancelAnimation(shakeAnimation);
    cancelAnimation(textAnimation);
    target.replaceChildren();
    for (const key of ["phase", "mood", "reducedMotion", "touched"]) delete target.dataset[key];
  }
  return { render, effect, setReducedMotion, dispose };
}
