import chokidar from "chokidar";
import path from "path";
import { saveWorkspaceState, loadWorkspaceState } from "./stateManager.js";
import { clearIgnoreCache } from "../utils/fs.js";

export function startFileWatcher(workspacePath: string): void {
  const watcher = chokidar.watch(workspacePath, {
    ignored: [/(^|[\\/])\../, /node_modules/, /dist/, /build/, /.nyc_output/, /coverage/],
    persistent: true,
    ignoreInitial: true,
  });

  const markChanged = async () => {
    const st = await loadWorkspaceState(workspacePath);
    st.pendingChanges = true;
    await saveWorkspaceState(st);
  };

  const handleFileChange = async (filePath: string) => {
    // Check if .gitignore or .cursorignore was modified
    const fileName = path.basename(filePath);
    if (fileName === ".gitignore" || fileName === ".cursorignore") {
      // Clear the ignore cache so patterns are re-read
      clearIgnoreCache(workspacePath);
    }
    await markChanged();
  };

  watcher.on("add", handleFileChange);
  watcher.on("change", handleFileChange);
  watcher.on("unlink", handleFileChange);
}


