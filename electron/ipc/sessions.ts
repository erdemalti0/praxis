import { ipcMain } from "electron";
import fs from "fs";
import path from "path";
import os from "os";

export function registerSessionsHandlers() {
  ipcMain.handle("get_home_dir", () => {
    return os.homedir();
  });

  ipcMain.handle("read_history", () => {
    const historyPath = path.join(os.homedir(), ".claude", "history.jsonl");
    if (!fs.existsSync(historyPath)) return "";
    return fs.readFileSync(historyPath, "utf-8");
  });
}
