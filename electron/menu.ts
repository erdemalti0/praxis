import { Menu, BrowserWindow, app } from "electron";

export function buildMenu(win: BrowserWindow) {
  const isMac = process.platform === "darwin";

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
                accelerator: "CmdOrCtrl+,",
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
                accelerator: "CmdOrCtrl+," as string,
                click: () => send("menu:settings"),
              },
              { type: "separator" as const },
            ]
          : []),
        {
          label: "New Terminal",
          accelerator: "CmdOrCtrl+T",
          click: () => send("menu:new-terminal"),
        },
        {
          label: "New Workspace",
          accelerator: "CmdOrCtrl+N",
          click: () => send("menu:new-workspace"),
        },
        { type: "separator" },
        {
          label: "Switch Project...",
          accelerator: "CmdOrCtrl+O",
          click: () => send("menu:switch-project"),
        },
        { type: "separator" },
        {
          label: "Close Terminal",
          accelerator: "CmdOrCtrl+W",
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
          accelerator: "CmdOrCtrl+F",
          click: () => send("menu:find"),
        },
      ],
    },

    // View
    {
      label: "View",
      submenu: [
        {
          label: "Terminal View",
          accelerator: "CmdOrCtrl+1",
          click: () => send("menu:view-terminal"),
        },
        {
          label: "Widget View",
          accelerator: "CmdOrCtrl+2",
          click: () => send("menu:view-tasks"),
        },
        {
          label: "Split View",
          accelerator: "CmdOrCtrl+3",
          click: () => send("menu:view-split"),
        },
        {
          label: "Browser",
          accelerator: "CmdOrCtrl+4",
          click: () => send("menu:view-browser"),
        },
        { type: "separator" },
        {
          label: "Toggle Sidebar",
          accelerator: "CmdOrCtrl+B",
          click: () => send("menu:toggle-sidebar"),
        },
        {
          label: "Toggle Fullscreen Terminal",
          accelerator: "CmdOrCtrl+Shift+F",
          click: () => send("menu:toggle-fullscreen-terminal"),
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
          accelerator: "CmdOrCtrl+D",
          click: () => send("menu:split-right"),
        },
        {
          label: "Split Down",
          accelerator: "CmdOrCtrl+Shift+D",
          click: () => send("menu:split-down"),
        },
        { type: "separator" },
        {
          label: "Next Terminal Group",
          accelerator: "CmdOrCtrl+Shift+]",
          click: () => send("menu:next-terminal-group"),
        },
        {
          label: "Previous Terminal Group",
          accelerator: "CmdOrCtrl+Shift+[",
          click: () => send("menu:prev-terminal-group"),
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
          accelerator: "CmdOrCtrl+Shift+I",
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
