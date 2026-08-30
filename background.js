// Background Service Worker - Proxy for all MCP calls
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "MCP_FETCH") {
    const { url, body, method = "POST", timeoutMs = 8000 } = message;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const fetchOptions = {
      method: method,
      headers: { "Content-Type": "application/json" },
      signal: controller.signal
    };

    if (method === "POST" && body) {
      fetchOptions.body = JSON.stringify(body);
    }

    fetch(url, fetchOptions)
      .then(async (res) => {
        clearTimeout(timer);
        const data = await res.json().catch(() => null);
        if (!res.ok && !data) {
          sendResponse({ success: false, error: `HTTP ${res.status}` });
        } else {
          sendResponse({ success: true, data });
        }
      })
      .catch((err) => {
        clearTimeout(timer);
        sendResponse({ success: false, error: err.message });
      });

    return true; // Keep message channel open for async response
  }
});
