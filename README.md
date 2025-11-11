# Cursor Codebase Search

> Enhanced semantic codebase search powered by Cursor API with multi-project support and MCP integration

**[English](#english) | [中文](#中文)**

---

## English

### Overview

An enhanced fork of [cometix-indexer](https://github.com/cometix/cometix-indexer) that provides semantic code search capabilities through CLI indexing and MCP server integration. This project separates indexing operations (user-controlled via CLI) from search functionality (AI-controlled via MCP server).

### Key Features

- **Multi-Project Index Support** - Manage and search across multiple codebases simultaneously
- **Progress Visualization** - Real-time progress bars during indexing operations
- **Separated Operations** - CLI handles indexing/activation; MCP server exposes read-only `codebase_search` tool
- **Ignore File Support** - Respects `.ignore` and `.cursorignore` files for precise index control
- **Environment Configuration** - `.env` file support for secure credential management
- **Enhanced Search Results** - Function/class signatures with code previews in search output
- **Bug Fixes** - Resolved path decryption errors and ESM import extension issues

### Installation

```bash
# Global installation from GitHub
npm install -g git+https://github.com/Cedriccmh/cursor-codebase-search.git

# Or local development
git clone https://github.com/Cedriccmh/cursor-codebase-search.git
cd cursor-codebase-search
npm install
npm run build
npm link
```

### Quick Start

**1. Configure Environment**

```bash
cp .env.example .env
# Edit .env and add your CURSOR_AUTH_TOKEN
```

**2. Index a Workspace**

```bash
mcp-cursearch index-activate /path/to/your/project
```

**3. Configure MCP Server**

Add to your MCP client configuration (e.g., Claude Desktop):

```json
{
  "mcpServers": {
    "cursor-search": {
      "command": "node",
      "args": ["/path/to/cursor-codebase-search/dist/mcp.js"],
      "env": {
        "CURSOR_AUTH_TOKEN": "your-token-here"
      }
    }
  }
}
```

### CLI Commands

| Command | Description |
|---------|-------------|
| `index-activate <path>` | Index and activate a workspace for search |
| `list` | List all indexed workspaces |
| `status [path]` | Show workspace status |
| `deactivate` | Deactivate current workspace |
| `help` | Show command help |

### MCP Tool: `codebase_search`

**Parameters:**
- `query` (string, required) - Search query
- `paths_include_glob` (string, optional) - Include pattern
- `paths_exclude_glob` (string, optional) - Exclude pattern
- `max_results` (number, optional) - Max results (default: 10)

**Example:**
```json
{
  "query": "authentication logic",
  "paths_include_glob": "src/**/*.ts",
  "max_results": 20
}
```

### Configuration

**Environment Variables:**

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CURSOR_AUTH_TOKEN` | ✅ | - | Cursor API token |
| `CURSOR_BASE_URL` | ❌ | `https://api2.cursor.sh` | API endpoint |
| `LOG_LEVEL` | ❌ | `info` | Logging level |

**Get CURSOR_AUTH_TOKEN:**
Visit https://cursor.meteormail.me/ (⚠️ third-party tool)

### Retry Configuration

**Semaphore Retry Logging:** Automatically retries failed file upload and sync operations with detailed logging. Configure retry behavior via `.env` to handle network issues or API rate limits gracefully. Set `SEMAPHORE_RETRY_COUNT` (default: 3) for retry attempts and `SEMAPHORE_RETRY_DELAY_MS` (default: 200) for base delay between retries.

| Variable | Default | Description |
|----------|---------|-------------|
| `SEMAPHORE_RETRY_COUNT` | `3` | Number of retry attempts for failed operations |
| `SEMAPHORE_RETRY_DELAY_MS` | `200` | Base delay in ms between retries (multiplied by attempt number) |

### Data Storage

```
~/.mcp-cursearch/
├── <workspace-hash>/
│   ├── state.json           # CodebaseId, pathKey, metadata
│   └── embeddable_files.txt # Indexable file list
└── active.json              # Active workspace reference
```

### Differences from cometix-indexer

- ✨ **Multi-project management** - Index and switch between multiple codebases
- 📊 **Progress indicators** - Visual feedback during indexing
- 🔧 **CLI/MCP separation** - Clear separation of concerns for better security
- 📁 **Ignore file support** - `.cursorignore` and `.ignore` integration
- ⚙️ **`.env` configuration** - Simplified credential management
- 🐛 **Bug fixes** - Path decryption and ESM import issues resolved
- 🔍 **Enhanced results** - Better context in search output

### Requirements

- Node.js >= 18
- Cursor API token

### License

MIT

### Documentation

- [CLI Implementation](docs/CLI_IMPLEMENTATION.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)

---

## 中文

### 概述

[cometix-indexer](https://github.com/cometix/cometix-indexer) 的增强版本，通过 CLI 索引和 MCP 服务器集成提供语义代码搜索功能。本项目将索引操作（用户通过 CLI 控制）与搜索功能（AI 通过 MCP 服务器控制）分离。

### 核心功能

- **多项目索引支持** - 同时管理和搜索多个代码库
- **进度可视化** - 索引操作时显示实时进度条
- **操作分离** - CLI 处理索引/激活；MCP 服务器仅暴露只读 `codebase_search` 工具
- **忽略文件支持** - 支持 `.ignore` 和 `.cursorignore` 文件以精确控制索引
- **环境配置** - 支持 `.env` 文件进行安全凭证管理
- **增强搜索结果** - 搜索输出包含函数/类签名和代码预览
- **Bug 修复** - 解决路径解密错误和 ESM 导入扩展问题

### 安装

```bash
# 从 GitHub 全局安装
npm install -g git+https://github.com/Cedriccmh/cursor-codebase-search.git

# 或本地开发
git clone https://github.com/Cedriccmh/cursor-codebase-search.git
cd cursor-codebase-search
npm install
npm run build
npm link
```

### 快速开始

**1. 配置环境**

```bash
cp .env.example .env
# 编辑 .env 文件并添加 CURSOR_AUTH_TOKEN
```

**2. 索引工作区**

```bash
mcp-cursearch index-activate /path/to/your/project
```

**3. 配置 MCP 服务器**

在 MCP 客户端配置中添加（如 Claude Desktop）：

```json
{
  "mcpServers": {
    "cursor-search": {
      "command": "node",
      "args": ["/path/to/cursor-codebase-search/dist/mcp.js"],
      "env": {
        "CURSOR_AUTH_TOKEN": "your-token-here"
      }
    }
  }
}
```

### CLI 命令

| 命令 | 说明 |
|------|------|
| `index-activate <path>` | 索引并激活工作区 |
| `list` | 列出所有已索引工作区 |
| `status [path]` | 显示工作区状态 |
| `deactivate` | 停用当前工作区 |
| `help` | 显示命令帮助 |

### MCP 工具: `codebase_search`

**参数:**
- `query` (字符串, 必需) - 搜索查询
- `paths_include_glob` (字符串, 可选) - 包含模式
- `paths_exclude_glob` (字符串, 可选) - 排除模式
- `max_results` (数字, 可选) - 最大结果数（默认: 10）

**示例:**
```json
{
  "query": "authentication logic",
  "paths_include_glob": "src/**/*.ts",
  "max_results": 20
}
```

### 配置

**环境变量:**

| 变量 | 必需 | 默认值 | 说明 |
|------|------|--------|------|
| `CURSOR_AUTH_TOKEN` | ✅ | - | Cursor API 令牌 |
| `CURSOR_BASE_URL` | ❌ | `https://api2.cursor.sh` | API 端点 |
| `LOG_LEVEL` | ❌ | `info` | 日志级别 |

**获取 CURSOR_AUTH_TOKEN:**
访问 https://cursor.meteormail.me/ （⚠️ 第三方工具）

### 重试配置

**信号量重试日志:** 自动重试失败的文件上传和同步操作，并提供详细日志记录。通过 `.env` 配置重试行为，优雅处理网络问题或 API 速率限制。设置 `SEMAPHORE_RETRY_COUNT`（默认: 3）控制重试次数，`SEMAPHORE_RETRY_DELAY_MS`（默认: 200）控制重试间隔基础延迟。

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `SEMAPHORE_RETRY_COUNT` | `3` | 失败操作的重试次数 |
| `SEMAPHORE_RETRY_DELAY_MS` | `200` | 重试间隔基础延迟（毫秒，按尝试次数倍增） |

### 数据存储

```
~/.mcp-cursearch/
├── <workspace-hash>/
│   ├── state.json           # CodebaseId, pathKey, 元数据
│   └── embeddable_files.txt # 可索引文件列表
└── active.json              # 活动工作区引用
```

### 与 cometix-indexer 的区别

- ✨ **多项目管理** - 索引和切换多个代码库
- 📊 **进度指示器** - 索引期间的可视反馈
- 🔧 **CLI/MCP 分离** - 更好的安全性关注点分离
- 📁 **忽略文件支持** - 集成 `.cursorignore` 和 `.ignore`
- ⚙️ **`.env` 配置** - 简化凭证管理
- 🐛 **Bug 修复** - 解决路径解密和 ESM 导入问题
- 🔍 **增强结果** - 搜索输出提供更好的上下文

### 要求

- Node.js >= 18
- Cursor API 令牌

### 许可证

MIT

### 文档

- [CLI 实现](docs/CLI_IMPLEMENTATION.md)
- [故障排除](docs/TROUBLESHOOTING.md)

---

**基于 [cometix-indexer](https://github.com/cometix/cometix-indexer) 增强开发**
