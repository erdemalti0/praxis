import { ipcMain, BrowserWindow } from "electron";
import fs from "fs";
import path from "path";
import os from "os";
import { watch, FSWatcher } from "chokidar";

interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modified: number;
}

/** Convert a simple glob pattern like "*.md" to a regex */
function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}

const HIDDEN_ENTRIES = new Set([
  ".git",
  "node_modules",
  ".DS_Store",
  "__pycache__",
  ".next",
  ".nuxt",
  "target",
  ".idea",
  ".vscode",
  "dist",
  ".cache",
  ".turbo",
  "thumbs.db",
]);

export function registerFilesystemHandlers() {
  // Read a single file's content (async)
  ipcMain.handle("read_file", async (_event, args: { path: string }) => {
    const filePath = args.path;
    try {
      await fs.promises.access(filePath);
    } catch {
      throw new Error(`File not found: ${filePath}`);
    }
    return fs.promises.readFile(filePath, "utf-8");
  });

  // Write content to a file (async)
  ipcMain.handle("write_file", async (_event, args: { path: string; content: string }) => {
    await fs.promises.writeFile(args.path, args.content, "utf-8");
    return true;
  });

  // Editor-specific file operations (async)
  ipcMain.handle("editor_read_file", async (_event, args: { path: string }) => {
    const filePath = args.path;
    try {
      await fs.promises.access(filePath);
    } catch {
      throw new Error(`File not found: ${filePath}`);
    }
    return fs.promises.readFile(filePath, "utf-8");
  });

  ipcMain.handle("editor_write_file", async (_event, args: { path: string; content: string }) => {
    const dir = path.dirname(args.path);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(args.path, args.content, "utf-8");
    return true;
  });

  // Glob for files matching a pattern within a directory (async)
  ipcMain.handle("glob_files", async (_event, args: { pattern: string; cwd: string }) => {
    const { pattern, cwd } = args;
    try {
      await fs.promises.access(cwd);
    } catch {
      return [];
    }
    const results: string[] = [];
    const regex = patternToRegex(pattern);

    async function walk(dir: string, depth: number) {
      if (depth > 5 || results.length >= 100) return;
      try {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (results.length >= 100) return;
          if (HIDDEN_ENTRIES.has(entry.name) || entry.name.startsWith(".")) continue;
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            await walk(fullPath, depth + 1);
          } else if (regex.test(entry.name)) {
            results.push(fullPath);
          }
        }
      } catch { /* skip unreadable dirs */ }
    }

    await walk(cwd, 0);
    return results;
  });

  // Open a file or folder in the system default app
  ipcMain.handle("open_path", (_event, args: { path: string }) => {
    const { shell } = require("electron");
    return shell.openPath(args.path);
  });

  // Read package.json from a project directory (async)
  ipcMain.handle("read_package_json", async (_event, args: { path: string }) => {
    const pkgPath = path.join(args.path, "package.json");
    try {
      const content = await fs.promises.readFile(pkgPath, "utf-8");
      return JSON.parse(content);
    } catch {
      return null;
    }
  });

  ipcMain.handle("list_directory", async (_event, args: { path: string }) => {
    const dirPath = args.path;
    let stat: fs.Stats;
    try {
      stat = await fs.promises.stat(dirPath);
    } catch {
      throw new Error(`Directory not found: ${dirPath}`);
    }
    if (!stat.isDirectory()) {
      throw new Error(`Not a directory: ${dirPath}`);
    }

    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    const dirs: FileEntry[] = [];
    const files: FileEntry[] = [];

    // Process entries in parallel with Promise.all
    await Promise.all(
      entries.map(async (entry) => {
        if (entry.name.startsWith(".") && HIDDEN_ENTRIES.has(entry.name)) return;
        if (HIDDEN_ENTRIES.has(entry.name)) return;

        const fullPath = path.join(dirPath, entry.name);
        try {
          const entryStat = await fs.promises.stat(fullPath);
          const modified = Math.floor(entryStat.mtimeMs / 1000);
          const fileEntry: FileEntry = {
            name: entry.name,
            path: fullPath,
            isDir: entryStat.isDirectory(),
            size: entryStat.isDirectory() ? 0 : entryStat.size,
            modified,
          };
          if (entryStat.isDirectory()) {
            dirs.push(fileEntry);
          } else {
            files.push(fileEntry);
          }
        } catch {
          // skip inaccessible entries
        }
      })
    );

    dirs.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    files.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

    return [...dirs, ...files];
  });
}

// Track watchers per window for cleanup
const windowWatchers = new WeakMap<BrowserWindow, FSWatcher>();

export function startFileWatchers(win: BrowserWindow) {
  const home = os.homedir();
  const claudeDir = path.join(home, ".claude");

  if (!fs.existsSync(claudeDir)) return;

  const historyPath = path.join(claudeDir, "history.jsonl");
  const statsPath = path.join(claudeDir, "stats-cache.json");
  const teamsDir = path.join(claudeDir, "teams");
  const tasksDir = path.join(claudeDir, "tasks");

  const watchPaths: string[] = [];
  if (fs.existsSync(historyPath)) watchPaths.push(historyPath);
  if (fs.existsSync(statsPath)) watchPaths.push(statsPath);
  if (fs.existsSync(teamsDir)) watchPaths.push(teamsDir);
  if (fs.existsSync(tasksDir)) watchPaths.push(tasksDir);

  if (watchPaths.length === 0) return;

  const watcher = watch(watchPaths, {
    ignoreInitial: true,
    persistent: true,
  });

  // Store watcher for cleanup
  windowWatchers.set(win, watcher);

  // Batch file watcher updates with debounce
  const pendingUpdates = new Map<string, { type: string; content?: string }>();
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  const WATCHER_BATCH_INTERVAL = 100; // ms

  function flushWatcherUpdates() {
    flushTimer = null;
    if (win.isDestroyed()) return;
    for (const [, update] of pendingUpdates) {
      if (update.content !== undefined) {
        win.webContents.send(update.type, update.content);
      }
    }
    pendingUpdates.clear();
  }

  watcher.on("change", (filePath: string) => {
    if (win.isDestroyed()) return;

    const filename = path.basename(filePath);

    // Read file async and queue update
    fs.promises.readFile(filePath, "utf-8").then((content) => {
      if (win.isDestroyed()) return;

      if (filename === "history.jsonl") {
        const lines = content.trim().split("\n");
        const lastLine = lines[lines.length - 1];
        if (lastLine) {
          pendingUpdates.set("history", { type: "history-updated", content: lastLine });
        }
      } else if (filename === "stats-cache.json") {
        pendingUpdates.set("stats", { type: "stats-updated", content });
      } else if (filename === "config.json" && filePath.includes("teams")) {
        pendingUpdates.set(`team-${filePath}`, { type: "team-updated", content });
      } else if (filePath.includes("tasks") && filename.endsWith(".json")) {
        pendingUpdates.set(`task-${filePath}`, { type: "task-updated", content });
      }

      if (!flushTimer) {
        flushTimer = setTimeout(flushWatcherUpdates, WATCHER_BATCH_INTERVAL);
      }
    }).catch(() => {});
  });

  // Clean up watcher when window closes
  win.on("closed", () => {
    if (flushTimer) clearTimeout(flushTimer);
    pendingUpdates.clear();
    watcher.close();
    windowWatchers.delete(win);
  });
}
