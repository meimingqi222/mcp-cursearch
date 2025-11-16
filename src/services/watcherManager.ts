/**
 * Watcher manager to prevent duplicate file watchers
 */

import { startFileWatcher as baseStartFileWatcher, FileWatcherHandle } from "./fileWatcher.js";

// 全局 Map 跟踪已启动的监听器
const activeWatchers = new Map<string, FileWatcherHandle>();
let cleanupRegistered = false;

async function closeAllWatchers() {
  const handles = Array.from(activeWatchers.values());
  activeWatchers.clear();
  await Promise.all(handles.map(async (handle) => {
    try {
      await handle.close();
    } catch {
      // 忽略关闭错误，进程即将结束
    }
  }));
}

function ensureProcessCleanupHook() {
  if (cleanupRegistered) return;
  cleanupRegistered = true;
  const cleanup = () => { void closeAllWatchers(); };
  process.once("SIGINT", cleanup);
  process.once("SIGTERM", cleanup);
  process.once("exit", cleanup);
}

/**
 * Start file watcher with duplicate prevention
 */
export function startFileWatcher(workspacePath: string): void {
  // 防止重复启动：如果已存在该路径的监听器，直接返回
  if (activeWatchers.has(workspacePath)) {
    return;
  }

  ensureProcessCleanupHook();

  // 调用原始的 startFileWatcher 并保存句柄
  const handle = baseStartFileWatcher(workspacePath);
  activeWatchers.set(workspacePath, handle);
}

/**
 * Check if a watcher is active for a workspace
 */
export function isWatcherActive(workspacePath: string): boolean {
  return activeWatchers.has(workspacePath);
}

/**
 * Stop watcher for workspace
 */
export async function stopFileWatcher(workspacePath: string): Promise<void> {
  const handle = activeWatchers.get(workspacePath);
  if (!handle) return;
  activeWatchers.delete(workspacePath);
  await handle.close();
}

/**
 * Stop all watchers (e.g. during teardown)
 */
export async function stopAllWatchers(): Promise<void> {
  await closeAllWatchers();
}