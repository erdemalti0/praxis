import { app, BrowserWindow, ipcMain, dialog, shell, nativeImage } from "electron";
import path from "path";
import fs from "fs";
import os from "os";
import { execSync } from "child_process";
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
import { getDefaultShell } from "./utils/platform";

// Set app name early so macOS menu bar shows "Praxis" instead of "Electron"
app.name = "Praxis";

// ── Single-instance lock ──
// If another instance is already running, forward argv and quit
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
const allWindows = new Set<BrowserWindow>();
const windowProjectPaths = new Map<BrowserWindow, string>();
let ipcHandlersRegistered = false;

/** Parse --open-project=<path> from argv */
function parseOpenProject(argv: string[]): { name: string; path: string } | null {
  for (const arg of argv) {
    if (arg.startsWith("--open-project=")) {
      const projectPath = arg.slice("--open-project=".length);
      if (projectPath) {
        const projectName = path.basename(projectPath);
        return { name: projectName, path: projectPath };
      }
    }
  }
  return null;
}

/** Send open-project event to the focused or main window */
function sendOpenProject(project: { name: string; path: string }) {
  const target = BrowserWindow.getFocusedWindow() || mainWindow;
  if (target && !target.isDestroyed()) {
    target.webContents.send("open-project", project);
    target.show();
    target.focus();
  }
}

/** Resolve path to the CLI shell script */
function getCliSourcePath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "bin", "praxis");
  }
  return path.join(__dirname, "..", "bin", "praxis");
}

function getCliSymlinkPath(): string {
  return "/usr/local/bin/praxis";
}

export function createWindow(projectName?: string, projectPath?: string) {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#000000",
    icon: path.join(__dirname, "../resources/logo.png"),
    ...(process.platform === "darwin"
      ? { titleBarStyle: "hiddenInset" as const, trafficLightPosition: { x: 14, y: 18 } }
      : {}),
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
  if (projectPath) {
    windowProjectPaths.set(win, projectPath);
  }

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

    ipcMain.handle("get_default_shell", () => getDefaultShell());

    ipcMain.handle("get_platform", () => process.platform);

    ipcMain.handle("set_window_project", (event, projectPath: string) => {
      const senderWin = BrowserWindow.fromWebContents(event.sender);
      if (senderWin) {
        if (projectPath) {
          windowProjectPaths.set(senderWin, projectPath);
        } else {
          windowProjectPaths.delete(senderWin);
        }
      }
    });

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

    // ── CLI install/uninstall ──
    ipcMain.handle("install_cli", async () => {
      if (process.platform === "win32") {
        const source = app.isPackaged
          ? path.join(process.resourcesPath, "bin", "praxis.cmd")
          : path.join(__dirname, "..", "bin", "praxis.cmd");
        const targetDir = path.join(os.homedir(), "AppData", "Local", "Praxis");
        const target = path.join(targetDir, "praxis.cmd");
        try {
          fs.mkdirSync(targetDir, { recursive: true });
          fs.copyFileSync(source, target);
          // Add to user PATH if not already there
          try {
            const currentPath = execSync('powershell -Command "[Environment]::GetEnvironmentVariable(\'Path\', \'User\')"', { encoding: "utf-8" }).trim();
            if (!currentPath.includes(targetDir)) {
              execSync(`powershell -Command "[Environment]::SetEnvironmentVariable('Path', '${currentPath};${targetDir}', 'User')"`)
            }
          } catch {
            // PATH update failed — user can add manually
          }
          return { success: true, path: target };
        } catch (err: any) {
          return { success: false, error: err.message };
        }
      } else {
        const source = getCliSourcePath();
        const target = getCliSymlinkPath();
        try {
          // Try without sudo first
          if (fs.existsSync(target)) fs.unlinkSync(target);
          fs.symlinkSync(source, target);
          return { success: true, path: target };
        } catch {
          // Needs elevated permissions — use osascript on macOS, pkexec on Linux
          try {
            const shellCmd = `rm -f "${target}" && ln -s "${source}" "${target}"`;
            if (process.platform === "darwin") {
              const escaped = shellCmd.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
              execSync(
                `osascript -e 'do shell script "${escaped}" with administrator privileges'`
              );
            } else {
              execSync(`pkexec sh -c '${shellCmd}'`);
            }
            return { success: true, path: target };
          } catch (err: any) {
            return { success: false, error: err.message };
          }
        }
      }
    });

    ipcMain.handle("uninstall_cli", async () => {
      if (process.platform === "win32") {
        const targetDir = path.join(os.homedir(), "AppData", "Local", "Praxis");
        const target = path.join(targetDir, "praxis.cmd");
        try {
          if (fs.existsSync(target)) fs.unlinkSync(target);
          // Remove from user PATH
          try {
            const currentPath = execSync('powershell -Command "[Environment]::GetEnvironmentVariable(\'Path\', \'User\')"', { encoding: "utf-8" }).trim();
            if (currentPath.includes(targetDir)) {
              const newPath = currentPath.split(";").filter((p: string) => p !== targetDir).join(";");
              execSync(`powershell -Command "[Environment]::SetEnvironmentVariable('Path', '${newPath}', 'User')"`)
            }
          } catch {
            // PATH cleanup failed — non-critical
          }
          return { success: true };
        } catch (err: any) {
          return { success: false, error: err.message };
        }
      } else {
        const target = getCliSymlinkPath();
        try {
          if (fs.existsSync(target)) fs.unlinkSync(target);
          return { success: true };
        } catch {
          // Needs elevated permissions
          try {
            const shellCmd = `rm -f "${target}"`;
            if (process.platform === "darwin") {
              const escaped = shellCmd.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
              execSync(
                `osascript -e 'do shell script "${escaped}" with administrator privileges'`
              );
            } else {
              execSync(`pkexec sh -c '${shellCmd}'`);
            }
            return { success: true };
          } catch (err: any) {
            return { success: false, error: err.message };
          }
        }
      }
    });

    ipcMain.handle("check_cli_installed", async () => {
      if (process.platform === "win32") {
        const target = path.join(os.homedir(), "AppData", "Local", "Praxis", "praxis.cmd");
        return fs.existsSync(target);
      } else {
        const target = getCliSymlinkPath();
        return fs.existsSync(target);
      }
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
    windowProjectPaths.delete(win);
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

// ── Second instance: open project in a new window ──
app.on("second-instance", (_event, argv) => {
  const project = parseOpenProject(argv);
  if (project) {
    // If this project is already open in a window, focus it instead of opening a new one
    for (const [win, projPath] of windowProjectPaths) {
      if (projPath === project.path && !win.isDestroyed()) {
        win.show();
        win.focus();
        return;
      }
    }
    createWindow(project.name, project.path);
  } else if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
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

  // Check if launched with --open-project
  const project = parseOpenProject(process.argv);
  if (project) {
    createWindow(project.name, project.path);
  } else {
    createWindow();
  }
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
