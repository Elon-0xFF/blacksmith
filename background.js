// background.js
// 点击扩展图标（或按 Ctrl+Shift+E）时，把 content.js 注入当前标签页。
// content.js 负责读取 IndexedDB（LlamaUi）并下载 Markdown 备份。

const SCRIPT_FILE = 'content.js';
const DB_NAME = 'LlamaUi';
const BADGE_MS = 2500;

/** 只允许在普通网页中注入（chrome://、扩展页等无法注入） */
function canInject(url = '') {
    return /^https?:\/\//i.test(url);
}

/** 在工具栏图标上短暂显示角标，作为轻量反馈 */
async function flashBadge(tabId, text, color) {
    try {
        await chrome.action.setBadgeBackgroundColor({ tabId, color });
        await chrome.action.setBadgeText({ tabId, text });
        setTimeout(() => {
            chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
        }, BADGE_MS);
    } catch {
        // 标签页可能已关闭，忽略
    }
}

/** 在页面里弹出提示 */
async function showAlert(tabId, message) {
    try {
        await chrome.scripting.executeScript({
            target: { tabId },
            func: (msg) => alert(msg),
            args: [message]
        });
    } catch {
        // 注入受限时忽略，控制台已有日志
    }
}

/**
 * 检查当前页面是否真的存在 LlamaUi 数据库。
 * 若浏览器不支持 indexedDB.databases()，则返回 true，交由 content.js 自行判断，
 * 避免误创建空数据库或导出无关站点的数据。
 */
async function hasLlamaUiDb(tabId) {
    try {
        const [{ result }] = await chrome.scripting.executeScript({
            target: { tabId },
            func: async (name) => {
                if (typeof indexedDB.databases !== 'function') return true;
                const dbs = await indexedDB.databases();
                return dbs.some((db) => db.name === name);
            },
            args: [DB_NAME]
        });
        return result !== false;
    } catch {
        return false;
    }
}

/** 主流程：注入 content.js 导出当前页面的对话 */
async function exportCurrentTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || tab.id == null) return;

    if (!canInject(tab.url)) {
        console.warn('[LlamaUI 导出] 当前页面不允许注入脚本:', tab.url);
        await flashBadge(tab.id, '✕', '#c0392b');
        return;
    }

    if (!(await hasLlamaUiDb(tab.id))) {
        await flashBadge(tab.id, '✕', '#c0392b');
        await showAlert(
            tab.id,
            '没有找到 LlamaUi 数据库。\n请确认当前页面是 llama.cpp 的 WebUI，并且已经产生过对话。'
        );
        console.warn('[LlamaUI 导出] 未找到数据库:', DB_NAME);
        return;
    }

    try {
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: [SCRIPT_FILE]
        });
        await flashBadge(tab.id, '✓', '#27ae60');
    } catch (err) {
        console.error('[LlamaUI 导出] 注入失败:', err);
        await flashBadge(tab.id, '✕', '#c0392b');
        await showAlert(
            tab.id,
            '导出脚本注入失败:\n' + (err && err.message ? err.message : String(err))
        );
    }
}

chrome.action.onClicked.addListener(() => {
    exportCurrentTab();
});

chrome.commands.onCommand.addListener((command) => {
    if (command === 'export-llamaui') exportCurrentTab();
});

chrome.runtime.onInstalled.addListener(() => {
    console.log('[LlamaUI 导出] 已安装。打开 llama.cpp WebUI 后点击扩展图标或按 Ctrl+Shift+E 导出 Markdown。');
});
