import path from "path";
import fs from "fs-extra";
import ignore, { Ignore } from "ignore";
import { getTextExtensions } from "./env.js";

const IGNORE_PATTERNS: string[] = [
  "node_modules/",
  ".git/",
  ".cursor/",
  "dist/",
  "build/",
  "/coverage/",
  "/.nyc_output/",
  ".DS_Store",
  "Thumbs.db",
  ".env",
  ".env.",
];

// Cache for ignore matchers per workspace
const ignoreCache = new Map<string, Ignore>();

/**
 * Read and parse .gitignore and .cursorignore files from the workspace root
 * Returns an ignore instance with patterns from both files
 */
function loadIgnorePatterns(workspacePath: string): Ignore {
  // Check cache first
  if (ignoreCache.has(workspacePath)) {
    return ignoreCache.get(workspacePath)!;
  }

  const ig = ignore();

  // Add default hardcoded patterns
  ig.add(IGNORE_PATTERNS);

  // Read .gitignore
  const gitignorePath = path.join(workspacePath, ".gitignore");
  try {
    if (fs.existsSync(gitignorePath)) {
      const content = fs.readFileSync(gitignorePath, "utf8");
      ig.add(content);
    }
  } catch (err) {
    // Silently ignore errors reading .gitignore
  }

  // Read .cursorignore
  const cursorignorePath = path.join(workspacePath, ".cursorignore");
  try {
    if (fs.existsSync(cursorignorePath)) {
      const content = fs.readFileSync(cursorignorePath, "utf8");
      ig.add(content);
    }
  } catch (err) {
    // Silently ignore errors reading .cursorignore
  }

  // Cache the result
  ignoreCache.set(workspacePath, ig);
  return ig;
}

/**
 * Clear the ignore cache for a specific workspace or all workspaces
 * Useful when .gitignore or .cursorignore files are modified
 */
export function clearIgnoreCache(workspacePath?: string): void {
  if (workspacePath) {
    ignoreCache.delete(workspacePath);
  } else {
    ignoreCache.clear();
  }
}

export function shouldIgnore(fileAbs: string, workspacePath: string): boolean {
  const rel = path.relative(workspacePath, fileAbs).replace(/\\/g, "/");

  // 首先检查硬编码模式以快速过滤
  const matchesHardcoded = IGNORE_PATTERNS.some((p) =>
    (p.endsWith("/") ? rel.startsWith(p) : rel.includes(p))
  );
  if (matchesHardcoded) {
    return true;
  }

  // 然后检查 .gitignore 和 .cursorignore 模式
  const ig = loadIgnorePatterns(workspacePath);
  if (ig.ignores(rel)) {
    return true;
  }

  // 检查文件后缀是否在支持列表中（仅对文件进行检查）
  try {
    const stats = fs.statSync(fileAbs);
    if (stats.isFile()) {
      const ext = path.extname(fileAbs).toLowerCase();
      const supportedExtensions = getTextExtensions();
      if (!supportedExtensions.includes(ext)) {
        return true;
      }
    }
  } catch (err) {
    // 如果无法获取文件状态，默认不忽略
  }

  return false;
}

export async function listFiles(workspacePath: string, limit = 1000): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (shouldIgnore(full, workspacePath)) continue;
      if (e.isDirectory()) {
        await walk(full);
        if (out.length >= limit) return;
      } else if (e.isFile()) {
        out.push(full);
        if (out.length >= limit) return;
      }
    }
  }
  await walk(workspacePath);
  return out;
}

export async function readEmbeddableFilesList(root: string, listPath: string): Promise<string[]> {
  const p = path.isAbsolute(listPath) ? listPath : path.join(root, listPath);
  try {
    const content = await fs.readFile(p, "utf8");
    const lines = content.split(/\r?\n/);
    const out: string[] = [];
    for (const line of lines) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      out.push(path.isAbsolute(t) ? t : path.join(root, t));
    }
    return out;
  } catch {
    return [];
  }
}


