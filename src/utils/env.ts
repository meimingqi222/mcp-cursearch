import os from "os";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { config } from "dotenv";

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file in the package root
// The compiled file is at: <package-root>/dist/utils/env.js
// So we need to go up 2 levels to reach the package root: ../../.env
const envPath = path.resolve(__dirname, "../../.env");
config({ path: envPath });

export type ResolvedConfig = {
  authToken: string;
  baseUrl: string;
  logLevel: "debug" | "info" | "warning" | "error";
};

export function resolveAuthAndBaseUrlFromCliAndEnv(argv: string[]): ResolvedConfig {
  let authToken = process.env.CURSOR_AUTH_TOKEN || process.env.AUTH_TOKEN || "";
  let baseUrl = (process.env.CURSOR_BASE_URL || "https://api2.cursor.sh").replace(/\/$/, "");
  let logLevel = (process.env.LOG_LEVEL as ResolvedConfig["logLevel"]) || "info";

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--auth-token") {
      const v = argv[i + 1];
      if (v) authToken = v;
      i++;
    } else if (a === "--base-url") {
      const v = argv[i + 1];
      if (v) baseUrl = v.replace(/\/$/, "");
      i++;
    } else if (a === "--log-level") {
      const v = argv[i + 1];
      if (v === "debug" || v === "info" || v === "warning" || v === "error") logLevel = v;
      i++;
    }
  }
  // Allow starting without token so the MCP server can advertise tools; individual tools will error if token is missing
  return { authToken, baseUrl, logLevel };
}

export function defaultHeaders(authToken: string) {
  const h: Record<string, string> = {
    Authorization: `Bearer ${authToken}`,
    "user-agent": "connect-es/1.6.1",
    "Content-Type": "application/proto",
    "x-cursor-client-version": "1.5.5"
  };
  return h;
}

export function getProjectRootDir(): string {
  const home = os.homedir();
  return path.join(home, ".mcp-cursearch");
}

function sha256HexLocal(str: string): string {
  return crypto.createHash("sha256").update(str).digest("hex");
}

export function getProjectDirForWorkspace(workspacePath: string): string {
  const base = getProjectRootDir();
  const safeName = workspacePath
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 60) || "project";
  const hash = sha256HexLocal(workspacePath).slice(0, 10);
  return path.join(base, `${safeName}-${hash}`);
}

export const DEFAULTS = {
  SYNC_CONCURRENCY: parseInt(process.env.SYNC_CONCURRENCY || "4", 10),
  SYNC_MAX_NODES: parseInt(process.env.SYNC_MAX_NODES || "2000", 10),
  SYNC_MAX_ITERATIONS: parseInt(process.env.SYNC_MAX_ITERATIONS || "10000", 10),
  SYNC_LIST_LIMIT: parseInt(process.env.SYNC_LIST_LIMIT || "1000", 10),
  FILE_SIZE_LIMIT_BYTES: parseInt(process.env.FILE_SIZE_LIMIT_BYTES || String(2 * 1024 * 1024), 10),
  INITIAL_UPLOAD_MAX_FILES: parseInt(process.env.INITIAL_UPLOAD_MAX_FILES || "10", 10),
  PROTO_TIMEOUT_MS: parseInt(process.env.PROTO_TIMEOUT_MS || "30000", 10),
  PROTO_SEARCH_TIMEOUT_MS: parseInt(process.env.PROTO_SEARCH_TIMEOUT_MS || "60000", 10),
  AUTO_SYNC_INTERVAL_MS: parseInt(process.env.AUTO_SYNC_INTERVAL_MS || String(5 * 60 * 1000), 10),
  AUTO_SYNC_MIN_INTERVAL_MS: parseInt(process.env.AUTO_SYNC_MIN_INTERVAL_MS || String(30 * 1000), 10),
  AUTO_SYNC_MAX_INTERVAL_MS: parseInt(process.env.AUTO_SYNC_MAX_INTERVAL_MS || String(5 * 60 * 1000), 10),
  SEMAPHORE_RETRY_COUNT: parseInt(process.env.SEMAPHORE_RETRY_COUNT || "3", 10),
  SEMAPHORE_RETRY_DELAY_MS: parseInt(process.env.SEMAPHORE_RETRY_DELAY_MS || "200", 10),
};

// 内置支持的文本文件后缀列表
export const DEFAULT_TEXT_EXTENSIONS = [
  // 文档类
  ".txt", ".md", ".markdown", ".mkd", ".mkdn", ".mkdown", ".rst", ".rest", ".adoc", ".asciidoc",
  // 编程语言（主流）
  ".js", ".jsx", ".ts", ".tsx", ".py", ".java", ".c", ".cpp", ".cxx", ".cc", ".h", ".hpp", ".hxx",
  ".cs", ".php", ".rb", ".go", ".rs", ".swift", ".kt", ".scala", ".clj", ".hs", ".ml", ".m", ".r",
  ".pl", ".pm", ".sh", ".bash", ".ps1", ".lua", ".dart", ".nim", ".zig", ".v", ".ex", ".exs",
  // Web技术
  ".html", ".htm", ".css", ".scss", ".sass", ".less", ".vue", ".svelte", ".astro", ".jsx", ".tsx",
  // 配置和数据格式
  ".json", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".conf", ".xml", ".csv", ".tsv", ".env",
  // 模板和DSL
  ".sql", ".graphql", ".gql", ".proto", ".dockerfile", "dockerfile", ".makefile", "makefile",
  // 文档标记
  ".tex", ".latex", ".bib", ".rtf", ".org", ".wiki", ".mediawiki",
];

// 从环境变量解析自定义后缀列表
export function getTextExtensions(): string[] {
  const customExt = process.env.TEXT_EXTENSIONS;
  if (!customExt) {
    return DEFAULT_TEXT_EXTENSIONS;
  }
  
  // 分割并清理后缀列表
  const extensions = customExt
    .split(",")
    .map(ext => ext.trim())
    .filter(ext => ext.length > 0)
    .map(ext => ext.startsWith(".") ? ext : "." + ext);
  
  return [...new Set([...DEFAULT_TEXT_EXTENSIONS, ...extensions])];
}


