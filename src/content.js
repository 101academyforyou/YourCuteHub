// YourCuteHub content script：在每個網頁角落放一隻會給你情緒價值的小可愛。
// UI 放在 Shadow DOM 裡，不會被網頁的 CSS 影響，也不會弄亂網頁。

(() => {
  if (window.top !== window || window.__yourCuteHubLoaded) return;
  window.__yourCuteHubLoaded = true;

  const REACTION_COOLDOWN = 90 * 1000; // 行為回饋之間至少間隔 90 秒，避免太吵
  const IDLE_AFTER = 5 * 60 * 1000; // 5 分鐘沒動作視為離開
  const AWAY_RESET = 10 * 60 * 1000; // 離開 10 分鐘以上，連續使用時間歸零
  const WELCOME_BACK_AFTER = 30 * 60 * 1000;
  const TYPING_THRESHOLD = 300;

  let settings = { ...CUTE_DEFAULTS };
  let host = null;
  let ui = null;
  let hideTimer = null;
  let tickTimer = null;
  let dismissed = false; // 使用者在這個分頁按了 ×
  let typedCount = 0;
  let readDoneShown = false;
  let lastInteraction = Date.now();

  // ---------- 小工具 ----------

  // 擴充功能被重新載入/移除後，舊的 content script 會失去 chrome API。
  function alive() {
    try {
      return Boolean(chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  }

  function shutdown() {
    clearInterval(tickTimer);
    unmount();
  }

  const local = {
    get(keys) {
      return new Promise((resolve) => {
        if (!alive()) return resolve({});
        chrome.storage.local.get(keys, resolve);
      });
    },
    set(obj) {
      return new Promise((resolve) => {
        if (!alive()) return resolve();
        chrome.storage.local.set(obj, resolve);
      });
    },
  };

  function timeCategory(date = new Date()) {
    const h = date.getHours();
    if (h >= 5 && h < 11) return "morning";
    if (h >= 11 && h < 14) return "noon";
    if (h >= 14 && h < 18) return "afternoon";
    if (h >= 18 && h < 23) return "evening";
    return "night";
  }

  function isLateNight() {
    const h = new Date().getHours();
    return h >= 23 || h < 5;
  }

  function siteDisabled() {
    return settings.disabledSites.includes(location.hostname);
  }

  function shouldShow() {
    return settings.enabled && !siteDisabled() && !dismissed;
  }

  function isEditable(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    if (el.tagName === "TEXTAREA") return true;
    if (el.tagName === "INPUT") {
      const t = (el.type || "text").toLowerCase();
      return ["text", "search", "email", "url", "tel", ""].includes(t);
    }
    return false;
  }

  function mediaPlaying() {
    return [...document.querySelectorAll("video, audio")].some((m) => !m.paused && !m.ended);
  }

  // ---------- 說話 ----------

  async function say(category, { force = false, cooldown = REACTION_COOLDOWN } = {}) {
    if (!alive()) return shutdown(), false;
    if (!shouldShow() || !ui) return false;
    const now = Date.now();
    const { lastShownAt = 0, totalCount = 0 } = await local.get(["lastShownAt", "totalCount"]);
    if (!force && now - lastShownAt < cooldown) return false;
    await local.set({ lastShownAt: now, totalCount: totalCount + 1 });
    showBubble(cutePick(category, settings.nickname));
    return true;
  }

  function showBubble(text) {
    if (!ui) return;
    const { bubble, bubbleText } = ui;
    bubbleText.textContent = text;
    bubble.classList.remove("show");
    void bubble.offsetWidth; // 重新觸發動畫
    bubble.classList.add("show");
    ui.mascot.classList.add("talk");
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hideBubble, Math.min(9000, 3500 + text.length * 120));
  }

  function hideBubble() {
    if (!ui) return;
    ui.bubble.classList.remove("show");
    ui.mascot.classList.remove("talk");
  }

  function burstHearts() {
    if (!ui) return;
    const icons = ["💖", "💕", "✨", "🌸", "💗", "⭐"];
    for (let i = 0; i < 8; i++) {
      const s = document.createElement("span");
      s.className = "heart";
      s.textContent = icons[Math.floor(Math.random() * icons.length)];
      s.style.setProperty("--dx", `${Math.round((Math.random() - 0.5) * 120)}px`);
      s.style.setProperty("--dy", `${Math.round(-70 - Math.random() * 70)}px`);
      s.style.setProperty("--rot", `${Math.round((Math.random() - 0.5) * 60)}deg`);
      s.style.animationDelay = `${i * 40}ms`;
      ui.hearts.appendChild(s);
      setTimeout(() => s.remove(), 1400);
    }
  }

  // ---------- UI ----------

  const STYLE = `
    :host { all: initial; }
    .wrap {
      position: fixed;
      bottom: var(--bottom, 24px);
      z-index: 2147483646;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 8px;
      font-family: -apple-system, BlinkMacSystemFont, "PingFang TC", "Noto Sans TC",
        "Microsoft JhengHei", "Segoe UI", sans-serif;
      pointer-events: none;
    }
    .wrap.right { right: 20px; }
    .wrap.left { left: 20px; align-items: flex-start; }
    .wrap.hidden { display: none; }

    .bubble {
      pointer-events: auto;
      position: relative;
      max-width: 240px;
      padding: 12px 16px;
      border-radius: 18px;
      background: #fff;
      color: #5b3a4a;
      font-size: 14px;
      line-height: 1.55;
      letter-spacing: 0.02em;
      box-shadow: 0 8px 28px rgba(232, 104, 150, 0.28), 0 0 0 2px #ffd3e2;
      cursor: pointer;
      opacity: 0;
      transform: translateY(8px) scale(0.92);
      transform-origin: bottom right;
      transition: opacity 0.25s ease, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      visibility: hidden;
    }
    .left .bubble { transform-origin: bottom left; }
    .bubble.show { opacity: 1; transform: none; visibility: visible; }
    .bubble::after {
      content: "";
      position: absolute;
      bottom: -7px;
      right: 26px;
      width: 14px;
      height: 14px;
      background: #fff;
      transform: rotate(45deg);
      box-shadow: 2px 2px 0 0 #ffd3e2;
    }
    .left .bubble::after { right: auto; left: 26px; }

    .mascot-box { position: relative; pointer-events: auto; }
    .mascot {
      width: 62px;
      height: 62px;
      border: none;
      border-radius: 50%;
      background: radial-gradient(circle at 35% 30%, #fff6fa 0%, #ffd6e6 55%, #ffb8d2 100%);
      box-shadow: 0 6px 18px rgba(232, 104, 150, 0.35), inset 0 -4px 8px rgba(255, 255, 255, 0.6);
      font-size: 34px;
      line-height: 62px;
      text-align: center;
      cursor: grab;
      user-select: none;
      touch-action: none;
      padding: 0;
      animation: bob 3.2s ease-in-out infinite;
      transition: transform 0.2s ease;
    }
    .mascot:hover { transform: scale(1.08) rotate(-4deg); }
    .mascot:focus-visible { outline: 3px solid #ff8fb8; outline-offset: 3px; }
    .mascot.talk { animation: bob 3.2s ease-in-out infinite, wiggle 0.6s ease-in-out 2; }
    .mascot.squish { animation: squish 0.45s ease; }
    .mascot.dragging { cursor: grabbing; animation: none; transform: scale(1.12); }

    .close {
      position: absolute;
      top: -4px;
      right: -4px;
      width: 20px;
      height: 20px;
      border: none;
      border-radius: 50%;
      background: #fff;
      color: #c0738f;
      font-size: 13px;
      line-height: 20px;
      text-align: center;
      padding: 0;
      cursor: pointer;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
      opacity: 0;
      transition: opacity 0.2s ease;
    }
    .left .close { right: auto; left: -4px; }
    .mascot-box:hover .close, .close:focus-visible { opacity: 1; }

    .hearts { position: absolute; left: 50%; top: 50%; width: 0; height: 0; }
    .heart {
      position: absolute;
      font-size: 18px;
      transform: translate(-50%, -50%);
      animation: float-up 1.2s ease-out forwards;
      pointer-events: none;
    }

    @keyframes bob { 0%, 100% { translate: 0 0; } 50% { translate: 0 -6px; } }
    @keyframes wiggle { 0%, 100% { rotate: 0deg; } 25% { rotate: -10deg; } 75% { rotate: 10deg; } }
    @keyframes squish {
      0% { transform: scale(1); } 30% { transform: scale(1.2, 0.8); }
      60% { transform: scale(0.9, 1.12); } 100% { transform: scale(1); }
    }
    @keyframes float-up {
      0% { opacity: 0; transform: translate(-50%, -50%) scale(0.4); }
      20% { opacity: 1; }
      100% {
        opacity: 0;
        transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(1.2) rotate(var(--rot));
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .mascot, .mascot.talk { animation: none; }
      .heart { animation-duration: 0.01s; }
    }
    @media print { .wrap { display: none; } }
  `;

  function mount() {
    if (host || !document.body) return;
    host = document.createElement("yourcutehub-root");
    const shadow = host.attachShadow({ mode: "closed" });
    shadow.innerHTML = `
      <style>${STYLE}</style>
      <div class="wrap">
        <div class="bubble" role="status" aria-live="polite" title="點一下關閉">
          <span class="bubble-text"></span>
        </div>
        <div class="mascot-box">
          <button class="mascot" type="button" aria-label="摸摸小可愛"></button>
          <button class="close" type="button" aria-label="在這個分頁先藏起來" title="在這個分頁先藏起來">×</button>
          <div class="hearts"></div>
        </div>
      </div>
    `;
    ui = {
      wrap: shadow.querySelector(".wrap"),
      bubble: shadow.querySelector(".bubble"),
      bubbleText: shadow.querySelector(".bubble-text"),
      mascot: shadow.querySelector(".mascot"),
      close: shadow.querySelector(".close"),
      hearts: shadow.querySelector(".hearts"),
    };
    ui.bubble.addEventListener("click", hideBubble);
    ui.close.addEventListener("click", () => {
      dismissed = true;
      unmount();
    });
    setupMascotPointer();
    document.documentElement.appendChild(host);
    applyAppearance();
  }

  function unmount() {
    clearTimeout(hideTimer);
    if (host) host.remove();
    host = null;
    ui = null;
  }

  async function applyAppearance() {
    if (!ui) return;
    const mascot = CUTE_MASCOTS[settings.mascot] || CUTE_MASCOTS.cat;
    ui.mascot.textContent = mascot.emoji;
    ui.mascot.title = `${mascot.name}：點我會有驚喜，可以拖曳移動`;
    ui.wrap.classList.toggle("left", settings.position === "left");
    ui.wrap.classList.toggle("right", settings.position !== "left");
    const { bottomOffset } = await local.get("bottomOffset");
    if (ui && typeof bottomOffset === "number") {
      ui.wrap.style.setProperty("--bottom", `${clampBottom(bottomOffset)}px`);
    }
    syncFullscreen();
  }

  function syncFullscreen() {
    if (ui) ui.wrap.classList.toggle("hidden", Boolean(document.fullscreenElement));
  }

  function clampBottom(v) {
    return Math.max(8, Math.min(window.innerHeight - 90, v));
  }

  // 點擊 = 摸摸頭；拖曳 = 換位置（左右會自動貼邊）。
  function setupMascotPointer() {
    const btn = ui.mascot;
    let start = null;
    let dragging = false;

    btn.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      start = { x: e.clientX, y: e.clientY };
      dragging = false;
      btn.setPointerCapture(e.pointerId);
    });

    btn.addEventListener("pointermove", (e) => {
      if (!start || !ui) return;
      if (!dragging && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6) {
        dragging = true;
        btn.classList.add("dragging");
        hideBubble();
      }
      if (dragging) {
        ui.wrap.style.setProperty("--bottom", `${clampBottom(window.innerHeight - e.clientY - 31)}px`);
        const left = e.clientX < window.innerWidth / 2;
        ui.wrap.classList.toggle("left", left);
        ui.wrap.classList.toggle("right", !left);
      }
    });

    btn.addEventListener("pointerup", async (e) => {
      if (!start || !ui) return;
      start = null;
      if (dragging) {
        dragging = false;
        btn.classList.remove("dragging");
        const position = ui.wrap.classList.contains("left") ? "left" : "right";
        const bottomOffset = clampBottom(window.innerHeight - e.clientY - 31);
        await local.set({ bottomOffset });
        if (position !== settings.position && alive()) cuteSaveSettings({ position });
        return;
      }
      btn.classList.remove("squish");
      void btn.offsetWidth;
      btn.classList.add("squish");
      burstHearts();
      say("click", { force: true });
    });

    btn.addEventListener("pointercancel", () => {
      start = null;
      dragging = false;
      btn.classList.remove("dragging");
    });

    btn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        burstHearts();
        say("click", { force: true });
      }
    });
  }

  // ---------- 行為偵測 ----------

  function markInteraction() {
    lastInteraction = Date.now();
  }

  function onKeydown(e) {
    markInteraction();
    // 只算真正輸入的字（含中文輸入法的 "Process"），不算方向鍵、Ctrl 等。
    if (!settings.reactions || (e.key.length !== 1 && e.key !== "Process")) return;
    const target = e.composedPath ? e.composedPath()[0] : e.target;
    if (!isEditable(target)) return;
    typedCount++;
    if (typedCount >= TYPING_THRESHOLD) {
      typedCount = 0;
      say("typing");
    }
  }

  function onCopy() {
    if (settings.reactions) say("copy");
  }

  function onSubmit() {
    if (settings.reactions) say("submit", { cooldown: 20 * 1000 });
  }

  function onScroll() {
    markInteraction();
    if (!settings.reactions || readDoneShown) return;
    const doc = document.documentElement;
    const height = Math.max(doc.scrollHeight, document.body ? document.body.scrollHeight : 0);
    if (height < window.innerHeight * 3) return; // 只有長文章才算
    if (window.scrollY + window.innerHeight >= height - 200) {
      readDoneShown = true;
      say("readDone");
    }
  }

  // ---------- 每分鐘的心跳 ----------

  async function tick() {
    if (!alive()) return shutdown();
    if (document.visibilityState !== "visible" || !document.hasFocus()) return;

    const now = Date.now();
    const engaged = now - lastInteraction < IDLE_AFTER || mediaPlaying();
    if (!engaged) return;

    const state = await local.get(["activeMinutes", "lastActiveAt", "lastNightAt"]);
    const away = now - (state.lastActiveAt || 0);
    let activeMinutes = away > AWAY_RESET ? 0 : (state.activeMinutes || 0) + 1;

    if (away > WELCOME_BACK_AFTER && state.lastActiveAt) {
      await say("welcomeBack", { force: true });
    } else if (settings.restReminder > 0 && activeMinutes >= settings.restReminder) {
      if (await say("rest", { force: true })) activeMinutes = 0;
    } else if (settings.nightOwl && isLateNight() && now - (state.lastNightAt || 0) > 60 * 60 * 1000) {
      if (await say("night", { force: true })) await local.set({ lastNightAt: now });
    } else if (settings.frequency > 0) {
      const category = Math.random() < 0.3 ? timeCategory() : "encourage";
      await say(category, { cooldown: settings.frequency * 60 * 1000 });
    }

    await local.set({ activeMinutes, lastActiveAt: now });
  }

  // 剛打開網頁時打聲招呼（受頻率限制，不會每頁都講話）。
  async function greet() {
    if (!shouldShow() || settings.frequency <= 0) return;
    const { lastActiveAt } = await local.get("lastActiveAt");
    if (lastActiveAt && Date.now() - lastActiveAt > WELCOME_BACK_AFTER) {
      await say("welcomeBack", { force: true });
      await local.set({ lastActiveAt: Date.now(), activeMinutes: 0 });
    } else {
      await say(isLateNight() && settings.nightOwl ? "night" : timeCategory(), {
        cooldown: settings.frequency * 60 * 1000,
      });
    }
  }

  // ---------- 啟動 ----------

  function render() {
    if (shouldShow()) {
      mount();
      applyAppearance();
    } else {
      unmount();
    }
  }

  async function init() {
    settings = await cuteLoadSettings();
    render();

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync") return;
      for (const [key, { newValue }] of Object.entries(changes)) {
        settings[key] = newValue === undefined ? CUTE_DEFAULTS[key] : newValue;
      }
      render();
    });

    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg && msg.type === "cute:cheer") {
        dismissed = false;
        render();
        say("encourage", { force: true }).then((shown) => {
          if (shown) burstHearts();
          sendResponse({ shown });
        });
        return true;
      }
      return false;
    });

    document.addEventListener("keydown", onKeydown, true);
    document.addEventListener("pointerdown", markInteraction, { capture: true, passive: true });
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    document.addEventListener("copy", onCopy, true);
    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("fullscreenchange", syncFullscreen);

    tickTimer = setInterval(tick, 60 * 1000);
    setTimeout(greet, 1800);
  }

  init();
})();
