# MCP AI Agent Router (Chrome Extension)

A universal Model Context Protocol (MCP) client and autonomous tool agent for web-based AI interfaces. Connect remote MCP servers and execute tools seamlessly within web LLM chats such as DeepSeek, Gemini, Qwen, Duck.ai, Mistral, and Z.ai.

---

## ✨ Features

- 🔌 **Universal MCP Compatibility**: Connects to standard MCP JSON-RPC endpoints, custom REST tool lists, and remote MCP routers.
- 🌐 **Multi-Platform Web LLM Support**:
  - DeepSeek (`deepseek.com`)
  - Google Gemini (`gemini.google.com`)
  - Qwen (`qwen.ai`)
  - DuckDuckGo AI (`duck.ai`)
  - Mistral AI (`mistral.ai`)
  - Z.ai (`z.ai`)
- 🤖 **Autonomous Multi-Step Execution Loop**: Injects dynamic system instructions and schema prompts, monitors chat responses for tool execution calls, runs remote tools via background service workers, and injects results back into the conversation for continuous execution until completion.
- 🎛️ **Modern Popup Manager**:
  - Live server connection health monitoring (online / error indicators).
  - Enable / disable individual servers or specific tools.
  - Inspect server tool catalogs with schema arguments and parameter details.
- ⚡ **Manifest V3 Architecture**: Secure background proxying (`background.js`) to prevent CORS issues when communicating with local/remote MCP servers.

---

## 📁 Repository Structure

```
deepseek-mcp-extension/
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
   git clone <repository-url>
   ```

2. **Load the extension in Chrome / Brave / Edge**:
   - Open your browser and navigate to `chrome://extensions/` (or `edge://extensions/`).
   - Enable **Developer mode** (toggle located in the top-right corner).
   - Click **Load unpacked** and select the `deepseek-mcp-extension` directory.

---

## 🛠️ Usage

1. **Add MCP Servers**:
   - Click the extension icon in your browser toolbar to open the MCP Agent Manager.
   - Enter your MCP server URL (e.g. `https://your-mcp-server.com/mcp` or `http://localhost:8000/mcp`) and click **Add**.
   - The extension automatically discovers and displays all available tools exposed by the server.

2. **Use in AI Web Chats**:
   - Open any supported platform (e.g., DeepSeek, Gemini, Qwen).
   - The MCP Agent overlay button will appear in the chat interface.
   - Toggle the agent **ON** and prompt the AI as usual (e.g., *"Check the latest status using available tools"*).
   - The extension will inject tool definitions, catch AI tool requests, invoke the MCP server, and feed responses back to the model automatically.

---

## 📄 License

MIT License. Feel free to use and contribute!
