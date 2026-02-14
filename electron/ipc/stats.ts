import { ipcMain } from "electron";
import fs from "fs";
import path from "path";
import os from "os";

export function registerStatsHandlers() {
  ipcMain.handle("read_stats", () => {
    const statsPath = path.join(os.homedir(), ".claude", "stats-cache.json");
    if (!fs.existsSync(statsPath)) return "";
    return fs.readFileSync(statsPath, "utf-8");
  });
}
