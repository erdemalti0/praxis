/**
 * Worker thread for file search.
 * Offloads recursive directory walk + regex matching from the main process.
 */
import { parentPort } from "worker_threads";
import fs from "fs";
import path from "path";

const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", "dist-electron", "build", ".cache", "__pycache__", "venv", ".venv"]);
const BINARY_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg", ".woff", ".woff2", ".ttf", ".eot", ".mp3", ".mp4", ".zip", ".tar", ".gz", ".pdf", ".exe", ".dll", ".so", ".dylib"]);
const MAX_RESULTS = 500;
const MAX_DEPTH = 8;
const MAX_LINE_LENGTH = 500;

interface SearchRequest {
  projectPath: string;
  query: string;
  isRegex: boolean;
  caseSensitive: boolean;
}

interface SearchResult {
  file: string;
  line: number;
  content: string;
}

parentPort?.on("message", async (msg: SearchRequest) => {
  try {
    const results = await search(msg);
    parentPort?.postMessage({ type: "result", data: results });
  } catch (e: any) {
    parentPort?.postMessage({ type: "error", error: e.message });
  }
});

async function search(args: SearchRequest): Promise<SearchResult[]> {
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

  async function walk(dir: string, depth: number) {
    if (depth > MAX_DEPTH || results.length >= MAX_RESULTS) return;
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (results.length >= MAX_RESULTS) return;
      if (entry.name.startsWith(".") && entry.name !== ".env") continue;
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) {
          await walk(fullPath, depth + 1);
        }
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (BINARY_EXTS.has(ext)) continue;

        try {
          const stat = await fs.promises.stat(fullPath);
          if (stat.size > 1024 * 1024) continue;
        } catch { continue; }

        try {
          const content = await fs.promises.readFile(fullPath, "utf-8");
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

  await walk(projectPath, 0);
  return results;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
