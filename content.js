(function exportLlamaUiMd() {
    const dbReq = indexedDB.open('LlamaUi');

    dbReq.onsuccess = function (e) {
        const db = e.target.result;
        const stores = ['conversations', 'messages', 'groups'];
        const data = {};
        let pending = stores.length;

        stores.forEach(name => {
            const req = db.transaction(name, 'readonly').objectStore(name).getAll();
            req.onsuccess = ev => { data[name] = ev.target.result || []; if (--pending === 0) build(); };
            req.onerror   = () => { data[name] = [];                     if (--pending === 0) build(); };
        });

        function build() {
            const ts = m => m.timestamp || m.createdAt || m.created_at || 0;

            // 消息按 convId 分桶 + 时间升序
            const byConv = {};
            data.messages.forEach(m => {
                const k = m.convId || m.conversationId || m.chatId;
                (byConv[k] = byConv[k] || []).push(m);
            });
            Object.values(byConv).forEach(a => a.sort((x, y) => ts(x) - ts(y)));

            // 对话按 groupId 分桶
            const byGroup = {};
            data.conversations.forEach(c => {
                const g = c.groupId || c.folderId || '__none__';
                (byGroup[g] = byGroup[g] || []).push(c);
            });

            // 生成唯一锚点
            const slugMap = {};
            const slug = s => {
                let base = (s || 'untitled').replace(/[^\w\u4e00-\u9fa5-]+/g, '-').replace(/^-+|-+$/g, '') || 'untitled';
                slugMap[base] = (slugMap[base] || 0) + 1;
                return slugMap[base] > 1 ? `${base}-${slugMap[base]}` : base;
            };

            // 预生成每个对话的锚点 id
            const anchors = {};
            data.conversations.forEach(c => { anchors[c.id] = slug(c.name || c.title || c.id); });

            // ===== 目录 =====
            let toc = `## 📑 目录\n\n`;
            Object.entries(byGroup).forEach(([gid, convs]) => {
                const gname = gid === '__none__' ? '未分组' : (data.groups.find(g => g.id === gid)?.name || gid);
                toc += `\n**📁 ${gname}**\n\n`;
                convs.sort((a, b) => ts(a) - ts(b)).forEach(c => {
                    const n = (byConv[c.id] || []).length;
                    const t = ts(c) ? new Date(ts(c)).toLocaleDateString() : '';
                    toc += `- [${c.name || c.title || '未命名对话'}](#${anchors[c.id]}) <sub>${n} 条 · ${t}</sub>\n`;
                });
            });

            // ===== 正文 =====
            let body = '';
            Object.entries(byGroup).forEach(([gid, convs]) => {
                const gname = gid === '__none__' ? '未分组' : (data.groups.find(g => g.id === gid)?.name || gid);
                body += `\n---\n\n# 📁 ${gname}\n`;

                convs.sort((a, b) => ts(a) - ts(b)).forEach(c => {
                    const msgs = byConv[c.id] || [];
                    body += `\n<a id="${anchors[c.id]}"></a>\n\n`;
                    body += `## 💬 ${c.name || c.title || '未命名对话'}\n`;
                    body += `> 模型: ${c.model || '-'} ｜ 消息数: ${msgs.length} ｜ 创建: ${ts(c) ? new Date(ts(c)).toLocaleString() : '-'}\n\n[⬆ 返回目录](#-目录)\n\n`;

                    msgs.forEach(m => {
                        const role = (m.role || 'unknown').toLowerCase();
                        const icon = role === 'user' ? '👤' : role === 'system' ? '⚙️' : '🤖';
                        const time = ts(m) ? new Date(ts(m)).toLocaleTimeString() : '';
                        body += `**${icon} ${role}** <sub>${time}</sub>\n\n${toText(m.content)}\n\n---\n\n`;
                    });
                });
            });

            const md = `# LlamaUi 对话备份\n\n> 导出时间：${new Date().toLocaleString()}  \n> 对话 ${data.conversations.length} 个 / 消息 ${data.messages.length} 条 / 分组 ${data.groups.length} 个\n\n${toc}\n${body}`;

            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }));
            a.download = `llamaui_backup_${new Date().toISOString().slice(0,10)}.md`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);

            db.close();
            console.log('✅ Markdown 已导出');
        }

        function toText(content) {
            if (content == null) return '';
            if (typeof content === 'string') return content;
            if (Array.isArray(content)) return content.map(c => (typeof c === 'string' ? c : (c.text || c.content || ''))).join('\n');
            return JSON.stringify(content);
        }
    };

    dbReq.onerror = () => alert('无法打开数据库 LlamaUi');
})();