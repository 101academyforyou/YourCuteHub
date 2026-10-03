// 設定面板：所有設定一改就存進 chrome.storage.sync，網頁上的小可愛會即時更新。

const $ = (id) => document.getElementById(id);

let settings = { ...CUTE_DEFAULTS };
let tab = null;
let site = "";

function save(patch) {
  Object.assign(settings, patch);
  return cuteSaveSettings(patch);
}

function renderMascots() {
  const box = $("mascots");
  box.innerHTML = "";
  for (const [key, { emoji, name }] of Object.entries(CUTE_MASCOTS)) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = emoji;
    b.title = name;
    b.setAttribute("role", "radio");
    b.setAttribute("aria-label", name);
    b.setAttribute("aria-checked", String(key === settings.mascot));
    b.addEventListener("click", () => {
      save({ mascot: key });
      renderMascots();
    });
    box.appendChild(b);
  }
  $("avatar").textContent = (CUTE_MASCOTS[settings.mascot] || CUTE_MASCOTS.cat).emoji;
}

async function renderStats() {
  const { totalCount = 0 } = await chrome.storage.local.get("totalCount");
  $("stats").textContent =
    totalCount > 0 ? `已經收到 ${totalCount} 次情緒價值 💕` : "今天也要開開心心 ✨";
}

function renderSiteRow() {
  const supported = /^https?:/.test(tab?.url || "");
  $("siteRow").hidden = !supported;
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
    hint.textContent = "小可愛目前是關閉的，先打開右上角的開關吧！";
    return;
  }
  if (settings.disabledSites.includes(site)) {
    hint.textContent = "你設定了不在這個網站出現喔～";
    return;
  }
  btn.disabled = true;
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: "cute:cheer" });
    hint.textContent = res?.shown ? "送出一份愛心了！看看網頁右下角 💌" : "小可愛害羞了，再試一次？";
    renderStats();
  } catch {
    hint.textContent = "這個分頁是在安裝前打開的，重新整理一下就好 🔄";
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
  $("frequency").value = String(settings.frequency);
  $("restReminder").value = String(settings.restReminder);
  $("position").value = settings.position;
  $("reactions").checked = settings.reactions;
  $("nightOwl").checked = settings.nightOwl;
  renderMascots();
  renderSiteRow();
  renderStats();

  $("enabled").addEventListener("change", (e) => save({ enabled: e.target.checked }));
  // storage.sync 有每分鐘寫入次數上限，打字時等停下來再存。
  let nicknameTimer = null;
  $("nickname").addEventListener("input", (e) => {
    clearTimeout(nicknameTimer);
    nicknameTimer = setTimeout(() => {
      save({ nickname: e.target.value.trim() || CUTE_DEFAULTS.nickname });
    }, 400);
  });
  $("frequency").addEventListener("change", (e) => save({ frequency: Number(e.target.value) }));
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
