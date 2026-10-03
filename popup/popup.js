// 設定面板：所有設定一改就存進 chrome.storage.sync，網頁上的小可愛會即時更新。

const $ = (id) => document.getElementById(id);

let settings = { ...CUTE_DEFAULTS };
let tab = null;
let site = "";
let customOpen = false; // 使用者點了「自訂」但還沒輸入

function save(patch) {
  Object.assign(settings, patch);
  return cuteSaveSettings(patch);
}

// storage.sync 有每分鐘寫入次數上限，輸入框等停下來再存。
function debounce(fn, ms = 400) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function radioButton(content, checked, onPick, label) {
  const b = document.createElement("button");
  b.type = "button";
  b.setAttribute("role", "radio");
  b.setAttribute("aria-checked", String(checked));
  if (label) b.setAttribute("aria-label", label);
  if (typeof content === "string") b.textContent = content;
  else b.append(...content);
  b.addEventListener("click", onPick);
  return b;
}

// ---------- 情緒價值等級 ----------

function renderLevels() {
  const box = $("levels");
  box.innerHTML = "";
  for (const [lv, { icon, name }] of Object.entries(CUTE_LEVELS)) {
    const i = document.createElement("span");
    i.className = "lv-icon";
    i.textContent = icon;
    const n = document.createElement("span");
    n.textContent = name;
    box.appendChild(
      radioButton([i, n], Number(lv) === settings.level, () => {
        save({ level: Number(lv) });
        renderLevels();
      }, `${name}：${CUTE_LEVELS[lv].desc}`),
    );
  }
  const level = CUTE_LEVELS[settings.level] || CUTE_LEVELS[2];
  $("levelDesc").textContent = `${level.desc}，例如「${cutePick("encourage", settings.nickname, settings.level)}」`;
}

// ---------- 鼓勵頻率 ----------

function isPreset(sec) {
  return CUTE_INTERVAL_PRESETS.some((p) => p.sec === sec);
}

function renderIntervals() {
  const box = $("intervals");
  box.innerHTML = "";
  const custom = customOpen || !isPreset(settings.interval);
  for (const { sec, label } of CUTE_INTERVAL_PRESETS) {
    box.appendChild(
      radioButton(label, !custom && sec === settings.interval, () => {
        customOpen = false;
        save({ interval: sec });
        renderIntervals();
      }),
    );
  }
  box.appendChild(
    radioButton("自訂", custom, () => {
      customOpen = true;
      renderIntervals();
      $("customValue").focus();
    }),
  );

  $("customBox").hidden = !custom;
  if (custom && document.activeElement !== $("customValue")) {
    // 用最大且能整除的單位顯示，例如 7200 秒 → 2 小時。
    const unit = [3600, 60, 1].find((u) => settings.interval % u === 0) || 1;
    $("customUnit").value = String(unit);
    $("customValue").value = String(settings.interval / unit);
  }
}

function saveCustomInterval() {
  const value = Math.round(Number($("customValue").value));
  if (!Number.isFinite(value) || value < 1) return;
  const sec = Math.min(86400, value * Number($("customUnit").value));
  save({ interval: sec });
}

// ---------- 其他 ----------

function renderMascots() {
  const box = $("mascots");
  box.innerHTML = "";
  for (const [key, { emoji, name }] of Object.entries(CUTE_MASCOTS)) {
    const b = radioButton(emoji, key === settings.mascot, () => {
      save({ mascot: key });
      renderMascots();
    }, name);
    b.title = name;
    box.appendChild(b);
  }
  $("avatar").textContent = (CUTE_MASCOTS[settings.mascot] || CUTE_MASCOTS.cat).emoji;
}

async function renderStats() {
  const { totalCount = 0 } = await chrome.storage.local.get("totalCount");
  $("stats").textContent = totalCount > 0 ? `已收到 ${totalCount} 次情緒價值 💕` : "今天也要開開心心";
}

function renderSiteRow() {
  $("siteRow").hidden = !/^https?:/.test(tab?.url || "");
  $("siteName").textContent = site || "這個網站";
  $("siteDisabled").checked = settings.disabledSites.includes(site);
}

async function cheer() {
  const btn = $("cheer");
  const hint = $("cheerHint");
  hint.textContent = "";
  if (!tab?.id || !/^https?:/.test(tab.url || "")) {
    hint.textContent = "這個頁面沒辦法出現喔，換到一般網頁試試看～";
    return;
  }
  if (!settings.enabled) {
    hint.textContent = "小可愛目前是關閉的，先打開右上角的開關吧";
    return;
  }
  if (settings.disabledSites.includes(site)) {
    hint.textContent = "你設定了不在這個網站出現喔";
    return;
  }
  btn.disabled = true;
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: "cute:cheer" });
    hint.textContent = res?.shown ? "送出一份愛心了，看看網頁角落 💌" : "小可愛害羞了，再試一次？";
    renderStats();
  } catch {
    hint.textContent = "這個分頁是在安裝前打開的，重新整理一下就好";
  } finally {
    btn.disabled = false;
  }
}

async function init() {
  settings = await cuteLoadSettings();
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  site = cuteHostOf(tab?.url || "");

  $("enabled").checked = settings.enabled;
  $("nickname").value = settings.nickname;
  $("restReminder").value = String(settings.restReminder);
  $("position").value = settings.position;
  $("reactions").checked = settings.reactions;
  $("nightOwl").checked = settings.nightOwl;
  renderLevels();
  renderIntervals();
  renderMascots();
  renderSiteRow();
  renderStats();

  $("enabled").addEventListener("change", (e) => save({ enabled: e.target.checked }));
  $("nickname").addEventListener(
    "input",
    debounce((e) => save({ nickname: e.target.value.trim() || CUTE_DEFAULTS.nickname })),
  );
  const saveCustom = debounce(saveCustomInterval);
  $("customValue").addEventListener("input", saveCustom);
  $("customUnit").addEventListener("change", saveCustomInterval);
  $("restReminder").addEventListener("change", (e) => save({ restReminder: Number(e.target.value) }));
  $("position").addEventListener("change", (e) => save({ position: e.target.value }));
  $("reactions").addEventListener("change", (e) => save({ reactions: e.target.checked }));
  $("nightOwl").addEventListener("change", (e) => save({ nightOwl: e.target.checked }));
  $("siteDisabled").addEventListener("change", (e) => {
    const others = settings.disabledSites.filter((h) => h !== site);
    save({ disabledSites: e.target.checked ? [...others, site] : others });
  });
  $("cheer").addEventListener("click", cheer);
}

init();
