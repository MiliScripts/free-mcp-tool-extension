# Free MCP Tool Extension 🚀

A free, open-source, universal Model Context Protocol (MCP) tool runner and autonomous agent router for web AI chats. Seamlessly connect local or remote MCP servers and execute tools directly inside web LLMs like DeepSeek, Google Gemini, Qwen, DuckDuckGo AI, Mistral, and Z.ai.

---

## ✨ Key Features

- 🔌 **Universal MCP Compatibility**: Connects to standard MCP JSON-RPC endpoints, custom REST tool lists, and remote MCP routers without extra backend setup.
- 🌐 **Multi-Platform Web LLM Support**:
  - DeepSeek (`deepseek.com`)
  - Google Gemini (`gemini.google.com`)
  - Qwen (`qwen.ai`)
  - DuckDuckGo AI (`duck.ai`)
  - Mistral AI (`mistral.ai`)
  - Z.ai (`z.ai`)
- 🤖 **Autonomous Multi-Step Tool Execution Loop**:
  - Injects dynamic schema prompts and tool capabilities.
  - Automatically intercepts AI tool execution calls.
  - Executes remote tools via background service workers with full CORS handling.
  - Feeds results back into the conversation for continuous execution until task completion.
- 🎛️ **Modern Popup Dashboard**:
  - Live server connection health monitoring (online / error indicators).
  - Enable / disable individual servers or specific tools on the fly.
  - Inspect server tool catalogs with schema arguments and parameter details.
- ⚡ **Manifest V3 Compliant**: Fast, lightweight, and secure.

---

## 📁 Repository Structure

```
free-mcp-tool-extension/
├── manifest.json       # Chrome extension Manifest V3 configuration
├── popup.html          # Extension popup UI (modern dark theme)
├── popup.js            # Server management, live tool registry, and toggles
├── content.js          # Injected runtime: chat detection, tool calling loop, and UI controls
├── background.js       # Background service worker for MCP fetch requests & CORS bypass
├── .gitignore          # Git ignore file
└── README.md           # Documentation
```

---

## 🚀 Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/YOUR_USERNAME/free-mcp-tool-extension.git
   ```

2. **Load the extension in Chrome / Brave / Edge / Arc**:
   - Open your browser and navigate to `chrome://extensions/` (or `edge://extensions/`).
   - Enable **Developer mode** (toggle located in the top-right corner).
   - Click **Load unpacked** and select this extension's directory (`free-mcp-tool-extension`).

---

## 🛠️ How to Use

1. **Add MCP Servers**:
   - Click the extension icon in your browser toolbar to open the **Free MCP Tool Extension** dashboard.
   - Enter your MCP server URL (e.g. `https://your-mcp-server.com/mcp` or `http://localhost:8000/mcp`) and click **Add**.
   - The extension will automatically discover and display all tools exposed by the server.

2. **Use in AI Web Chats**:
   - Open any supported platform (e.g., DeepSeek, Gemini, Qwen).
   - The floating MCP Agent status badge will appear in the chat interface.
   - Ensure the agent is toggled **ON** and prompt the AI as usual (e.g., *"Check the latest status using available tools"*).
   - The extension takes care of tool execution and multi-step feedback loops automatically.

---

## 💡 Recommended GitHub Repository Names

- `free-mcp-tool-extension` *(Recommended)*
- `free-mcp-web-extension`
- `mcp-ai-agent-extension`

---

## 📄 License

MIT License. Free and open source!
