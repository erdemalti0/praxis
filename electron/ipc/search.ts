import { ipcMain } from "electron";
import { Worker } from "worker_threads";
import path from "path";

interface SearchResult {
  file: string;
  line: number;
  content: string;
}

function getWorkerPath(): string {
  return path.join(__dirname, "search-worker.js");
}

export function registerSearchHandlers() {
  ipcMain.handle("search_files", async (_event, args: { projectPath: string; query: string; isRegex: boolean; caseSensitive: boolean }): Promise<SearchResult[]> => {
    const { projectPath, query, isRegex, caseSensitive } = args;
    if (!query || !projectPath) return [];

    return new Promise((resolve, _reject) => {
      const worker = new Worker(getWorkerPath());

      const timeout = setTimeout(() => {
        worker.terminate();
        resolve([]);
      }, 30000);

      worker.on("message", (msg) => {
        clearTimeout(timeout);
        if (msg.type === "result") {
          resolve(msg.data);
        } else if (msg.type === "error") {
          resolve([]);
        }
        worker.terminate();
      });

      worker.on("error", () => {
        clearTimeout(timeout);
        resolve([]);
      });

      worker.postMessage({ projectPath, query, isRegex, caseSensitive });
    });
  });
}
