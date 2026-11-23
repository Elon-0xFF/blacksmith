
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

### manifest.json

```json
{
  "manifest_version": 3,
  "name": "LocalizeMsg Extension",
  "version": "1.0.0",
  "description": "One-click export of llama.cpp WebUI (LlamaUi IndexedDB) conversations to Markdown.",
  "permissions": ["storage", "scripting"],
  "host_permissions": [
    "http://localhost/*",
    "http://127.0.0.1/*"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": [
        "http://localhost/*",
        "http://127.0.0.1/*"
      ],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_title": "LocalizeMsg: export LlamaUi conversations to Markdown"
  }
}
```

### content.js

```javascript
// content.js
(function () {
  'use strict';

  function toText(content) {
    if (content == null) return '';
    if (typeof content === 'string') return content;
    if (Array.isArray(content))
      return content.map(c => (typeof c === 'string' ? c : (c.text || c.content || ''))).join('\n');
    return JSON.stringify(content);
  }

  function exportLlamaUiMd() {
    const dbReq = indexedDB.open('LlamaUi');

    dbReq.onsuccess = function (e) {
      const db = e.target.result;
      const stores = ['conversations', 'messages', 'groups'];

      // Guard: confirm the database actually belongs to LlamaUi.
      const missing = stores.filter(s => !db.objectStoreNames.contains(s));
      if (missing.length) {
        alert('LlamaUi database is incomplete or not present on this page.');
        db.close();
        return;
      }

      const data = {};
      let pending = stores.length;

      stores.forEach(name => {
        const req = db.transaction(name, 'readonly').objectStore(name).getAll();
        req.onsuccess = ev => { data[name] = ev.target.result || []; if (--pending === 0) build(); };
        req.onerror   = () => { data[name] = [];                     if (--pending === 0) build(); };
      });

      function build() {
        const ts = m => m.timestamp || m.createdAt || m.created_at || 0;

        // Bucket messages per conversation, ascending by time.
        const byConv = {};
        data.messages.forEach(m => {
          const k = m.convId || m.conversationId || m.chatId;
          (byConv[k] = byConv[k] || []).push(m);
        });
        Object.values(byConv).forEach(a => a.sort((x, y) => ts(x) - ts(y)));

        // Bucket conversations per group/folder.
        const byGroup = {};
        data.conversations.forEach(c => {
          const g = c.groupId || c.folderId || '__none__';
          (byGroup[g] = byGroup[g] || []).push(c);
        });

        // Unique anchor slugs.
        const slugMap = {};
        const slug = s => {
          let base = (s || 'untitled').replace(/[^\w一-龥-]+/g, '-').replace(/^-+|-+$/g, '') || 'untitled';
          slugMap[base] = (slugMap[base] || 0) + 1;
          return slugMap[base] > 1 ? base + '-' + slugMap[base] : base;
        };
        const anchors = {};
        data.conversations.forEach(c => { anchors[c.id] = slug(c.name || c.title || c.id); });

        // ---- Table of contents ----
        let toc = '## Table of Contents\n\n';
        Object.entries(byGroup).forEach(([gid, convs]) => {
          const gname = gid === '__none__' ? 'Ungrouped' : (data.groups.find(g => g.id === gid)?.name || gid);
          toc += '\n**Folder: ' + gname + '**\n\n';
          convs.sort((a, b) => ts(a) - ts(b)).forEach(c => {
            const n = (byConv[c.id] || []).length;
            const t = ts(c) ? new Date(ts(c)).toLocaleDateString() : '';
            toc += '- [' + (c.name || c.title || 'Untitled conversation') + '](#' + anchors[c.id] + ') <sub>' + n + ' msgs / ' + t + '</sub>\n';
          });
        });

        // ---- Body ----
        let body = '';
        Object.entries(byGroup).forEach(([gid, convs]) => {
          const gname = gid === '__none__' ? 'Ungrouped' : (data.groups.find(g => g.id === gid)?.name || gid);
          body += '\n---\n\n# Folder: ' + gname + '\n';
          convs.sort((a, b) => ts(a) - ts(b)).forEach(c => {
            const msgs = byConv[c.id] || [];
            body += '\n<a id="' + anchors[c.id] + '"></a>\n\n';
            body += '## ' + (c.name || c.title || 'Untitled conversation') + '\n';
            body += '> model: ' + (c.model || '-') + ' | messages: ' + msgs.length + ' | created: ' + (ts(c) ? new Date(ts(c)).toLocaleString() : '-') + '\n\n[Back to top](#table-of-contents)\n\n';
            msgs.forEach(m => {
              const role = (m.role || 'unknown').toLowerCase();
              const icon = role === 'user' ? '[user]' : role === 'system' ? '[system]' : '[assistant]';
              const time = ts(m) ? new Date(ts(m)).toLocaleTimeString() : '';
              body += '**' + icon + '** <sub>' + time + '</sub>\n\n' + toText(m.content) + '\n\n---\n\n';
            });
          });
        });

        const md = '# LlamaUi Conversation Backup\n\n> Exported: ' + new Date().toLocaleString() + '  \n> ' + data.conversations.length + ' conversations / ' + data.messages.length + ' messages / ' + data.groups.length + ' groups\n\n' + toc + '\n' + body;

        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }));
        a.download = 'llamaui_backup_' + new Date().toISOString().slice(0, 10) + '.md';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);

        db.close();
        console.log('LlamaUi Markdown exported.');
      }
    };

    dbReq.onerror = function () { alert('Cannot open database "LlamaUi" on this page.'); };
  }

  function addExportButton() {
    if (document.getElementById('localizemsg-export-btn')) return;
    var btn = document.createElement('button');
    btn.id = 'localizemsg-export-btn';
    btn.textContent = 'Export MD';
    btn.style.cssText = 'position: fixed; bottom: 20px; right: 20px; z-index: 999999; padding: 8px 16px; background: #4f46e5; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; box-shadow: 0 2px 8px rgba(0,0,0,0.2); transition: background .2s;';
    btn.onmouseenter = function () { btn.style.background = '#4338ca'; };
    btn.onmouseleave = function () { btn.style.background = '#4f46e5'; };
    btn.onclick = exportLlamaUiMd;
    document.body.appendChild(btn);
  }

  if (document.readyState === 'complete') addExportButton();
  else window.addEventListener('load', addExportButton);
})();
```

### background.js

```javascript
// background.js
chrome.runtime.onInstalled.addListener(function () {
  console.log('LocalizeMsg extension installed.');
});
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

内容由 AI 生成
