// --- MCP Autonomous Runtime ---
let isAgentActive = sessionStorage.getItem("mcp_active") === "true";
let globalToolRegistry = JSON.parse(sessionStorage.getItem("mcp_tools") || "{}");
let disabledServers = new Set(JSON.parse(sessionStorage.getItem("mcp_disabled_servers") || "[]"));
let disabledTools = new Set(JSON.parse(sessionStorage.getItem("mcp_disabled_tools") || "[]"));
let statusBtnElement = null;

// 1. Google Font Injection
if (!document.getElementById("mcp-editorial-font")) {
    const fontLink = document.createElement("link");
    fontLink.id = "mcp-editorial-font";
    fontLink.href = "https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500;600&family=Inter:wght@400;500;600&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&display=swap";
    fontLink.rel = "stylesheet";
    document.head?.appendChild(fontLink);
}

// Smart URL Normalizer (Preserves custom endpoints like /mcp/admin/milad)
function normalizeMcpUrl(rawUrl) {
    let url = rawUrl.trim();
    if (url.endsWith("/")) url = url.slice(0, -1);
    try {
        const parsed = new URL(url);
        if (parsed.pathname === "" || parsed.pathname === "/") {
            url += "/mcp";
        }
    } catch (e) {}
    return url;
}

// 2. Background Fetch Proxy
async function mcpFetch(url, body, method = "POST") {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            type: "MCP_FETCH",
            url: url,
            body: body,
            method: method
        }, (response) => {
            if (chrome.runtime.lastError) {
                return reject(new Error(chrome.runtime.lastError.message));
            }
            if (!response || !response.success) {
                return reject(new Error(response?.error || "Fetch failed"));
            }
            resolve(response.data);
        });
    });
}

// Universal Tool Extractor (Handles standard MCP, available_tools, and REST lists)
function extractToolsFromResponse(data, serverUrl) {
    const tools = [];
    if (!data) return tools;

    // Format 1: Standard MCP JSON-RPC { result: { tools: [...] } }
    if (data.result && Array.isArray(data.result.tools)) {
        return data.result.tools;
    }

    // Format 2: Direct tools array { tools: [...] }
    if (Array.isArray(data.tools)) {
        return data.tools;
    }

    // Format 3: Admin / Custom { available_tools: ["tool1", "tool2", ...] }
    if (Array.isArray(data.available_tools)) {
        return data.available_tools.map(t => {
            if (typeof t === "string") {
                return {
                    name: t,
                    description: `Admin tool ${t}`,
                    inputSchema: { type: "object", properties: {} }
                };
            }
            return t;
        });
    }

    return tools;
}

// 3. Exact Generation & Streaming Detector
function isAIGenerating() {
    if (location.hostname.includes("gemini.google.com")) {
        const geminiStop = document.querySelector('button[aria-label*="Stop"]:not([disabled]), button[aria-label*="توقف"]:not([disabled])');
        return geminiStop !== null && geminiStop.offsetParent !== null;
    }

    const stopBtn = document.querySelector(
        'button[aria-label*="Stop"]:not([disabled]), ' +
        'div[aria-label*="Stop"]:not([disabled]), ' +
        'button[aria-label*="توقف"]:not([disabled]), ' +
        'div[aria-label*="توقف"]:not([disabled]), ' +
        'button.ds-stop-button:not([disabled]), ' +
        'div.ds-stop-button:not([disabled]), ' +
        'button[aria-label="Stop generating"]:not([disabled])'
    );
    if (stopBtn && stopBtn.offsetParent !== null) return true;

    if (location.hostname.includes("deepseek")) {
        const isGen = Array.from(document.querySelectorAll('div[role="button"], button')).some(btn => {
            const txt = btn.textContent.toLowerCase();
            return (txt.includes('stop generating') || txt.includes('停止生成') || txt.includes('توقف') || (btn.querySelector('svg rect') && !btn.querySelector('svg path'))) && btn.offsetParent !== null;
        });
        if (isGen) return true;
    }

    const streamingElement = document.querySelector('.result-streaming, [data-is-streaming="true"]');
    if (streamingElement && streamingElement.offsetParent !== null) return true;

    return false;
}

// 4. Universal Chat Input Dispatcher
async function sendMessageToAI(text) {
    const inputElement = document.querySelector(
        'rich-textarea div[contenteditable="true"], ' +
        'div.ql-editor[contenteditable="true"], ' +
        'div[contenteditable="true"].ProseMirror, ' +
        'div[contenteditable="true"][role="textbox"], ' +
        '#chat-input, ' +
        'textarea[name="user-prompt"], textarea.message-input-textarea, textarea.JRDRiEf5NPKWK43sArdC, textarea, ' +
        'div[contenteditable="true"]'
    );

    if (!inputElement) {
        console.error("[MCP] ❌ Chat input element not found!");
        return;
    }

    inputElement.focus();

    if (inputElement.isContentEditable) {
        let inserted = false;
        try {
            const dt = new DataTransfer();
            dt.setData('text/plain', text);
            inputElement.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
            if (inputElement.textContent.includes(text.substring(0, 15))) inserted = true;
        } catch (e) {}

        if (!inserted) {
            let p = inputElement.querySelector('p');
            if (!p) { p = document.createElement('p'); inputElement.innerHTML = ''; inputElement.appendChild(p); }
            p.innerText = text;
        }

        inputElement.dispatchEvent(new Event("beforeinput", { bubbles: true, cancelable: true }));
        inputElement.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
        inputElement.dispatchEvent(new Event("input", { bubbles: true }));
        inputElement.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
        inputElement.select();
        const success = document.execCommand("insertText", false, text);
        if (!success || inputElement.value !== text) {
            const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
            if (valueSetter) valueSetter.call(inputElement, text);
            else inputElement.value = text;
        }
        inputElement.dispatchEvent(new Event("input", { bubbles: true }));
        inputElement.dispatchEvent(new Event("change", { bubbles: true }));
    }

    await new Promise(r => setTimeout(r, 400));

    let clicked = false;
    const sendBtnSelectors = [
        'button.send-button:not([disabled])',
        'button[aria-label*="Send"]:not([disabled])',
        'button[aria-label*="ارسال"]:not([disabled])',
        'div[aria-label*="Send"]:not([disabled])',
        'div[aria-label*="ارسال"]:not([disabled])',
        'form[data-chat-footer="true"] button[type="submit"]:not([disabled])',
        '.chat-prompt-send-button button:not([disabled])',
        '#send-message-button:not([disabled])'
    ];

    for (let sel of sendBtnSelectors) {
        const btn = document.querySelector(sel);
        if (btn && btn.getAttribute('aria-disabled') !== 'true') {
            btn.click();
            clicked = true;
            break;
        }
    }

    if (!clicked) {
        const form = inputElement.closest('form');
        if (form) {
            try { form.requestSubmit(); clicked = true; } catch (e) { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }
        }
    }

    inputElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
}

function isToolActive(toolName) {
    const tool = globalToolRegistry[toolName];
    if (!tool) return false;
    if (disabledServers.has(tool.serverUrl)) return false;
    if (disabledTools.has(toolName)) return false;
    return true;
}

function getActiveToolCount() {
    return Object.keys(globalToolRegistry).filter(name => isToolActive(name)).length;
}

function updateButtonState(text, isProcessing = false) {
    if (!statusBtnElement) return;
    statusBtnElement.style.color = isProcessing ? "#71717a" : "#ffffff";
    statusBtnElement.innerHTML = text;
}

// 5. Universal New Chat Trigger
function startNewChat() {
    sessionStorage.removeItem("mcp_active");
    if (location.hostname.includes('gemini.google.com')) window.location.href = 'https://gemini.google.com/app';
    else if (location.hostname.includes('mistral.ai')) window.location.href = 'https://chat.mistral.ai/chat';
    else if (location.hostname.includes('z.ai')) window.location.href = 'https://chat.z.ai/';
    else if (location.hostname.includes('duck.ai')) window.location.href = 'https://duck.ai/';
    else if (location.hostname.includes('qwen')) window.location.href = 'https://chat.qwen.ai/';
    else if (location.hostname.includes('deepseek')) window.location.href = 'https://chat.deepseek.com/';
    else window.location.href = window.location.origin;
}

// 6. Self-Healing Floating Pill Navbar
function ensurePillNavbar() {
    if (!document.body) return;
    if (document.getElementById("mcp-pill-navbar")) return;

    const nav = document.createElement("div");
    nav.id = "mcp-pill-navbar";
    Object.assign(nav.style, {
        position: "fixed", bottom: "24px", left: "24px", zIndex: "2147483640",
        display: "flex", alignItems: "center", gap: "6px",
        backgroundColor: "rgba(10, 10, 12, 0.96)", backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(255, 255, 255, 0.18)",
        borderRadius: "9999px", padding: "5px 8px", boxShadow: "0 16px 36px rgba(0, 0, 0, 0.65)",
        fontFamily: "'Inter', sans-serif"
    });

    const expandBtn = document.createElement("button");
    expandBtn.title = "Open Tool Router & Inspector";
    expandBtn.innerHTML = `<svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"></polyline></svg>`;
    styleIconButton(expandBtn);
    expandBtn.onclick = () => openToolsModal();

    statusBtnElement = document.createElement("button");
    const count = getActiveToolCount();
    statusBtnElement.innerHTML = isAgentActive
        ? `<svg style="width:14px;height:14px;margin-right:6px;stroke:#4ade80;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg> MCP Active (${count})`
        : `<svg style="width:14px;height:14px;margin-right:6px;stroke:#a1a1aa;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg> Initialize MCP`;

    Object.assign(statusBtnElement.style, {
        background: "transparent", border: "none", color: "#ffffff",
        padding: "7px 12px", borderRadius: "9999px", cursor: "pointer",
        fontWeight: "500", fontSize: "12.5px", display: "flex", alignItems: "center",
        transition: "all 0.2s"
    });

    statusBtnElement.onclick = async () => { await triggerMCPActivation(); };

    const refreshBtn = document.createElement("button");
    refreshBtn.title = "Re-initialize & Refresh Tools";
    refreshBtn.innerHTML = `<svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>`;
    styleIconButton(refreshBtn);
    refreshBtn.onclick = async () => {
        refreshBtn.style.transform = "rotate(360deg)";
        setTimeout(() => refreshBtn.style.transform = "none", 400);
        await triggerMCPActivation();
    };

    const newChatBtn = document.createElement("button");
    newChatBtn.title = "Start New Chat";
    newChatBtn.innerHTML = `<svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
    styleIconButton(newChatBtn);
    newChatBtn.onclick = () => startNewChat();

    nav.appendChild(expandBtn);
    nav.appendChild(createDivider());
    nav.appendChild(statusBtnElement);
    nav.appendChild(createDivider());
    nav.appendChild(refreshBtn);
    nav.appendChild(newChatBtn);

    document.body.appendChild(nav);

    if (isAgentActive) {
        initializeAllServers().then(() => {
            updateButtonState(`<svg style="width:14px;height:14px;margin-right:6px;stroke:#4ade80;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg> MCP Active (${getActiveToolCount()})`);
        });
    }
}

function styleIconButton(btn) {
    Object.assign(btn.style, {
        background: "transparent", border: "none", color: "#a1a1aa",
        width: "28px", height: "28px", borderRadius: "50%", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all 0.15s ease"
    });
}

function createDivider() {
    const div = document.createElement("div");
    Object.assign(div.style, { width: "1px", height: "14px", backgroundColor: "rgba(255, 255, 255, 0.12)" });
    return div;
}

// 7. Modal Inspector (Live Storage Sync)
async function openToolsModal() {
    const existing = document.getElementById("mcp-tools-modal");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "mcp-tools-modal";
    Object.assign(overlay.style, {
        position: "fixed", inset: "0", zIndex: "2147483647",
        backgroundColor: "rgba(0, 0, 0, 0.8)", backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)", display: "flex",
        alignItems: "center", justifyContent: "center", padding: "24px",
        fontFamily: "'Inter', sans-serif"
    });

    const modal = document.createElement("div");
    Object.assign(modal.style, {
        backgroundColor: "#09090b", border: "1px solid rgba(255, 255, 255, 0.15)",
        borderRadius: "20px", width: "100%", maxWidth: "700px",
        maxHeight: "85vh", display: "flex", flexDirection: "column",
        boxShadow: "0 28px 70px rgba(0, 0, 0, 0.9)", overflow: "hidden"
    });

    await initializeAllServers();

    const result = await new Promise(r => chrome.storage.local.get(['mcpServers'], r));
    const configuredServers = result.mcpServers || [];

    const serverMap = {};
    for (let srv of configuredServers) {
        const url = typeof srv === "string" ? srv : srv.url;
        serverMap[url] = [];
    }

    Object.values(globalToolRegistry).forEach(tool => {
        const srv = tool.serverUrl;
        if (!serverMap[srv]) serverMap[srv] = [];
        serverMap[srv].push(tool);
    });

    const totalCount = Object.keys(globalToolRegistry).length;
    const activeCount = getActiveToolCount();

    modal.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:22px 26px;border-bottom:1px solid rgba(255,255,255,0.1);">
            <div style="display:flex;align-items:center;gap:14px;">
                <div style="width:38px;height:38px;background:#18181b;border:1px solid rgba(255,255,255,0.15);border-radius:10px;display:flex;align-items:center;justify-content:center;">
                    <svg style="width:18px;height:18px;color:#ffffff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="20 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>
                </div>
                <div>
                    <h2 style="font-family:'Newsreader',serif;font-size:20px;font-weight:500;color:#ffffff;margin:0;">MCP Tool Router</h2>
                    <p style="font-size:12px;color:#71717a;margin:2px 0 0 0;">Manage external tools & server availability</p>
                </div>
            </div>
            <div style="display:flex;align-items:center;gap:12px;">
                <span id="mcp-modal-badge" style="font-family:'Geist Mono',monospace;font-size:11px;padding:4px 10px;border-radius:999px;background:#18181b;border:1px solid rgba(255,255,255,0.15);color:#e4e4e7;">${activeCount} of ${totalCount} Active</span>
                <button id="mcp-modal-close" style="background:transparent;border:none;color:#71717a;cursor:pointer;padding:6px;">
                    <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>
        </div>

        <div id="mcp-modal-list" style="padding:22px 26px;overflow-y:auto;display:flex;flex-direction:column;gap:18px;flex:1;">
            ${renderModalServerGroups(serverMap, configuredServers)}
        </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    document.getElementById("mcp-modal-close").onclick = () => overlay.remove();
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
}

function renderModalServerGroups(serverMap, configuredServers) {
    if (Object.keys(serverMap).length === 0) {
        return `<div style="text-align:center;color:#71717a;padding:36px 0;font-size:13px;">No MCP servers registered yet.<br>Add an endpoint in the extension popup to connect.</div>`;
    }

    return Object.entries(serverMap).map(([serverUrl, tools]) => {
        const srvObj = configuredServers.find(s => (typeof s === "string" ? s : s.url) === serverUrl);
        const isServerEnabled = srvObj ? (typeof srvObj === "string" ? true : srvObj.enabled) : true;

        return `
        <div class="mcp-server-card" style="background:#111114;border:1px solid rgba(255,255,255,0.12);border-radius:14px;padding:14px 16px;display:flex;flex-direction:column;gap:12px;">
            <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,0.06);padding-bottom:8px;">
                <div style="display:flex;align-items:center;gap:10px;overflow:hidden;flex:1;">
                    <div style="width:7px;height:7px;border-radius:50%;background:${isServerEnabled ? '#4ade80' : '#3f3f46'};box-shadow:${isServerEnabled ? '0 0 6px #4ade80' : 'none'};"></div>
                    <span style="font-family:'Geist Mono',monospace;font-size:12px;color:#d4d4d8;text-overflow:ellipsis;overflow:hidden;white-space:nowrap;">${serverUrl}</span>
                </div>
                <span style="font-family:'Geist Mono',monospace;font-size:11px;color:#71717a;">${tools.length} Tools</span>
            </div>

            <div style="display:flex;flex-direction:column;gap:8px;">
                ${tools.length === 0 ? '<span style="font-size:11px;color:#71717a;">Offline or no tools found.</span>' : tools.map(tool => `
                    <div style="display:flex;align-items:flex-start;justify-content:space-between;background:#09090b;border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:10px 12px;">
                        <div>
                            <div style="font-family:'Geist Mono',monospace;font-size:12px;font-weight:600;color:#ffffff;margin-bottom:2px;">${tool.name}</div>
                            <p style="font-size:11.5px;color:#71717a;margin:0;">${tool.description || 'No description'}</p>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
        `;
    }).join('');
}

// 8. Activation & Injection
async function triggerMCPActivation() {
    updateButtonState(`<svg style="width:14px;height:14px;margin-right:6px;animation:spin 1s linear infinite;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 2v4"></path></svg> Connecting...`, true);

    await initializeAllServers();
    const count = getActiveToolCount();

    if (count === 0) {
        updateButtonState(`❌ 0 Tools found!`);
        setTimeout(() => updateButtonState(`Initialize MCP`), 3000);
        return;
    }

    isAgentActive = true;
    sessionStorage.setItem("mcp_active", "true");
    sessionStorage.setItem("mcp_tools", JSON.stringify(globalToolRegistry));

    const activeSvg = `<svg style="width:14px;height:14px;margin-right:6px;stroke:#4ade80;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    updateButtonState(`${activeSvg} MCP Active (${count})`);
    injectSystemPrompt();
}

async function initializeAllServers() {
    const result = await new Promise(r => chrome.storage.local.get(['mcpServers'], r));
    const servers = result.mcpServers || [];
    globalToolRegistry = {};

    for (let srv of servers) {
        let rawUrl = typeof srv === 'string' ? srv : srv.url;
        let enabled = typeof srv === 'string' ? true : srv.enabled;

        if (!enabled) continue;

        const url = normalizeMcpUrl(rawUrl);

        try {
            let data = null;
            // 1. Try standard MCP POST
            try {
                data = await mcpFetch(url, { jsonrpc: "2.0", id: 1, method: "tools/list" }, "POST");
            } catch (e) {
                // 2. Fallback to GET for REST / Admin servers
                data = await mcpFetch(url, null, "GET");
            }

            const tools = extractToolsFromResponse(data, rawUrl);
            if (tools.length > 0) {
                tools.forEach(tool => {
                    globalToolRegistry[tool.name] = { ...tool, serverUrl: url };
                });
            }
        } catch (e) {
            console.warn(`[MCP] Server unreachable: ${url}`, e.message);
        }
    }

    sessionStorage.setItem("mcp_tools", JSON.stringify(globalToolRegistry));
}

function injectSystemPrompt() {
    const activeTools = Object.values(globalToolRegistry).filter(t => isToolActive(t.name));

    let toolDescriptions = activeTools.map((tool, index) => {
        return `${index + 1}. "${tool.name}": ${tool.description}\n   Schema: ${JSON.stringify(tool.inputSchema?.properties || {})}`;
    }).join("\n\n");

    const SYSTEM_PROMPT = `[SYSTEM INSTRUCTIONS: AUTONOMOUS EXTERNAL MCP ROUTER]
You are equipped with a live external browser-level tool execution engine.
You invoke tools by outputting raw, valid JSON inside this EXACT text boundary:

[[TOOL_CALL]]
{"name": "tool_name", "arguments": {"param1": "value1"}}
[[/TOOL_CALL]]

AVAILABLE TOOLS LIST:
${toolDescriptions}

CRITICAL RULES:
0. INITIALIZATION: This current message is just a system setup. DO NOT call any tools right now. Your only task for this message is to acknowledge it by saying exactly: "Hi dear user 🚀 I am connected and ready to assist!" and wait for the user's actual commands.
1. When the user asks you to perform an action, output [[TOOL_CALL]] immediately.
2. NEVER say "tool does not exist". The user's browser extension intercepts your text, runs the tool remotely, and sends back [[TOOL_RESULT]].
3. When given multiple items, use batch tools where available.
4. Stop generating immediately after emitting [[/TOOL_CALL]].`;

    sendMessageToAI(SYSTEM_PROMPT);
}

// 9. Tool Extraction & JSON Parser
function extractToolCallData(raw) {
    let str = raw.trim()
        .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '')
        .replace(/[\u201C\u201D\u201E\u201F«»]/g, '"')
        .replace(/[\u2018\u2019]/g, "'");

    try {
        const parsed = JSON.parse(str);
        if (parsed && parsed.name) return parsed;
    } catch (e) {}

    const nameMatch = str.match(/"name"\s*:\s*"([^"]+)"/);
    if (!nameMatch) return null;
    const toolName = nameMatch[1];

    const argsMatch = str.match(/"arguments"\s*:\s*(\{[\s\S]*?\})/);
    if (argsMatch) {
        try {
            return { name: toolName, arguments: JSON.parse(argsMatch[1]) };
        } catch (e) {
            return { name: toolName, arguments: {} };
        }
    }

    return { name: toolName, arguments: {} };
}

// 10. Execution Loop & Dynamic Re-Mount

// 11. Visual Disguise for MCP Blocks (DeepSeek Only)
function disguiseMCPBlocks() {
    if (!location.hostname.includes("deepseek.com")) return;

    // Scope search ONLY to chat message content containers (never input bar/footer)
    const messageBlocks = document.querySelectorAll(
        '.ds-markdown, ' +
        '.chat-assistant, ' +
        '.chat-user, ' +
        '[data-message-author-role], ' +
        '.response-message-content, ' +
        '.message-content'
    );

    messageBlocks.forEach(msgBlock => {
        // Strict guard: ensure it is not inside any input/editor/footer area
        if (msgBlock.closest('textarea, input, [contenteditable="true"], form, #chat-input, [class*="input"], [class*="footer"], [class*="composer"], [class*="bottom"]')) {
            return;
        }

        const walker = document.createTreeWalker(msgBlock, NodeFilter.SHOW_TEXT, null, false);
        let node;
        const targetNodes = [];
        
        while ((node = walker.nextNode())) {
            const text = node.nodeValue;
            if (text.includes("[SYSTEM INSTRUCTIONS: AUTONOMOUS EXTERNAL MCP ROUTER]")) {
                targetNodes.push({ node, type: 'system' });
            } else if (text.includes("[[TOOL_RESULT]]")) {
                targetNodes.push({ node, type: 'result' });
            }
        }

        targetNodes.forEach(item => {
            let container = item.node.parentElement;
            if (!container) return;

            // Extra safety: double check parent tree
            if (container.closest('textarea, input, [contenteditable="true"], form, #chat-input, [class*="input"], [class*="footer"], [class*="composer"], [class*="bottom"]')) {
                return;
            }

            if (item.type === 'result') {
                const preBlock = container.closest('pre, code');
                if (preBlock && msgBlock.contains(preBlock)) container = preBlock;
            }

            // Ignore hidden React measurement clones
            const rect = container.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0 || container.style.visibility === "hidden") {
                if (container.dataset.mcpDisguised !== "true") return; 
            }

            if (container.dataset.mcpDisguised === "true") return;
            container.dataset.mcpDisguised = "true";
            
            container.style.display = "none";

            const uiDiv = document.createElement("div");
            uiDiv.className = "mcp-disguised-badge";
            Object.assign(uiDiv.style, {
                display: "inline-flex",
                alignItems: "center",
                gap: "10px",
                padding: "6px 12px",
                borderRadius: "8px",
                fontFamily: "'Geist Mono', monospace",
                width: "fit-content",
                marginTop: "4px",
                marginBottom: "4px"
            });

            if (item.type === 'system') {
                uiDiv.style.background = "rgba(16, 185, 129, 0.1)";
                uiDiv.style.border = "1px solid rgba(16, 185, 129, 0.3)";
                const imgPath = chrome.runtime.getURL("assets/activated.svg");
                uiDiv.innerHTML = `
                    <img src="${imgPath}" alt="MCP" style="width: 20px; height: 20px; border-radius: 4px; object-fit: contain; flex-shrink: 0;">
                    <div style="display: flex; flex-direction: column;">
                        <span style="font-weight: 600; font-size: 12px; color: #4ade80; line-height: 1.2;">MCP ROUTER INITIALIZED</span>
                        <span style="font-size: 10px; color: #a1a1aa; line-height: 1.2;">Tools active & ready</span>
                    </div>
                `;
            } else {
                uiDiv.style.background = "rgba(59, 130, 246, 0.1)";
                uiDiv.style.border = "1px solid rgba(59, 130, 246, 0.3)";
                const imgPath = chrome.runtime.getURL("assets/mcp_responded.svg");
                uiDiv.innerHTML = `
                    <img src="${imgPath}" alt="Result" style="width: 20px; height: 20px; border-radius: 4px; object-fit: contain; flex-shrink: 0;">
                    <div style="display: flex; flex-direction: column;">
                        <span style="font-weight: 600; font-size: 12px; color: #3b82f6; line-height: 1.2;">TOOL RESULT RETURNED</span>
                        <span style="font-size: 10px; color: #a1a1aa; line-height: 1.2;">Data successfully fed back to model</span>
                    </div>
                `;
            }
            
            container.parentNode.insertBefore(uiDiv, container);
        });
    });
}

setInterval(async () => {
    ensurePillNavbar();
    disguiseMCPBlocks();

    if (!isAgentActive) return;
    if (isAIGenerating()) return;

    const assistantNodes = document.querySelectorAll(
        'model-response, ' +
        '.markdown-main-panel, ' +
        'message-content, ' +
        '[data-message-author-role="assistant"], ' +
        '[data-message-part-type="answer"], ' +
        '.markdown-container-style, ' +
        '.ds-markdown, ' +
        '.markdown-prose, ' +
        '.chat-assistant, ' +
        '.response-message-content, ' +
        '.qwen-markdown'
    );

    for (let node of assistantNodes) {
        if (node.dataset.mcpHandled === "true") continue;

        const text = node.innerText || node.textContent || "";
        if (!text.includes("[[TOOL_CALL]]") && !text.includes("<tool_call>")) continue;

        const strictRegex = /\[\[TOOL_CALL\]\]([\s\S]*?)\[\[\/TOOL_CALL\]\]|<tool_call>([\s\S]*?)<\/tool_call>/gi;
        let match;
        let resultsToReturn = [];

        while ((match = strictRegex.exec(text)) !== null) {
            const innerContent = (match[1] || match[2] || '').trim();
            if (!innerContent) continue;

            const startIndex = innerContent.indexOf('{');
            const endIndex = innerContent.lastIndexOf('}');
            if (startIndex === -1 || endIndex === -1) continue;

            const jsonSubstring = innerContent.substring(startIndex, endIndex + 1);
            const toolData = extractToolCallData(jsonSubstring);

            if (!toolData || !toolData.name || toolData.name === "tool_name") continue;

            node.dataset.mcpHandled = "true";

            updateButtonState(`<svg style="width:14px;height:14px;margin-right:6px;animation:spin 1s linear infinite;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 2v4"></path></svg> Running ${toolData.name}...`, true);

            const result = await executeToolCall(toolData.name, toolData.arguments || {});
            resultsToReturn.push(result);
        }

        if (resultsToReturn.length > 0) {
            const combinedMessage = resultsToReturn.map(r => `[[TOOL_RESULT]]\n${JSON.stringify(r, null, 2)}\n[[/TOOL_RESULT]]`).join('\n\n');
            await sendMessageToAI(combinedMessage);

            const activeSvg = `<svg style="width:14px;height:14px;margin-right:6px;stroke:#4ade80;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
            updateButtonState(`${activeSvg} MCP Active (${getActiveToolCount()})`);
        }
    }
}, 500);

async function executeToolCall(toolName, args) {
    const tool = globalToolRegistry[toolName];
    if (!tool) {
        return { error: `Tool '${toolName}' not found or disabled` };
    }

    try {
        const data = await mcpFetch(tool.serverUrl, {
            jsonrpc: "2.0",
            id: Date.now(),
            method: "tools/call",
            params: { name: toolName, arguments: args }
        }, "POST");
        return data;
    } catch (error) {
        return { error: `Failed to reach server for ${toolName}: ${error.message}` };
    }
}

// Live Storage Sync
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.mcpServers) {
        initializeAllServers().then(() => {
            if (isAgentActive) {
                const count = getActiveToolCount();
                const activeSvg = `<svg style="width:14px;height:14px;margin-right:6px;stroke:#4ade80;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
                updateButtonState(`${activeSvg} MCP Active (${count})`);
            }
        });
    }
});

const style = document.createElement('style');
style.innerHTML = `@keyframes spin { 100% { transform: rotate(360deg); } }`;
document.head?.appendChild(style);

ensurePillNavbar();
    disguiseMCPBlocks();
