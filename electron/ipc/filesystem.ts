import { ipcMain, BrowserWindow } from "electron";
import fs from "fs";
import path from "path";
import os from "os";
import { watch } from "chokidar";

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
  // Read a single file's content
  ipcMain.handle("read_file", (_event, args: { path: string }) => {
    const filePath = args.path;
    if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
    return fs.readFileSync(filePath, "utf-8");
  });

  // Write content to a file
  ipcMain.handle("write_file", (_event, args: { path: string; content: string }) => {
    fs.writeFileSync(args.path, args.content, "utf-8");
    return true;
  });

  // Editor-specific file operations (duplicated to avoid stale handler issues in dev)
  ipcMain.handle("editor_read_file", (_event, args: { path: string }) => {
    const filePath = args.path;
    if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
    return fs.readFileSync(filePath, "utf-8");
  });

  ipcMain.handle("editor_write_file", (_event, args: { path: string; content: string }) => {
    const dir = path.dirname(args.path);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(args.path, args.content, "utf-8");
    return true;
  });

  // Glob for files matching a pattern within a directory
  ipcMain.handle("glob_files", (_event, args: { pattern: string; cwd: string }) => {
    const { pattern, cwd } = args;
    if (!fs.existsSync(cwd)) return [];
    const results: string[] = [];

    function walk(dir: string, depth: number) {
      if (depth > 5) return; // limit recursion depth
      try {
        const entries = fs.readdirSync(dir);
        for (const name of entries) {
          if (HIDDEN_ENTRIES.has(name) || name.startsWith(".")) continue;
          const fullPath = path.join(dir, name);
          try {
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
              walk(fullPath, depth + 1);
            } else if (name.match(patternToRegex(pattern))) {
              results.push(fullPath);
            }
          } catch { continue; }
        }
      } catch { /* skip unreadable dirs */ }
    }

    walk(cwd, 0);
    return results.slice(0, 100); // limit results
  });

  // Open a file or folder in the system default app
  ipcMain.handle("open_path", (_event, args: { path: string }) => {
    const { shell } = require("electron");
    return shell.openPath(args.path);
  });

  // Read package.json from a project directory
  ipcMain.handle("read_package_json", (_event, args: { path: string }) => {
    const pkgPath = path.join(args.path, "package.json");
    if (!fs.existsSync(pkgPath)) return null;
    try {
      return JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    } catch {
      return null;
    }
  });

  ipcMain.handle("list_directory", (_event, args: { path: string }) => {
    const dirPath = args.path;
    if (!fs.existsSync(dirPath)) {
      throw new Error(`Directory not found: ${dirPath}`);
    }
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) {
      throw new Error(`Not a directory: ${dirPath}`);
    }

    const entries = fs.readdirSync(dirPath);
    const dirs: FileEntry[] = [];
    const files: FileEntry[] = [];

    for (const name of entries) {
      if (name.startsWith(".") && HIDDEN_ENTRIES.has(name)) continue;
      if (HIDDEN_ENTRIES.has(name)) continue;

      const fullPath = path.join(dirPath, name);
      try {
        const entryStat = fs.statSync(fullPath);
        const modified = Math.floor(entryStat.mtimeMs / 1000);
        const entry: FileEntry = {
          name,
          path: fullPath,
          isDir: entryStat.isDirectory(),
          size: entryStat.isDirectory() ? 0 : entryStat.size,
          modified,
        };
        if (entryStat.isDirectory()) {
          dirs.push(entry);
        } else {
          files.push(entry);
        }
      } catch {
        continue;
      }
    }

    dirs.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    files.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

    return [...dirs, ...files];
  });
}

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

  watcher.on("change", (filePath: string) => {
    if (win.isDestroyed()) return;

    const filename = path.basename(filePath);

    if (filename === "history.jsonl") {
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        const lines = content.trim().split("\n");
        const lastLine = lines[lines.length - 1];
        if (lastLine) {
          win.webContents.send("history-updated", lastLine);
        }
      } catch {}
    } else if (filename === "stats-cache.json") {
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        win.webContents.send("stats-updated", content);
      } catch {}
    } else if (filename === "config.json" && filePath.includes("teams")) {
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        win.webContents.send("team-updated", content);
      } catch {}
    } else if (filePath.includes("tasks") && filename.endsWith(".json")) {
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        win.webContents.send("task-updated", content);
      } catch {}
    }
  });
}
