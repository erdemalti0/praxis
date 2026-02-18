import { useEffect } from "react";
import { useUIStore } from "../stores/uiStore";
import { useTerminalStore } from "../stores/terminalStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useConfirmStore } from "../stores/confirmStore";
import { useBrowserStore } from "../stores/browserStore";
import { invoke } from "../lib/ipc";
import { cleanupTerminal } from "../lib/terminal/terminalCache";
import { closePane } from "../lib/layout/layoutUtils";
import { getShortcutKey } from "../lib/shortcuts";

/**
 * Match a KeyboardEvent against an Electron accelerator string.
 * E.g. "CmdOrCtrl+Shift+M" matches Cmd+Shift+M on Mac or Ctrl+Shift+M on other OS.
 */
function matchesAccelerator(e: KeyboardEvent, accelerator: string): boolean {
  if (!accelerator) return false;

  const parts = accelerator.split("+");
  let needMeta = false;
  let needShift = false;
  let needAlt = false;
  let targetKey = "";

  for (const part of parts) {
    const p = part.trim();
    if (p === "CmdOrCtrl" || p === "CommandOrControl" || p === "Cmd" || p === "Ctrl") {
      needMeta = true;
    } else if (p === "Shift") {
      needShift = true;
    } else if (p === "Alt" || p === "Option") {
      needAlt = true;
    } else {
      targetKey = p;
    }
  }

  const meta = e.metaKey || e.ctrlKey;
  if (needMeta !== meta) return false;
  if (needShift !== e.shiftKey) return false;
  if (needAlt !== e.altKey) return false;

  // Normalize the event key for comparison
  const eventKey = e.key.length === 1 ? e.key.toUpperCase() : e.key;

  // Normalize target key
  const keyMap: Record<string, string> = {
    Up: "ArrowUp", Down: "ArrowDown", Left: "ArrowLeft", Right: "ArrowRight",
    Space: " ", Escape: "Escape", Enter: "Enter", Backspace: "Backspace",
    Delete: "Delete", Tab: "Tab",
  };

  let normalizedTarget = keyMap[targetKey] || targetKey;

  // For single char keys, compare uppercase
  if (normalizedTarget.length === 1) {
    return eventKey === normalizedTarget.toUpperCase();
  }

  // For special keys, compare directly
  return eventKey === normalizedTarget;
}

/**
 * Global keyboard shortcuts that work even when xterm.js terminal has focus.
 * Uses capture phase (3rd arg = true) so events are caught before terminal swallows them.
 * Reads customShortcuts from settingsStore so user-configured shortcuts are respected.
 */
export function useGlobalShortcuts() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;

      const viewMode = useUIStore.getState().viewMode;
      const isBrowser = viewMode === "browser";
      const cs = useSettingsStore.getState().customShortcuts;

      /** Helper: check if event matches a shortcut by ID */
      const matches = (id: string) => matchesAccelerator(e, getShortcutKey(id, cs));

      // ── General shortcuts ──

      if (matches("command-palette")) {
        e.preventDefault();
        const store = useUIStore.getState();
        store.setCommandPaletteOpen(!store.commandPaletteOpen);
        return;
      }

      if (matches("settings")) {
        e.preventDefault();
        const settings = useSettingsStore.getState();
        settings.setShowSettingsPanel(!settings.showSettingsPanel);
        return;
      }

      if (matches("toggle-sidebar")) {
        e.preventDefault();
        useUIStore.getState().toggleSidebar();
        return;
      }

      if (matches("fullscreen-terminal")) {
        e.preventDefault();
        const store = useUIStore.getState();
        store.setTerminalMaximized(!store.terminalMaximized);
        return;
      }

      if (matches("mission-panel")) {
        e.preventDefault();
        useUIStore.getState().toggleMissionPanel();
        return;
      }

      // ── View switching (only when NOT in browser view) ──
      if (!isBrowser) {
        if (matches("view-terminal")) {
          e.preventDefault();
          useUIStore.getState().setViewMode("terminal");
          return;
        }
        if (matches("view-widgets")) {
          e.preventDefault();
          useUIStore.getState().setViewMode("missions");
          return;
        }
        if (matches("view-split")) {
          e.preventDefault();
          useUIStore.getState().setViewMode("split");
          return;
        }
        if (matches("view-browser")) {
          e.preventDefault();
          useUIStore.getState().setViewMode("browser");
          return;
        }
      }

      // ── Terminal shortcuts ──

      if (matches("close-terminal") && !isBrowser) {
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

      if (matches("split-right")) {
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

      if (matches("split-down")) {
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

      // ── Sidebar panel shortcuts ──

      if (matches("sidebar-agents")) {
        e.preventDefault();
        useUIStore.getState().setActiveSidebarTab("agents");
        return;
      }

      if (matches("sidebar-explorer")) {
        e.preventDefault();
        useUIStore.getState().setActiveSidebarTab("explorer");
        return;
      }

      if (matches("sidebar-search")) {
        e.preventDefault();
        useUIStore.getState().setActiveSidebarTab("search");
        return;
      }

      if (matches("sidebar-git")) {
        e.preventDefault();
        useUIStore.getState().setActiveSidebarTab("git");
        return;
      }

      if (matches("sidebar-services")) {
        e.preventDefault();
        useUIStore.getState().setActiveSidebarTab("services");
        return;
      }

      // ── Browser shortcuts (only in browser view) ──
      if (isBrowser) {
        const browserStore = useBrowserStore.getState();
        const activeTabId = browserStore.activeBrowserTabId;

        if (matches("browser-reload")) {
          e.preventDefault();
          const webview = document.querySelector<Electron.WebviewTag>(`webview[data-tab-id="${activeTabId}"]`);
          if (webview) {
            if (activeTabId) browserStore.setTabLoading(activeTabId, true);
            webview.reload();
          }
          return;
        }

        if (matches("browser-hard-reload")) {
          e.preventDefault();
          const webview = document.querySelector<Electron.WebviewTag>(`webview[data-tab-id="${activeTabId}"]`);
          if (webview) {
            if (activeTabId) browserStore.setTabLoading(activeTabId, true);
            webview.reloadIgnoringCache();
          }
          return;
        }

        if (matches("browser-back")) {
          e.preventDefault();
          const webview = document.querySelector<Electron.WebviewTag>(`webview[data-tab-id="${activeTabId}"]`);
          if (webview && webview.canGoBack()) {
            if (activeTabId) browserStore.setTabLoading(activeTabId, true);
            webview.goBack();
          }
          return;
        }

        if (matches("browser-forward")) {
          e.preventDefault();
          const webview = document.querySelector<Electron.WebviewTag>(`webview[data-tab-id="${activeTabId}"]`);
          if (webview && webview.canGoForward()) {
            if (activeTabId) browserStore.setTabLoading(activeTabId, true);
            webview.goForward();
          }
          return;
        }

        if (matches("browser-url")) {
          e.preventDefault();
          const urlInput = document.querySelector<HTMLInputElement>('[data-url-input="true"]');
          if (urlInput) {
            urlInput.focus();
            urlInput.select();
          }
          return;
        }

        if (matches("find")) {
          e.preventDefault();
          const webview = document.querySelector<Electron.WebviewTag>(`webview[data-tab-id="${activeTabId}"]`);
          if (webview) {
            webview.executeJavaScript(`
              if (window.__praxis_find) {
                window.__praxis_find.show();
              } else {
                const input = document.createElement('input');
                input.style.cssText = 'position:fixed;top:10px;right:10px;padding:8px 12px;border-radius: var(--vp-radius-md);border:1px solid #ccc;font-size:14px;z-index:2147483647;';
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

        if (matches("browser-devtools")) {
          e.preventDefault();
          const webview = document.querySelector<Electron.WebviewTag>(`webview[data-tab-id="${activeTabId}"]`);
          if (webview) webview.openDevTools();
          return;
        }

        // ⌘+T → New browser tab (browser-specific, not in shortcuts system)
        if (e.key === "t" && !e.shiftKey && meta) {
          e.preventDefault();
          browserStore.createLandingTab();
          return;
        }

        // ⌘+W → Close browser tab (browser-specific)
        if (e.key === "w" && !e.shiftKey && meta) {
          e.preventDefault();
          if (activeTabId) browserStore.removeTab(activeTabId);
          return;
        }

        // ⌘+⇧+T → Reopen closed tab (browser-specific)
        if (e.key === "T" && e.shiftKey && meta) {
          e.preventDefault();
          browserStore.reopenClosedTab();
          return;
        }

        // ⌘+1-9 → Switch to browser tab
        if (/^[1-9]$/.test(e.key) && !e.shiftKey) {
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
