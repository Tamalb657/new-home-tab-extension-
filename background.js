const IDLE_DETECTION_SECONDS = 60;
const USAGE_KEY = "usage_data";
const SHORTCUTS_KEY = "shortcuts";

const tracker = {
  activeDomain: null,
  activeTabId: null,
  lastTickMs: Date.now(),
  isIdle: false,
  hasFocusedWindow: true,
};

chrome.runtime.onInstalled.addListener(async () => {
  chrome.idle.setDetectionInterval(IDLE_DETECTION_SECONDS);
  await ensureDefaults();
  createContextMenu();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.idle.setDetectionInterval(IDLE_DETECTION_SECONDS);
  createContextMenu();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "add-to-dashboard" || !tab?.url) return;

  const candidate = toShortcut(tab.url, tab.title || tab.url);
  if (!candidate) return;

  await addShortcut(candidate);
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  await updateActiveTarget(tab);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tabId !== tracker.activeTabId || !changeInfo.url) return;
  await updateActiveTarget(tab);
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  await flushElapsedTime();
  tracker.hasFocusedWindow = windowId !== chrome.windows.WINDOW_ID_NONE;
  if (!tracker.hasFocusedWindow) {
    tracker.activeDomain = null;
    tracker.activeTabId = null;
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await updateActiveTarget(tab || null);
});

chrome.idle.onStateChanged.addListener(async (state) => {
  const shouldBeIdle = state !== "active";
  if (shouldBeIdle === tracker.isIdle) return;

  await flushElapsedTime();
  tracker.isIdle = shouldBeIdle;
});

setInterval(async () => {
  await flushElapsedTime();
}, 15000);

async function updateActiveTarget(tab) {
  await flushElapsedTime();

  tracker.activeTabId = tab?.id ?? null;
  tracker.activeDomain = tab?.url ? getDomain(tab.url) : null;
  tracker.lastTickMs = Date.now();
}

async function flushElapsedTime() {
  const now = Date.now();
  const elapsedSeconds = Math.floor((now - tracker.lastTickMs) / 1000);
  tracker.lastTickMs = now;

  if (elapsedSeconds <= 0) return;
  if (tracker.isIdle || !tracker.hasFocusedWindow || !tracker.activeDomain) return;

  await incrementUsage(tracker.activeDomain, elapsedSeconds);
}

function getDateKey(inputDate = new Date()) {
  return inputDate.toISOString().slice(0, 10);
}

function getDomain(url) {
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) return null;
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

async function incrementUsage(domain, seconds) {
  const dateKey = getDateKey();
  const { [USAGE_KEY]: usageData = {} } = await chrome.storage.local.get(USAGE_KEY);

  if (!usageData[dateKey]) usageData[dateKey] = {};
  usageData[dateKey][domain] = (usageData[dateKey][domain] || 0) + seconds;

  await chrome.storage.local.set({ [USAGE_KEY]: usageData });
}

function createContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "add-to-dashboard",
      title: "Add current page to New Tab",
      contexts: ["page"]
    });
  });
}

async function ensureDefaults() {
  const data = await chrome.storage.local.get([SHORTCUTS_KEY, USAGE_KEY]);
  const update = {};

  if (!Array.isArray(data[SHORTCUTS_KEY])) update[SHORTCUTS_KEY] = [];
  if (!data[USAGE_KEY] || typeof data[USAGE_KEY] !== "object") update[USAGE_KEY] = {};

  if (Object.keys(update).length > 0) {
    await chrome.storage.local.set(update);
  }
}

function toShortcut(url, title) {
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) return null;

    const domain = parsed.hostname.replace(/^www\./, "");
    return {
      id: crypto.randomUUID(),
      title: title?.trim()?.slice(0, 40) || domain,
      url: parsed.href,
      domain,
      favicon: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`,
      folderId: null,
      createdAt: Date.now()
    };
  } catch {
    return null;
  }
}

async function addShortcut(shortcut) {
  const { [SHORTCUTS_KEY]: shortcuts = [] } = await chrome.storage.local.get(SHORTCUTS_KEY);
  const exists = shortcuts.some((entry) => entry.url === shortcut.url);
  if (exists) return;

  shortcuts.push(shortcut);
  await chrome.storage.local.set({ [SHORTCUTS_KEY]: shortcuts });
}
