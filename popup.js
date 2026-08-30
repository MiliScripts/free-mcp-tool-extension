document.addEventListener("DOMContentLoaded", () => {
  const serverInput = document.getElementById("serverUrl");
  const addBtn = document.getElementById("addBtn");
  const serverList = document.getElementById("serverList");
  const activeCountBadge = document.getElementById("activeCountBadge");
  const toolTotalBadge = document.getElementById("toolTotalBadge");

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

  const safeBgFetch = (url, body, method = "POST") => {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "MCP_FETCH", url, body, method }, (res) => {
        if (chrome.runtime.lastError || !res || !res.success) {
          return reject(new Error(res?.error || "Fetch failed"));
        }
        resolve(res.data);
      });
    });
  };

  function extractTools(data) {
    if (!data) return [];
    if (data.result && Array.isArray(data.result.tools)) return data.result.tools;
    if (Array.isArray(data.tools)) return data.tools;
    if (Array.isArray(data.available_tools)) {
      return data.available_tools.map(t => typeof t === "string" ? { name: t, description: `Admin tool ${t}` } : t);
    }
    return [];
  }

  const loadServers = () => {
    chrome.storage.local.get(["mcpServers"], async (result) => {
      const servers = result.mcpServers || [];
      serverList.innerHTML = "";

      const activeCount = servers.filter(s => typeof s === "string" ? true : s.enabled).length;
      activeCountBadge.textContent = `${activeCount} Active`;

      if (servers.length === 0) {
        serverList.innerHTML = `<p style="text-align:center;color:#64748b;font-size:12px;padding:20px;">No MCP servers registered yet.</p>`;
        toolTotalBadge.textContent = `0 Tools ready`;
        return;
      }

      let totalToolsDiscovered = 0;

      for (let index = 0; index < servers.length; index++) {
        const srv = servers[index];
        const rawUrl = typeof srv === "string" ? srv : srv.url;
        const enabled = typeof srv === "string" ? true : srv.enabled;

        const card = document.createElement("div");
        card.className = "server-card";

        card.innerHTML = `
          <div class="card-top">
            <div class="url-info">
              <div class="status-indicator ${enabled ? 'online' : ''}" id="status-${index}"></div>
              <div class="url-text" title="${rawUrl}">${rawUrl}</div>
            </div>
            <div class="card-actions">
              <button class="btn-icon" title="Refresh Tools" id="ping-${index}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
              </button>
              <label class="toggle-switch">
                <input type="checkbox" ${enabled ? "checked" : ""} id="toggle-${index}">
                <span class="slider"></span>
              </label>
              <button class="btn-icon danger" title="Delete" id="del-${index}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </div>
          </div>
          <div class="tools-drawer" id="tools-${index}"><span style="font-size:11px;color:#64748b;">Discovering tools...</span></div>
        `;

        serverList.appendChild(card);

        document.getElementById(`del-${index}`).onclick = () => removeServer(index);
        document.getElementById(`toggle-${index}`).onchange = (e) => toggleServer(index, e.target.checked);
        document.getElementById(`ping-${index}`).onclick = () => fetchToolsForServer(rawUrl, index);

        if (enabled) {
          fetchToolsForServer(rawUrl, index, (count) => {
            totalToolsDiscovered += count;
            toolTotalBadge.textContent = `${totalToolsDiscovered} Tools ready`;
          });
        }
      }
    });
  };

  const fetchToolsForServer = async (rawUrl, index, onComplete) => {
    const statusDot = document.getElementById(`status-${index}`);
    const toolsContainer = document.getElementById(`tools-${index}`);
    const url = normalizeMcpUrl(rawUrl);

    try {
      let data = null;
      try {
        data = await safeBgFetch(url, { jsonrpc: "2.0", id: 1, method: "tools/list" }, "POST");
      } catch (e) {
        data = await safeBgFetch(url, null, "GET");
      }

      const tools = extractTools(data);

      if (statusDot) statusDot.className = "status-indicator online";

      if (tools.length > 0) {
        toolsContainer.innerHTML = tools.map(t => `<div class="tool-pill" title="${t.description || ''}">✔ ${t.name}</div>`).join("");
      } else {
        toolsContainer.innerHTML = `<span style="font-size:11px;color:#94a3b8;">Connected (0 tools exposed)</span>`;
      }

      if (onComplete) onComplete(tools.length);
    } catch (err) {
      if (statusDot) statusDot.className = "status-indicator error";
      toolsContainer.innerHTML = `<span style="font-size:11px;color:#f87171;">Offline or unreachable</span>`;
      if (onComplete) onComplete(0);
    }
  };

  const addServer = () => {
    let url = serverInput.value.trim();
    if (!url) return;

    chrome.storage.local.get(["mcpServers"], (result) => {
      const servers = result.mcpServers || [];
      if (!servers.some(s => (typeof s === "string" ? s : s.url) === url)) {
        servers.push({ url: url, enabled: true });
        chrome.storage.local.set({ mcpServers: servers }, () => {
          serverInput.value = "";
          loadServers();
        });
      }
    });
  };

  const removeServer = (index) => {
    chrome.storage.local.get(["mcpServers"], (result) => {
      let servers = result.mcpServers || [];
      servers.splice(index, 1);
      chrome.storage.local.set({ mcpServers: servers }, loadServers);
    });
  };

  const toggleServer = (index, isEnabled) => {
    chrome.storage.local.get(["mcpServers"], (result) => {
      let servers = result.mcpServers || [];
      if (typeof servers[index] === "string") {
        servers[index] = { url: servers[index], enabled: isEnabled };
      } else {
        servers[index].enabled = isEnabled;
      }
      chrome.storage.local.set({ mcpServers: servers }, loadServers);
    });
  };

  addBtn.addEventListener("click", addServer);
  serverInput.addEventListener("keydown", (e) => { if (e.key === "Enter") addServer(); });

  loadServers();
});
