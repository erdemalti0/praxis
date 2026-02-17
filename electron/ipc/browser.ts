import { ipcMain } from "electron";
import fs from "fs";
import path from "path";
import os from "os";

interface Favorite {
  id: string;
  name: string;
  url: string;
  icon?: string;
}

interface BrowserInfo {
  name: string;
  path: string;
}

function favoritesFilePath(): string {
  return path.join(os.homedir(), ".praxis", "browser-favorites.json");
}

export function registerBrowserHandlers() {
  ipcMain.handle("detect_browsers", (): BrowserInfo[] => {
    let candidates: BrowserInfo[];

    if (process.platform === "darwin") {
      candidates = [
        { name: "Google Chrome", path: "/Applications/Google Chrome.app" },
        { name: "Brave Browser", path: "/Applications/Brave Browser.app" },
        { name: "Firefox", path: "/Applications/Firefox.app" },
        { name: "Microsoft Edge", path: "/Applications/Microsoft Edge.app" },
      ];
    } else if (process.platform === "win32") {
      const pf = process.env.PROGRAMFILES || "C:\\Program Files";
      const pf86 = process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)";
      candidates = [
        { name: "Google Chrome", path: path.join(pf, "Google", "Chrome", "Application", "chrome.exe") },
        { name: "Brave Browser", path: path.join(pf, "BraveSoftware", "Brave-Browser", "Application", "brave.exe") },
        { name: "Firefox", path: path.join(pf, "Mozilla Firefox", "firefox.exe") },
        { name: "Microsoft Edge", path: path.join(pf86, "Microsoft", "Edge", "Application", "msedge.exe") },
      ];
    } else {
      // Linux
      candidates = [
        { name: "Google Chrome", path: "/usr/bin/google-chrome" },
        { name: "Brave Browser", path: "/usr/bin/brave-browser" },
        { name: "Firefox", path: "/usr/bin/firefox" },
        { name: "Microsoft Edge", path: "/usr/bin/microsoft-edge" },
      ];
    }

    return candidates.filter((c) => fs.existsSync(c.path));
  });

  ipcMain.handle("load_favorites", (): Favorite[] => {
    const file = favoritesFilePath();
    if (!fs.existsSync(file)) return [];
    try {
      const content = fs.readFileSync(file, "utf-8");
      return JSON.parse(content);
    } catch {
      return [];
    }
  });

  ipcMain.handle("save_favorites", (_event, args: { favorites: Favorite[] }) => {
    const dir = path.join(os.homedir(), ".praxis");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const file = favoritesFilePath();
    fs.writeFileSync(file, JSON.stringify(args.favorites, null, 2), "utf-8");
  });
}
