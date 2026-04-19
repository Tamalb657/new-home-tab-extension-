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
- `validate-extension.mjs`: local validator to catch missing/invalid manifest and referenced files.

## Manifest permissions (why they are needed)

- `storage`: Persist shortcuts and usage data.
- `tabs`: Resolve active tab/domain for precise timing.
- `idle`: Pause timers when user is inactive.
- `contextMenus`: "Add current page to New Tab" menu item.
- `topSites`: Smart Suggestions row.
- `history`: Reserved for future suggestion/analytics enhancements.

## Load unpacked

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode**.
3. Select the folder that directly contains `manifest.json`.
4. Click **Load unpacked** and choose this folder.

## If you see “Manifest file is missing or unreadable”

This usually means the wrong folder level was selected, or a required file is missing.

Run:

```bash
node validate-extension.mjs
```

If it passes, pick this exact directory (the one containing `manifest.json`) in the browser’s **Load unpacked** picker.
