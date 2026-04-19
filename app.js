const SHORTCUTS_KEY = "shortcuts";
const USAGE_KEY = "usage_data";
const NOTES_KEY = "notes";

const shortcutsEl = document.getElementById("shortcuts");
const suggestionsEl = document.getElementById("suggestions");
const historyEl = document.getElementById("history");
const template = document.getElementById("tile-template");

const folderModal = document.getElementById("folder-modal");
const folderModalTitle = document.getElementById("folder-modal-title");
const folderItems = document.getElementById("folder-items");
const analyticsModal = document.getElementById("analytics-modal");
const analyticsChart = document.getElementById("analytics-chart");

let currentRange = "today";
let noteSaveTimer;

init().catch(console.error);

async function init() {
  bindEvents();
  startClock();
  await Promise.all([
    renderSuggestions(),
    renderShortcuts(),
    renderRecentHistory(),
    loadNotes()
  ]);
}

function bindEvents() {
  document.getElementById("folder-close").addEventListener("click", () => folderModal.close());
  document.getElementById("analytics-btn").addEventListener("click", async () => {
    analyticsModal.showModal();
    await renderAnalytics();
  });
  document.getElementById("analytics-close").addEventListener("click", () => analyticsModal.close());
  document.getElementById("clear-analytics").addEventListener("click", async () => {
    await chrome.storage.local.set({ [USAGE_KEY]: {} });
    await renderAnalytics();
  });

  document.querySelectorAll(".range-btn[data-range]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      document.querySelectorAll(".range-btn[data-range]").forEach((node) => node.classList.remove("active"));
      btn.classList.add("active");
      currentRange = btn.dataset.range;
      await renderAnalytics();
    });
  });

  document.getElementById("search-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = document.getElementById("search-input");
    const raw = input.value.trim();
    if (!raw) return;

    const destination = toSearchOrUrl(raw);
    chrome.tabs.create({ url: destination });
    input.value = "";
  });

  document.getElementById("notes").addEventListener("input", (event) => {
    clearTimeout(noteSaveTimer);
    noteSaveTimer = setTimeout(async () => {
      await chrome.storage.local.set({ [NOTES_KEY]: event.target.value });
    }, 250);
  });
}

function startClock() {
  const clock = document.getElementById("clock");
  const tick = () => {
    const now = new Date();
    clock.textContent = now.toLocaleString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };
  tick();
  setInterval(tick, 1000);
}

async function renderSuggestions() {
  suggestionsEl.innerHTML = "";
  const topSites = await chrome.topSites.get().catch(() => []);

  topSites.slice(0, 8).forEach((site) => {
    const tile = createTile({
      title: sanitizeDomain(site.url),
      url: site.url,
      favicon: faviconForUrl(site.url),
    });
    suggestionsEl.append(tile);
  });
}

async function renderRecentHistory() {
  historyEl.innerHTML = "";
  const recent = await chrome.history.search({ text: "", maxResults: 8, startTime: Date.now() - (1000 * 60 * 60 * 24 * 3) }).catch(() => []);

  recent.forEach((item) => {
    if (!item.url) return;
    historyEl.append(createTile({
      title: item.title || sanitizeDomain(item.url),
      url: item.url,
      favicon: faviconForUrl(item.url),
    }));
  });
}

async function renderShortcuts() {
  shortcutsEl.innerHTML = "";
  const { [SHORTCUTS_KEY]: shortcuts = [] } = await chrome.storage.local.get(SHORTCUTS_KEY);

  const folders = groupByFolder(shortcuts);
  folders.root.forEach((shortcut) => shortcutsEl.append(createTile(shortcut, { managed: true })));

  Object.entries(folders.byId).forEach(([folderId, items]) => {
    const folderTile = createFolderTile(folderId, items);
    shortcutsEl.append(folderTile.wrapper);
  });

  shortcutsEl.append(createQuickAddTile());
}

function createTile(entry, options = {}) {
  const fragment = template.content.cloneNode(true);
  const tile = fragment.querySelector(".tile");
  const icon = fragment.querySelector(".tile-icon");
  const label = fragment.querySelector(".tile-label");

  icon.src = entry.favicon || faviconForUrl(entry.url);
  label.textContent = entry.title || sanitizeDomain(entry.url);

  tile.addEventListener("click", () => {
    chrome.tabs.create({ url: entry.url });
  });

  if (options.managed) {
    tile.title = "Right-click to remove";
    tile.addEventListener("contextmenu", async (event) => {
      event.preventDefault();
      const shouldDelete = confirm(`Remove shortcut for ${entry.title || entry.url}?`);
      if (!shouldDelete) return;
      await removeShortcut(entry.id);
      await renderShortcuts();
    });
  }

  return fragment;
}

function createQuickAddTile() {
  const wrap = document.createElement("div");
  wrap.className = "tile";
  wrap.textContent = "+";

  wrap.addEventListener("click", () => {
    const input = document.createElement("input");
    input.className = "quick-add-input";
    input.placeholder = "Paste URL and press Enter";
    wrap.replaceWith(input);
    input.focus();

    input.addEventListener("keydown", async (event) => {
      if (event.key !== "Enter") return;
      const shortcut = normalizeQuickAdd(input.value);
      if (shortcut) {
        await saveShortcut(shortcut);
      }
      await renderShortcuts();
    });

    input.addEventListener("blur", renderShortcuts, { once: true });
  }, { once: true });

  return wrap;
}

function normalizeQuickAdd(raw) {
  if (!raw) return null;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(withProtocol);
    const domain = sanitizeDomain(parsed.href);
    return {
      id: crypto.randomUUID(),
      title: domain,
      url: parsed.href,
      domain,
      favicon: faviconForUrl(parsed.href),
      folderId: null,
      createdAt: Date.now(),
    };
  } catch {
    return null;
  }
}

function groupByFolder(shortcuts) {
  const result = { root: [], byId: {} };
  shortcuts.forEach((entry) => {
    if (!entry.folderId) {
      result.root.push(entry);
      return;
    }
    if (!result.byId[entry.folderId]) result.byId[entry.folderId] = [];
    result.byId[entry.folderId].push(entry);
  });
  return result;
}

function createFolderTile(folderId, items) {
  const wrapper = document.createElement("div");
  wrapper.className = "grid";

  const tile = document.createElement("button");
  tile.className = "tile";
  tile.type = "button";

  const name = items[0]?.folderName || "Folder";
  tile.innerHTML = `<span class="tile-label">📁 ${name}</span>`;

  const editBtn = document.createElement("button");
  editBtn.className = "icon-btn";
  editBtn.textContent = "Edit";

  const row = document.createElement("div");
  row.className = "folder-row";
  const inner = document.createElement("div");
  inner.className = "folder-inner grid tiles-grid";
  items.forEach((entry) => inner.append(createTile(entry, { managed: true })));
  row.append(inner);

  tile.addEventListener("click", () => row.classList.toggle("open"));
  tile.addEventListener("pointerdown", () => {
    const start = Date.now();
    const release = () => {
      if (Date.now() - start > 450) {
        openFolderModal(name, items);
      }
      tile.removeEventListener("pointerup", release);
    };
    tile.addEventListener("pointerup", release);
  });
  editBtn.addEventListener("click", () => openFolderModal(name, items));

  wrapper.append(tile, editBtn, row);
  return { wrapper };
}

function openFolderModal(name, items) {
  folderModalTitle.textContent = name;
  folderItems.innerHTML = "";
  items.forEach((entry) => folderItems.append(createTile(entry, { managed: true })));
  folderModal.showModal();
}

async function saveShortcut(shortcut) {
  const { [SHORTCUTS_KEY]: shortcuts = [] } = await chrome.storage.local.get(SHORTCUTS_KEY);
  if (shortcuts.some((item) => item.url === shortcut.url)) return;

  shortcuts.push(shortcut);
  await chrome.storage.local.set({ [SHORTCUTS_KEY]: shortcuts });
}

async function removeShortcut(id) {
  const { [SHORTCUTS_KEY]: shortcuts = [] } = await chrome.storage.local.get(SHORTCUTS_KEY);
  const filtered = shortcuts.filter((item) => item.id !== id);
  await chrome.storage.local.set({ [SHORTCUTS_KEY]: filtered });
}

async function loadNotes() {
  const notes = document.getElementById("notes");
  const data = await chrome.storage.local.get(NOTES_KEY);
  notes.value = data[NOTES_KEY] || "";
}

async function renderAnalytics() {
  analyticsChart.innerHTML = "";

  const { [USAGE_KEY]: usageData = {} } = await chrome.storage.local.get(USAGE_KEY);
  const aggregate = aggregateUsage(usageData, currentRange);

  const max = Math.max(...Object.values(aggregate), 1);
  const entries = Object.entries(aggregate).sort((a, b) => b[1] - a[1]).slice(0, 10);

  if (!entries.length) {
    analyticsChart.textContent = "No tracked browsing activity yet.";
    return;
  }

  entries.forEach(([domain, seconds]) => {
    const row = document.createElement("div");
    row.className = "analytics-row";

    const label = document.createElement("span");
    label.textContent = domain;

    const svg = buildHorizontalBar(seconds / max);

    const value = document.createElement("span");
    value.textContent = formatDuration(seconds);

    row.append(label, svg, value);
    analyticsChart.append(row);
  });
}

function aggregateUsage(usageData, range) {
  const now = new Date();
  const days = range === "today" ? 1 : range === "7d" ? 7 : 30;
  const result = {};

  for (let i = 0; i < days; i += 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - i);
    const key = date.toISOString().slice(0, 10);
    const daily = usageData[key] || {};

    Object.entries(daily).forEach(([domain, seconds]) => {
      result[domain] = (result[domain] || 0) + seconds;
    });
  }

  return result;
}

function buildHorizontalBar(ratio) {
  const width = 100;
  const fillWidth = Math.max(2, Math.round(width * ratio));
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("class", "analytics-bar");
  svg.setAttribute("viewBox", "0 0 100 12");

  const bg = document.createElementNS(svgNS, "rect");
  bg.setAttribute("x", "0");
  bg.setAttribute("y", "0");
  bg.setAttribute("width", "100");
  bg.setAttribute("height", "12");
  bg.setAttribute("fill", "#111");

  const fg = document.createElementNS(svgNS, "rect");
  fg.setAttribute("x", "0");
  fg.setAttribute("y", "0");
  fg.setAttribute("width", String(fillWidth));
  fg.setAttribute("height", "12");
  fg.setAttribute("fill", "#fff");

  svg.append(bg, fg);
  return svg;
}

function formatDuration(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(1, minutes)}m`;
}

function sanitizeDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function faviconForUrl(url) {
  const domain = sanitizeDomain(url);
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}

function toSearchOrUrl(value) {
  const hasScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(value);
  const normalized = hasScheme ? value : `https://${value}`;

  try {
    const parsed = new URL(normalized);
    if (parsed.hostname.includes(".")) {
      return parsed.href;
    }
  } catch {
    // no-op
  }

  return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
}
