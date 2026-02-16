import { Menu, BrowserWindow, app, dialog } from "electron";
import path from "path";
import { createWindow } from "./main";

export function buildMenu(win: BrowserWindow, customShortcuts?: Record<string, string>) {
  const isMac = process.platform === "darwin";
  const shortcuts = customShortcuts || {};

  // Get accelerator for a shortcut id, falling back to default
  const accel = (id: string, defaultKey: string): string => {
    return shortcuts[id] !== undefined ? shortcuts[id] : defaultKey;
  };

  const send = (channel: string) => {
    if (!win.isDestroyed()) {
      win.webContents.send(channel);
    }
  };

  const template: Electron.MenuItemConstructorOptions[] = [
    // App menu (macOS only)
    ...(isMac
      ? [
          {
            label: "Praxis",
            submenu: [
              { role: "about" as const, label: "About Praxis" },
              { type: "separator" as const },
              {
                label: "Settings...",
                accelerator: accel("settings", "CmdOrCtrl+,"),
                click: () => send("menu:settings"),
              },
              { type: "separator" as const },
              { role: "hide" as const, label: "Hide Praxis" },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const, label: "Quit Praxis" },
            ],
          },
        ]
      : []),

    // File
    {
      label: "File",
      submenu: [
        ...(!isMac
          ? [
              {
                label: "Settings...",
                accelerator: accel("settings", "CmdOrCtrl+,") as string,
                click: () => send("menu:settings"),
              },
              { type: "separator" as const },
            ]
          : []),
        {
          label: "New Terminal",
          accelerator: accel("new-terminal", "CmdOrCtrl+T"),
          click: () => send("menu:new-terminal"),
        },
        {
          label: "New Workspace",
          accelerator: accel("new-workspace", "CmdOrCtrl+N"),
          click: () => send("menu:new-workspace"),
        },
        { type: "separator" },
        {
          label: "Switch Project...",
          accelerator: accel("switch-project", "CmdOrCtrl+O"),
          click: () => send("menu:switch-project"),
        },
        {
          label: "Open Project in New Window...",
          accelerator: accel("open-new-window", "CmdOrCtrl+Shift+O"),
          click: async () => {
            const result = await dialog.showOpenDialog(win, {
              properties: ["openDirectory"],
              title: "Open Project in New Window",
            });
            if (!result.canceled && result.filePaths.length > 0) {
              const projectPath = result.filePaths[0];
              const projectName = path.basename(projectPath);
              createWindow(projectName, projectPath);
            }
          },
        },
        {
          label: "Clone Repository...",
          accelerator: accel("clone-repository", "CmdOrCtrl+Shift+C"),
          click: () => send("menu:clone-repository"),
        },
        { type: "separator" },
        {
          label: "Close Terminal",
          accelerator: accel("close-terminal", "CmdOrCtrl+W"),
          click: () => send("menu:close-terminal"),
        },
      ],
    },

    // Edit
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
        { type: "separator" },
        {
          label: "Find...",
          accelerator: accel("find", "CmdOrCtrl+F"),
          click: () => send("menu:find"),
        },
        { type: "separator" },
        {
          label: "Command Palette",
          accelerator: accel("command-palette", "CmdOrCtrl+K"),
          click: () => send("menu:command-palette"),
        },
      ],
    },

    // View
    {
      label: "View",
      submenu: [
        {
          label: "Terminal View",
          click: () => send("menu:view-terminal"),
        },
        {
          label: "Widget View",
          click: () => send("menu:view-tasks"),
        },
        {
          label: "Split View",
          click: () => send("menu:view-split"),
        },
        {
          label: "Browser",
          click: () => send("menu:view-browser"),
        },
        { type: "separator" },
        {
          label: "Toggle Sidebar",
          accelerator: accel("toggle-sidebar", "CmdOrCtrl+B"),
          click: () => send("menu:toggle-sidebar"),
        },
        {
          label: "Toggle Fullscreen Terminal",
          accelerator: accel("fullscreen-terminal", "CmdOrCtrl+Shift+F"),
          click: () => send("menu:toggle-fullscreen-terminal"),
        },
        {
          label: "Toggle Mission Panel",
          accelerator: accel("mission-panel", "CmdOrCtrl+Shift+M"),
          click: () => send("menu:toggle-mission-panel"),
        },
        { type: "separator" },
        {
          label: "Agents Panel",
          accelerator: accel("sidebar-agents", "CmdOrCtrl+Shift+A"),
          click: () => send("menu:sidebar-agents"),
        },
        {
          label: "Explorer Panel",
          accelerator: accel("sidebar-explorer", "CmdOrCtrl+Shift+E"),
          click: () => send("menu:sidebar-explorer"),
        },
        {
          label: "Search Panel",
          accelerator: accel("sidebar-search", "CmdOrCtrl+Shift+H"),
          click: () => send("menu:sidebar-search"),
        },
        {
          label: "Git Panel",
          accelerator: accel("sidebar-git", "CmdOrCtrl+Shift+G"),
          click: () => send("menu:sidebar-git"),
        },
        {
          label: "Services Panel",
          accelerator: accel("sidebar-services", "CmdOrCtrl+Shift+U"),
          click: () => send("menu:sidebar-services"),
        },
        { type: "separator" },
        { role: "resetZoom", label: "Actual Size" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },

    // Terminal
    {
      label: "Terminal",
      submenu: [
        {
          label: "Split Right",
          accelerator: accel("split-right", "CmdOrCtrl+D"),
          click: () => send("menu:split-right"),
        },
        {
          label: "Split Down",
          accelerator: accel("split-down", "CmdOrCtrl+Shift+D"),
          click: () => send("menu:split-down"),
        },
        { type: "separator" },
        {
          label: "Next Terminal Group",
          accelerator: accel("next-terminal-group", "CmdOrCtrl+Shift+]"),
          click: () => send("menu:next-terminal-group"),
        },
        {
          label: "Previous Terminal Group",
          accelerator: accel("prev-terminal-group", "CmdOrCtrl+Shift+["),
          click: () => send("menu:prev-terminal-group"),
        },
      ],
    },

    // Git
    {
      label: "Git",
      submenu: [
        {
          label: "Pull",
          accelerator: accel("git-pull", "") || undefined,
          click: () => send("menu:git-pull"),
        },
        {
          label: "Push",
          accelerator: accel("git-push", "") || undefined,
          click: () => send("menu:git-push"),
        },
        {
          label: "Commit...",
          accelerator: accel("git-commit", "") || undefined,
          click: () => send("menu:git-commit"),
        },
        { type: "separator" },
        {
          label: "Stash",
          accelerator: accel("git-stash", "") || undefined,
          click: () => send("menu:git-stash"),
        },
        {
          label: "Stash Pop",
          accelerator: accel("git-stash-pop", "") || undefined,
          click: () => send("menu:git-stash-pop"),
        },
        { type: "separator" },
        {
          label: "Refresh Status",
          accelerator: accel("git-refresh", "") || undefined,
          click: () => send("menu:git-refresh"),
        },
      ],
    },

    // Window
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMac
          ? [
              { type: "separator" as const },
              { role: "front" as const },
            ]
          : [
              { role: "close" as const },
            ]),
      ],
    },

    // Help
    {
      label: "Help",
      submenu: [
        {
          label: "Toggle Developer Tools",
          accelerator: accel("browser-devtools", "CmdOrCtrl+Shift+I"),
          click: () => {
            if (!win.isDestroyed()) {
              win.webContents.toggleDevTools();
            }
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
