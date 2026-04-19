# Antigravity Productivity Dashboard (Chrome Extension MV3)

A lightweight New Tab replacement with:

- True-black CSS Grid dashboard UI.
- Smart Suggestions powered by `chrome.topSites`.
- Shortcut tiles with quick add and context-menu add support.
- Folder expansion (inline) and folder management modal.
- Background service worker time tracking with idle-awareness.
- Built-in analytics modal with SVG bars for Today / 7-day / 30-day usage.

## Files

- `manifest.json`: extension metadata, permissions, and New Tab override.
- `background.js`: robust domain time tracking and context menu integration.
- `index.html`: dashboard skeleton and modals.
- `styles.css`: true-black minimalist UI styles.
- `app.js`: rendering, state interactions, analytics aggregation.

## Load unpacked

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and choose this folder.
