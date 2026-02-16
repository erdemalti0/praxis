import { useEffect } from "react";
import { useUIStore } from "../stores/uiStore";
import { useTerminalStore } from "../stores/terminalStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useConfirmStore } from "../stores/confirmStore";
import { useBrowserStore } from "../stores/browserStore";
import { invoke } from "../lib/ipc";
import { cleanupTerminal } from "../lib/terminal/terminalCache";
import { closePane } from "../lib/layout/layoutUtils";

/**
 * Global keyboard shortcuts that work even when xterm.js terminal has focus.
 * Uses capture phase (3rd arg = true) so events are caught before terminal swallows them.
 */
export function useGlobalShortcuts() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;

      const viewMode = useUIStore.getState().viewMode;
      const isBrowser = viewMode === "browser";

      // ── General shortcuts ──

      // ⌘+K → Command Palette
      if (e.key === "k" && !e.shiftKey) {
        e.preventDefault();
        const store = useUIStore.getState();
        store.setCommandPaletteOpen(!store.commandPaletteOpen);
        return;
      }

      // ⌘+, → Settings
      if (e.key === "," && !e.shiftKey) {
        e.preventDefault();
        const settings = useSettingsStore.getState();
        settings.setShowSettingsPanel(!settings.showSettingsPanel);
        return;
      }

      // ⌘+B → Toggle Sidebar
      if (e.key === "b" && !e.shiftKey) {
        e.preventDefault();
        useUIStore.getState().toggleSidebar();
        return;
      }

      // ⌘+1-4 → View switching (only when NOT in browser view)
      if (!isBrowser && !e.shiftKey && /^[1-4]$/.test(e.key)) {
        e.preventDefault();
        const views = ["terminal", "missions", "split", "browser"] as const;
        useUIStore.getState().setViewMode(views[parseInt(e.key) - 1]);
        return;
      }

      // ── Terminal shortcuts ──

      // ⌘+W → Close Terminal (with confirmation)
      if (e.key === "w" && !e.shiftKey && !isBrowser) {
        e.preventDefault();
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
        return;
      }

      // ⌘+D → Split Right
      if (e.key === "d" && !e.shiftKey) {
        e.preventDefault();
        const ui = useUIStore.getState();
        const ts = useTerminalStore.getState();
        const sessionId = ui.focusedPaneSessionId || ts.activeSessionId;
        if (sessionId) {
          ui.setSplitSpawnContext({ sessionId, direction: "horizontal" });
          ui.setShowSpawnDialog(true);
        }
        return;
      }

      // ⌘+⇧+D → Split Down
      if (e.key === "D" && e.shiftKey) {
        e.preventDefault();
        const ui = useUIStore.getState();
        const ts = useTerminalStore.getState();
        const sessionId = ui.focusedPaneSessionId || ts.activeSessionId;
        if (sessionId) {
          ui.setSplitSpawnContext({ sessionId, direction: "vertical" });
          ui.setShowSpawnDialog(true);
        }
        return;
      }

      // ⌘+⇧+M → Toggle Mission Panel
      if (e.key === "M" && e.shiftKey) {
        e.preventDefault();
        useUIStore.getState().toggleMissionPanel();
        return;
      }

      // ⌘+⇧+F → Toggle Fullscreen Terminal
      if (e.key === "F" && e.shiftKey) {
        e.preventDefault();
        const store = useUIStore.getState();
        store.setTerminalMaximized(!store.terminalMaximized);
        return;
      }

      // ── Sidebar panel shortcuts ──

      // ⌘+⇧+A → Agents Panel
      if (e.key === "A" && e.shiftKey) {
        e.preventDefault();
        useUIStore.getState().setActiveSidebarTab("agents");
        return;
      }

      // ⌘+⇧+E → Explorer Panel
      if (e.key === "E" && e.shiftKey) {
        e.preventDefault();
        useUIStore.getState().setActiveSidebarTab("explorer");
        return;
      }

      // ⌘+⇧+H → Search Panel
      if (e.key === "H" && e.shiftKey) {
        e.preventDefault();
        useUIStore.getState().setActiveSidebarTab("search");
        return;
      }

      // ⌘+⇧+G → Git Panel
      if (e.key === "G" && e.shiftKey) {
        e.preventDefault();
        useUIStore.getState().setActiveSidebarTab("git");
        return;
      }

      // ⌘+⇧+U → Services Panel
      if (e.key === "U" && e.shiftKey) {
        e.preventDefault();
        useUIStore.getState().setActiveSidebarTab("services");
        return;
      }

      // ── Browser shortcuts (only in browser view) ──
      if (isBrowser) {
        const browserStore = useBrowserStore.getState();
        const activeTabId = browserStore.activeBrowserTabId;

        // ⌘+R → Reload
        if (e.key === "r" && !e.shiftKey) {
          e.preventDefault();
          const webview = document.querySelector<Electron.WebviewTag>(`webview[data-tab-id="${activeTabId}"]`);
          if (webview) {
            if (activeTabId) browserStore.setTabLoading(activeTabId, true);
            webview.reload();
          }
          return;
        }

        // ⌘+⇧+R → Hard reload
        if (e.key === "R" && e.shiftKey) {
          e.preventDefault();
          const webview = document.querySelector<Electron.WebviewTag>(`webview[data-tab-id="${activeTabId}"]`);
          if (webview) {
            if (activeTabId) browserStore.setTabLoading(activeTabId, true);
            webview.reloadIgnoringCache();
          }
          return;
        }

        // ⌘+[ → Back
        if (e.key === "[" && !e.shiftKey) {
          e.preventDefault();
          const webview = document.querySelector<Electron.WebviewTag>(`webview[data-tab-id="${activeTabId}"]`);
          if (webview && webview.canGoBack()) {
            if (activeTabId) browserStore.setTabLoading(activeTabId, true);
            webview.goBack();
          }
          return;
        }

        // ⌘+] → Forward
        if (e.key === "]" && !e.shiftKey) {
          e.preventDefault();
          const webview = document.querySelector<Electron.WebviewTag>(`webview[data-tab-id="${activeTabId}"]`);
          if (webview && webview.canGoForward()) {
            if (activeTabId) browserStore.setTabLoading(activeTabId, true);
            webview.goForward();
          }
          return;
        }

        // ⌘+L → Focus URL bar
        if (e.key === "l" && !e.shiftKey) {
          e.preventDefault();
          const urlInput = document.querySelector<HTMLInputElement>('[data-url-input="true"]');
          if (urlInput) {
            urlInput.focus();
            urlInput.select();
          }
          return;
        }

        // ⌘+F → Find in page
        if (e.key === "f" && !e.shiftKey) {
          e.preventDefault();
          const webview = document.querySelector<Electron.WebviewTag>(`webview[data-tab-id="${activeTabId}"]`);
          if (webview) {
            webview.executeJavaScript(`
              if (window.__praxis_find) {
                window.__praxis_find.show();
              } else {
                const input = document.createElement('input');
                input.style.cssText = 'position:fixed;top:10px;right:10px;padding:8px 12px;border-radius:6px;border:1px solid #ccc;font-size:14px;z-index:2147483647;';
                input.placeholder = 'Find...';
                input.oninput = () => window.find(input.value);
                input.onkeydown = (e) => { if(e.key==='Escape') input.remove(); };
                document.body.appendChild(input);
                input.focus();
                window.__praxis_find = { show: () => input.focus() };
              }
            `);
          }
          return;
        }

        // ⌘+⇧+I → DevTools
        if (e.key === "I" && e.shiftKey) {
          e.preventDefault();
          const webview = document.querySelector<Electron.WebviewTag>(`webview[data-tab-id="${activeTabId}"]`);
          if (webview) webview.openDevTools();
          return;
        }

        // ⌘+T → New browser tab
        if (e.key === "t" && !e.shiftKey) {
          e.preventDefault();
          browserStore.createLandingTab();
          return;
        }

        // ⌘+W → Close browser tab
        if (e.key === "w" && !e.shiftKey) {
          e.preventDefault();
          if (activeTabId) browserStore.removeTab(activeTabId);
          return;
        }

        // ⌘+⇧+T → Reopen closed tab
        if (e.key === "T" && e.shiftKey) {
          e.preventDefault();
          browserStore.reopenClosedTab();
          return;
        }

        // ⌘+1-9 → Switch to browser tab
        if (/^[1-9]$/.test(e.key)) {
          e.preventDefault();
          const index = parseInt(e.key) - 1;
          const unpinnedTabs = browserStore.tabs.filter((t) => !t.isPinned);
          if (index < unpinnedTabs.length) {
            browserStore.setActiveBrowserTabId(unpinnedTabs[index].id);
          }
          return;
        }

        // ⌘+0 → Last browser tab
        if (e.key === "0") {
          e.preventDefault();
          const unpinnedTabs = browserStore.tabs.filter((t) => !t.isPinned);
          if (unpinnedTabs.length > 0) {
            browserStore.setActiveBrowserTabId(unpinnedTabs[unpinnedTabs.length - 1].id);
          }
          return;
        }
      }
    };

    // Capture phase ensures we get the event before xterm.js
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, []);
}
