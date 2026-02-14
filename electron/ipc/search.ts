import { ipcMain } from "electron";
import fs from "fs";
import path from "path";

const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", ".cache", "__pycache__", "venv", ".venv"]);
const BINARY_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg", ".woff", ".woff2", ".ttf", ".eot", ".mp3", ".mp4", ".zip", ".tar", ".gz", ".pdf", ".exe", ".dll", ".so", ".dylib"]);
const MAX_RESULTS = 500;
const MAX_DEPTH = 8;
const MAX_LINE_LENGTH = 500;

interface SearchResult {
  file: string;
  line: number;
  content: string;
}

export function registerSearchHandlers() {
  ipcMain.handle("search_files", (_event, args: { projectPath: string; query: string; isRegex: boolean; caseSensitive: boolean }): SearchResult[] => {
    const { projectPath, query, isRegex, caseSensitive } = args;
    if (!query || !projectPath) return [];

    let regex: RegExp;
    try {
      const flags = caseSensitive ? "g" : "gi";
      regex = isRegex ? new RegExp(query, flags) : new RegExp(escapeRegex(query), flags);
    } catch {
      return [];
    }

    const results: SearchResult[] = [];

    function walk(dir: string, depth: number) {
      if (depth > MAX_DEPTH || results.length >= MAX_RESULTS) return;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (results.length >= MAX_RESULTS) return;
        if (entry.name.startsWith(".") && entry.name !== ".env") continue;
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (!SKIP_DIRS.has(entry.name)) {
            walk(fullPath, depth + 1);
          }
        } else {
          const ext = path.extname(entry.name).toLowerCase();
          if (BINARY_EXTS.has(ext)) continue;

          // Skip large files (> 1MB)
          try {
            const stat = fs.statSync(fullPath);
            if (stat.size > 1024 * 1024) continue;
          } catch { continue; }

          try {
            const content = fs.readFileSync(fullPath, "utf-8");
            const lines = content.split("\n");
            for (let i = 0; i < lines.length && results.length < MAX_RESULTS; i++) {
              regex.lastIndex = 0;
              if (regex.test(lines[i])) {
                const relativePath = path.relative(projectPath, fullPath);
                const lineContent = lines[i].length > MAX_LINE_LENGTH
                  ? lines[i].substring(0, MAX_LINE_LENGTH) + "..."
                  : lines[i];
                results.push({
                  file: relativePath,
                  line: i + 1,
                  content: lineContent,
                });
              }
            }
          } catch { /* skip unreadable files */ }
        }
      }
    }

    walk(projectPath, 0);
    return results;
  });
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
