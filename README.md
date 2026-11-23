
# blacksmith

A curated collection of practical mini-tools, scripts, and utilities for daily development and system automation.

---

## LocalizeMsg Extension

One-click export of **llama.cpp WebUI** conversations — stored in the browser's `IndexedDB` database named **`LlamaUi`** — into a single, well-structured **Markdown** file.

### Why an extension instead of a userscript?

Tampermonkey's allow-list refuses to run on `http://localhost` / `127.0.0.1`, which is exactly where llama.cpp WebUI usually lives. A hand-rolled browser extension has no such restriction: it injects directly into any local page via `host_permissions`, and you edit the source in your own IDE instead of pasting code into a console.

### Features

- Opens the `LlamaUi` IndexedDB and reads the `conversations`, `messages`, and `groups` object stores.
- Buckets messages by conversation and sorts them chronologically.
- Groups conversations by folder/group and renders a clickable table of contents with anchors.
- Emits a single `.md` download (`llamaui_backup_YYYY-MM-DD.md`) and shows a floating **Export MD** button — nothing runs until you click it.
- Manifest V3 (required by Chrome in 2026); loads unpacked, zero build step.

### File layout

```text
localizemsg_extention/
|-- manifest.json    # extension manifest (MV3)
|-- content.js       # injected into localhost pages: export logic + button
+-- background.js    # service worker (required by MV3, minimal here)
```

### Load & debug

1. Save the three files above into a folder named `localizemsg_extention/`.
2. Open Chrome and go to `chrome://extensions/`.
3. Toggle **Developer mode** (top-right) on.
4. Click **Load unpacked** and select the `localizemsg_extention/` folder.
5. Open your llama.cpp WebUI page (e.g. `http://localhost:8080`). An **Export MD** button appears in the bottom-right corner.
6. Click it — a `llamaui_backup_YYYY-MM-DD.md` file downloads automatically.

**Iterating fast:** edit `content.js` in your IDE, click the **reload** icon on the extension card in `chrome://extensions/`, then refresh the target page. The new code is live — no copy-pasting into the console.

> **Note:** `host_permissions` already covers all `localhost` / `127.0.0.1` ports. If your WebUI is served from a different origin, add that origin to both `host_permissions` and `content_scripts.matches` in `manifest.json`.

---
