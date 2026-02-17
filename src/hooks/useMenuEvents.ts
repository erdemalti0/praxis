import { useEffect } from "react";
import { listen } from "../lib/ipc";
import { useUIStore } from "../stores/uiStore";
import { useTerminalStore } from "../stores/terminalStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useConfirmStore } from "../stores/confirmStore";
import { useGitStore } from "../stores/gitStore";
import { invoke } from "../lib/ipc";
import { cleanupTerminal } from "../lib/terminal/terminalCache";
import { closePane } from "../lib/layout/layoutUtils";

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

    // File > Close Terminal (with confirmation)
    unsubs.push(
      listen("menu:close-terminal", () => {
        const ui = useUIStore.getState();
        const ts = useTerminalStore.getState();
        const sessionId = ui.focusedPaneSessionId || ts.activeSessionId;
        if (!sessionId || !ui.activeWorkspaceId) return;

        useConfirmStore.getState().showConfirm(
          "Close Terminal",
          "Are you sure you want to close this terminal?",
          () => {
            const activeGroupId = ui.activeTerminalGroup[ui.activeWorkspaceId!];
            if (!activeGroupId) return;
            const layout = ui.workspaceLayouts[activeGroupId];
            if (layout) {
              const newLayout = closePane(layout, sessionId);
              if (newLayout) {
                ui.setWorkspaceLayout(activeGroupId, newLayout);
              } else {
                ui.removeTerminalGroup(ui.activeWorkspaceId!, activeGroupId);
              }
            }
            invoke("close_pty", { id: sessionId }).catch(() => {});
            cleanupTerminal(sessionId);
            ts.removeSession(sessionId);
          },
          { danger: true }
        );
      })
    );

    // Settings
    unsubs.push(
      listen("menu:settings", () => {
        const settings = useSettingsStore.getState();
        settings.setShowSettingsPanel(!settings.showSettingsPanel);
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

    // View > Toggle Mission Panel
    unsubs.push(
      listen("menu:toggle-mission-panel", () => {
        useUIStore.getState().toggleMissionPanel();
      })
    );

    // View > Sidebar Panels
    unsubs.push(
      listen("menu:sidebar-agents", () => {
        useUIStore.getState().setActiveSidebarTab("agents");
      })
    );
    unsubs.push(
      listen("menu:sidebar-explorer", () => {
        useUIStore.getState().setActiveSidebarTab("explorer");
      })
    );
    unsubs.push(
      listen("menu:sidebar-search", () => {
        useUIStore.getState().setActiveSidebarTab("search");
      })
    );
    unsubs.push(
      listen("menu:sidebar-git", () => {
        useUIStore.getState().setActiveSidebarTab("git");
      })
    );
    unsubs.push(
      listen("menu:sidebar-services", () => {
        useUIStore.getState().setActiveSidebarTab("services");
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

    // File > Clone Repository
    unsubs.push(
      listen("menu:clone-repository", () => {
        const ui = useUIStore.getState();
        if (ui.selectedProject) {
          // Switch to landing page where clone modal is available
          // Delay the event so ProjectSelect mounts and registers its listener
          ui.setSelectedProject(null);
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent("open-clone-modal"));
          }, 100);
        } else {
          window.dispatchEvent(new CustomEvent("open-clone-modal"));
        }
      })
    );

    // Git > Pull
    unsubs.push(
      listen("menu:git-pull", () => {
        const project = useUIStore.getState().selectedProject;
        if (project) useGitStore.getState().pull(project.path);
      })
    );

    // Git > Push
    unsubs.push(
      listen("menu:git-push", () => {
        const project = useUIStore.getState().selectedProject;
        if (project) useGitStore.getState().push(project.path);
      })
    );

    // Git > Commit — switch to git panel in sidebar
    unsubs.push(
      listen("menu:git-commit", () => {
        const ui = useUIStore.getState();
        ui.setActiveSidebarTab("git");
        if (ui.sidebarCollapsed) ui.toggleSidebar();
      })
    );

    // Git > Stash
    unsubs.push(
      listen("menu:git-stash", async () => {
        const project = useUIStore.getState().selectedProject;
        if (project) {
          await invoke("run_quick_command", { command: "git stash", projectPath: project.path });
          useGitStore.getState().refresh(project.path);
        }
      })
    );

    // Git > Stash Pop
    unsubs.push(
      listen("menu:git-stash-pop", async () => {
        const project = useUIStore.getState().selectedProject;
        if (project) {
          await invoke("run_quick_command", { command: "git stash pop", projectPath: project.path });
          useGitStore.getState().refresh(project.path);
        }
      })
    );

    // Git > Refresh Status
    unsubs.push(
      listen("menu:git-refresh", () => {
        const project = useUIStore.getState().selectedProject;
        if (project) useGitStore.getState().refresh(project.path);
      })
    );

    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, []);
}
