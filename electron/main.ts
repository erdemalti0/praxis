import { app, BrowserWindow, ipcMain, dialog, shell, nativeImage } from "electron";
import path from "path";
import { registerTerminalHandlers } from "./ipc/terminal";
import { registerFilesystemHandlers } from "./ipc/filesystem";
import { registerSessionsHandlers } from "./ipc/sessions";
import { registerStatsHandlers } from "./ipc/stats";
import { registerAgentsHandlers } from "./ipc/agents";
import { registerTasksHandlers } from "./ipc/tasks";
import { registerBrowserHandlers } from "./ipc/browser";
import { registerGitHandlers } from "./ipc/git";
import { registerPortsHandlers } from "./ipc/ports";
import { registerLogsHandlers } from "./ipc/logs";
import { registerMissionsHandlers } from "./ipc/missions";
import { registerSearchHandlers } from "./ipc/search";
import { registerUsageHandlers } from "./ipc/usage";
import { startFileWatchers } from "./ipc/filesystem";
import { buildMenu } from "./menu";
import { closeAllPty } from "./utils/pty-manager";

// Set app name early so macOS menu bar shows "Praxis" instead of "Electron"
app.name = "Praxis";

let mainWindow: BrowserWindow | null = null;
const allWindows = new Set<BrowserWindow>();
let ipcHandlersRegistered = false;

export function createWindow(projectName?: string, projectPath?: string) {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#000000",
    icon: path.join(__dirname, "../resources/logo.png"),
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 12, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      // sandbox must remain false: preload.ts uses Node.js modules (fs, path)
      // directly via `import`, which requires Node.js access in the preload context.
      sandbox: false,
    },
  });

  allWindows.add(win);

  // Set mainWindow reference to the first window (or current if none)
  if (!mainWindow) {
    mainWindow = win;
  }

  // Register IPC handlers only once (they are global, not per-window)
  if (!ipcHandlersRegistered) {
    ipcHandlersRegistered = true;
    registerTerminalHandlers(win);
    registerFilesystemHandlers();
    registerSessionsHandlers();
    registerStatsHandlers();
    registerAgentsHandlers();
    registerTasksHandlers();
    registerBrowserHandlers();
    registerGitHandlers();
    registerPortsHandlers();
    registerLogsHandlers();
    registerMissionsHandlers();
    registerSearchHandlers();
    registerUsageHandlers();

    ipcMain.handle("open_external", (_event, url: string) => {
      if (url.startsWith("https://")) shell.openExternal(url);
    });

    ipcMain.handle("open_popup_window", (_event, args: { url: string; title?: string; width?: number; height?: number }) => {
      if (!args || !args.url || !args.url.startsWith("https://")) return;
      const popup = new BrowserWindow({
        width: args.width || 900,
        height: args.height || 700,
        title: args.title || "Praxis",
        show: false,
        autoHideMenuBar: true,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
        },
      });
      popup.once("ready-to-show", () => {
        popup.show();
        popup.focus();
      });
      popup.loadURL(args.url);
    });

  }

  // Start file watchers for this window
  startFileWatchers(win);

  // Build native macOS menu bar
  buildMenu(win);

  // Load the app URL with optional project query params
  if (process.env.ELECTRON_RENDERER_URL) {
    let url = process.env.ELECTRON_RENDERER_URL;
    if (projectName || projectPath) {
      const params = new URLSearchParams();
      if (projectName) params.set("projectName", projectName);
      if (projectPath) params.set("projectPath", projectPath);
      url += `?${params.toString()}`;
    }
    win.loadURL(url);
  } else {
    const filePath = path.join(__dirname, "../dist/index.html");
    if (projectName || projectPath) {
      const params = new URLSearchParams();
      if (projectName) params.set("projectName", projectName);
      if (projectPath) params.set("projectPath", projectPath);
      win.loadFile(filePath, { query: Object.fromEntries(params) });
    } else {
      win.loadFile(filePath);
    }
  }

  win.on("closed", () => {
    allWindows.delete(win);
    if (mainWindow === win) {
      mainWindow = null;
    }
  });

  return win;
}

// Native folder picker dialog — registered once, outside createWindow
ipcMain.handle("open_directory_dialog", async () => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  if (!win) return null;
  const result = await dialog.showOpenDialog(win, {
    properties: ["openDirectory"],
    title: "Open Project",
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

app.whenReady().then(() => {
  // Set dock icon on macOS (overrides default Electron icon in dev mode)
  if (process.platform === "darwin" && app.dock) {
    const iconPath = path.join(__dirname, "../resources/logo.png");
    try {
      const icon = nativeImage.createFromPath(iconPath);
      if (!icon.isEmpty()) app.dock.setIcon(icon);
    } catch {}
  }
  createWindow();
});

app.on("window-all-closed", () => {
  closeAllPty();
  app.quit();
});

app.on("before-quit", () => {
  closeAllPty();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
