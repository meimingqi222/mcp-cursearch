/**
 * Watcher manager to prevent duplicate file watchers
 */

import { startFileWatcher as baseStartFileWatcher } from "./fileWatcher.js";

// 全局 Map 跟踪已启动的监听器
const activeWatchers = new Map<string, boolean>();

/**
 * Start file watcher with duplicate prevention
 */
export function startFileWatcher(workspacePath: string): void {
  // 防止重复启动：如果已存在该路径的监听器，直接返回
  if (activeWatchers.has(workspacePath)) {
    return;
  }

  // 标记为已启动
  activeWatchers.set(workspacePath, true);

  // 调用原始的 startFileWatcher
  baseStartFileWatcher(workspacePath);
}

/**
 * Check if a watcher is active for a workspace
 */
export function isWatcherActive(workspacePath: string): boolean {
  return activeWatchers.has(workspacePath);
}

/**
 * Mark a watcher as inactive (for cleanup)
 */
export function deactivateWatcher(workspacePath: string): void {
  activeWatchers.delete(workspacePath);
}