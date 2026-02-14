import { useEffect } from "react";
import { listen } from "../lib/ipc";
import { useUIStore } from "../stores/uiStore";
import { useTerminalStore } from "../stores/terminalStore";
import { useSettingsStore } from "../stores/settingsStore";
import { invoke } from "../lib/ipc";
import { cleanupTerminal } from "../lib/terminal/terminalCache";
import { closePane, getSessionIds } from "../lib/layout/layoutUtils";

export function useMenuEvents() {
  useEffect(() => {
    const unsubs: (() => void)[] = [];

    // File > New Terminal
    unsubs.push(
      listen("menu:new-terminal", () => {
        const store = useUIStore.getState();
        if (store.activeWorkspaceId) {
          store.setShowSpawnDialog(true);
        }
      })
    );

    // File > New Workspace
    unsubs.push(
      listen("menu:new-workspace", () => {
        const store = useUIStore.getState();
        store.addWorkspace({
          id: `ws-${Date.now()}`,
          name: `Workspace ${store.workspaces.length + 1}`,
        });
      })
    );

    // File > Close Terminal
    unsubs.push(
      listen("menu:close-terminal", () => {
        const ui = useUIStore.getState();
        const ts = useTerminalStore.getState();
        const sessionId = ui.focusedPaneSessionId || ts.activeSessionId;
        if (!sessionId || !ui.activeWorkspaceId) return;

        const activeGroupId = ui.activeTerminalGroup[ui.activeWorkspaceId];
        if (!activeGroupId) return;

        const layout = ui.workspaceLayouts[activeGroupId];
        if (layout) {
          const newLayout = closePane(layout, sessionId);
          if (newLayout) {
            ui.setWorkspaceLayout(activeGroupId, newLayout);
          } else {
            // No sessions left — remove the group (tab)
            ui.removeTerminalGroup(ui.activeWorkspaceId!, activeGroupId);
          }
        }
        invoke("close_pty", { id: sessionId }).catch(() => {});
        cleanupTerminal(sessionId);
        ts.removeSession(sessionId);
      })
    );

    // File > Switch Project — save state, close all terminals, go to landing page
    unsubs.push(
      listen("menu:switch-project", () => {
        const ui = useUIStore.getState();
        const ts = useTerminalStore.getState();

        // 1. Save current workspace state
        useSettingsStore.getState().saveWorkspaces(
          ui.workspaces.map((ws) => ({
            id: ws.id,
            name: ws.name,
            color: ws.color,
            useWidgetMode: ws.useWidgetMode,
          }))
        );
        useSettingsStore.getState().saveSettings();

        // 2. Close all PTY sessions
        for (const session of ts.sessions) {
          invoke("close_pty", { id: session.id }).catch(() => {});
          cleanupTerminal(session.id);
        }
        // Clear all sessions from store
        for (const session of [...ts.sessions]) {
          ts.removeSession(session.id);
        }

        // 3. Go to landing page
        ui.setSelectedProject(null);
      })
    );

    // View modes
    unsubs.push(listen("menu:view-terminal", () => useUIStore.getState().setViewMode("terminal")));
    unsubs.push(listen("menu:view-tasks", () => useUIStore.getState().setViewMode("missions")));
    unsubs.push(listen("menu:view-split", () => useUIStore.getState().setViewMode("split")));
    unsubs.push(listen("menu:view-browser", () => useUIStore.getState().setViewMode("browser")));

    // View > Toggle Sidebar
    unsubs.push(
      listen("menu:toggle-sidebar", () => {
        useUIStore.getState().toggleSidebar();
      })
    );

    // View > Toggle Full Screen Terminal
    unsubs.push(
      listen("menu:toggle-fullscreen-terminal", () => {
        const store = useUIStore.getState();
        store.setTerminalMaximized(!store.terminalMaximized);
      })
    );

    // Terminal > Split Right
    unsubs.push(
      listen("menu:split-right", () => {
        const ui = useUIStore.getState();
        const ts = useTerminalStore.getState();
        const sessionId = ui.focusedPaneSessionId || ts.activeSessionId;
        if (sessionId) {
          ui.setSplitSpawnContext({ sessionId, direction: "horizontal" });
          ui.setShowSpawnDialog(true);
        }
      })
    );

    // Terminal > Split Down
    unsubs.push(
      listen("menu:split-down", () => {
        const ui = useUIStore.getState();
        const ts = useTerminalStore.getState();
        const sessionId = ui.focusedPaneSessionId || ts.activeSessionId;
        if (sessionId) {
          ui.setSplitSpawnContext({ sessionId, direction: "vertical" });
          ui.setShowSpawnDialog(true);
        }
      })
    );

    // Edit > Command Palette (Cmd+K)
    unsubs.push(
      listen("menu:command-palette", () => {
        const store = useUIStore.getState();
        store.setCommandPaletteOpen(!store.commandPaletteOpen);
      })
    );

    // Terminal > Next Terminal Group
    unsubs.push(
      listen("menu:next-terminal-group", () => {
        const store = useUIStore.getState();
        const wsId = store.activeWorkspaceId;
        if (!wsId) return;
        const groups = store.terminalGroups[wsId] || [];
        const current = store.activeTerminalGroup[wsId];
        const idx = groups.indexOf(current);
        if (idx >= 0 && idx < groups.length - 1) {
          store.setActiveTerminalGroup(wsId, groups[idx + 1]);
        }
      })
    );

    // Terminal > Previous Terminal Group
    unsubs.push(
      listen("menu:prev-terminal-group", () => {
        const store = useUIStore.getState();
        const wsId = store.activeWorkspaceId;
        if (!wsId) return;
        const groups = store.terminalGroups[wsId] || [];
        const current = store.activeTerminalGroup[wsId];
        const idx = groups.indexOf(current);
        if (idx > 0) {
          store.setActiveTerminalGroup(wsId, groups[idx - 1]);
        }
      })
    );

    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, []);
}
