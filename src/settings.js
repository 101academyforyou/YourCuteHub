// 共用設定：content script 與 popup 都會載入這個檔案。
// 設定存在 chrome.storage.sync，登入同一個瀏覽器帳號的裝置會自動雲端同步。
// 統計數據（次數、活躍時間）存在 chrome.storage.local，只留在本機。

/* exported CUTE_DEFAULTS, CUTE_MASCOTS, cuteLoadSettings, cuteSaveSettings, cuteHostOf */

const CUTE_DEFAULTS = {
  enabled: true,
  nickname: "寶貝",
  mascot: "cat",
  position: "right", // "right" | "left"
  frequency: 15, // 幾分鐘主動給一次鼓勵，0 = 不主動
  restReminder: 50, // 連續使用幾分鐘提醒休息，0 = 關閉
  reactions: true, // 對打字、複製、送出表單、讀完文章等行為給回饋
  nightOwl: true, // 深夜提醒早點睡
  disabledSites: [], // 不出現的網站 hostname
};

const CUTE_MASCOTS = {
  cat: { emoji: "🐱", name: "喵喵" },
  dog: { emoji: "🐶", name: "汪汪" },
  rabbit: { emoji: "🐰", name: "兔兔" },
  bear: { emoji: "🐻", name: "熊熊" },
  fox: { emoji: "🦊", name: "狐狐" },
  panda: { emoji: "🐼", name: "胖達" },
  penguin: { emoji: "🐧", name: "企企" },
  chick: { emoji: "🐥", name: "啾啾" },
};

function cuteLoadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(CUTE_DEFAULTS, (items) => {
      resolve({ ...CUTE_DEFAULTS, ...items });
    });
  });
}

function cuteSaveSettings(patch) {
  return new Promise((resolve) => chrome.storage.sync.set(patch, resolve));
}

function cuteHostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}
