import { useEffect, useRef } from "react";
import { useShallow } from "zustand/shallow";
import StatsBar from "../stats/StatsBar";
import Sidebar from "./Sidebar";
import MainPanel from "./MainPanel";
import DualPaneLayout from "./DualPaneLayout";
import MissionBoard from "../missions/MissionBoard";
import SpawnDialog from "../terminal/SpawnDialog";
import CustomizePanel from "../widgets/CustomizePanel";
import { useUIStore } from "../../stores/uiStore";
import { useBrowserStore } from "../../stores/browserStore";
import { useWidgetStore } from "../../stores/widgetStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { refitAllTerminals } from "../../lib/terminal/terminalCache";
import BrowserPanel from "../browser/BrowserPanel";
import EditorPanel from "../editor/EditorPanel";
import RunnerPanel from "../runner/RunnerPanel";
import WorkspaceContent from "../widgets/WorkspaceContent";
import WidgetCard from "../widgets/WidgetCard";
import OnboardingOverlay from "../ui/OnboardingOverlay";
import { Minimize2 } from "lucide-react";

const SIDEBAR_COLLAPSED_WIDTH = 48;
const TASK_PANEL_WIDTH = 340;

export default function AppShell() {
  const {
    sidebarWidth, sidebarCollapsed, viewMode, draggingTab, terminalMaximized,
    maximizedContent,
    selectedProject, addWorkspace, workspaces, activeWorkspaceId,
    showCustomizePanel, showMissionPanel,
    topPaneContent, widgetDividerRatio,
  } = useUIStore(useShallow((s) => ({
    sidebarWidth: s.sidebarWidth,
    sidebarCollapsed: s.sidebarCollapsed,
    viewMode: s.viewMode,
    draggingTab: s.draggingTab,
    terminalMaximized: s.terminalMaximized,
    maximizedContent: s.maximizedContent,
    selectedProject: s.selectedProject,
    addWorkspace: s.addWorkspace,
    workspaces: s.workspaces,
    activeWorkspaceId: s.activeWorkspaceId,
    showCustomizePanel: s.showCustomizePanel,
    showMissionPanel: s.showMissionPanel,
    topPaneContent: s.topPaneContent,
    widgetDividerRatio: s.widgetDividerRatio,
  })));

  const widgetStoreWidgets = useWidgetStore((s) => s.workspaceWidgets);
  const hasWidgets = activeWorkspaceId
    ? (widgetStoreWidgets[activeWorkspaceId]?.length ?? 0) > 0
    : false;
  const fullscreenWidgetId = useUIStore((s) => s.fullscreenWidgetId);
  const setFullscreenWidgetId = useUIStore((s) => s.setFullscreenWidgetId);
  const onboardingDone = useSettingsStore((s) => s.onboardingDone);

  // ESC to exit widget fullscreen
  useEffect(() => {
    if (!fullscreenWidgetId) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreenWidgetId(null);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [fullscreenWidgetId, setFullscreenWidgetId]);

  const initRef = useRef(false);
  const currentSidebarWidth = sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : sidebarWidth;

  // Deferred mount: don't pay the cost of heavy panels until the user first opens them.
  // After first open, keep mounted (keep-alive) to preserve state.
  const hasOpenedEditor = useRef(viewMode === "editor");
  const hasOpenedRunner = useRef(viewMode === "runner");
  const hasOpenedBrowser = useRef(viewMode === "browser");
  if (viewMode === "editor") hasOpenedEditor.current = true;
  if (viewMode === "runner") hasOpenedRunner.current = true;
  if (viewMode === "browser") hasOpenedBrowser.current = true;

  // Auto-create or restore workspaces when project is selected
  useEffect(() => {
    if (selectedProject && !initRef.current) {
      const ws = useUIStore.getState().workspaces;
      if (ws.length === 0) {
        const saved = useSettingsStore.getState().savedWorkspaces;
        if (saved.length > 0) {
          for (const sw of saved) {
            addWorkspace({ id: sw.id, name: sw.name, color: sw.color });
          }
        } else {
          addWorkspace({ id: `ws-${Date.now()}`, name: "Workspace 1" });
        }
      }
      initRef.current = true;
    }
  }, [selectedProject, addWorkspace]);

  // Auto-save workspaces when they change (debounced)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!initRef.current) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      useSettingsStore.getState().saveWorkspaces(
        workspaces.map((ws) => ({
          id: ws.id, name: ws.name, color: ws.color,
        }))
      );
    }, 1000);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [workspaces]);

  const panelStyle = {
    borderRadius: "var(--vp-radius-3xl)",
    overflow: "hidden" as const,
    border: "1px solid var(--vp-border-panel)",
  };

  // Re-fit terminals when view mode or workspace changes
  // This catches cases not covered by MainPanel's effect (e.g., switching from
  // widget mode back to terminal, changing workspaces, toggling split view)
  useEffect(() => {
    refitAllTerminals();
  }, [viewMode, activeWorkspaceId, terminalMaximized, sidebarCollapsed, showCustomizePanel, topPaneContent]);

  // Listen for custom tab-drop event from StatsBar's mouse-based drag
  useEffect(() => {
    const handleTabDrop = (e: Event) => {
      const { tab } = (e as CustomEvent).detail;
      const store = useUIStore.getState();
      const vm = store.viewMode;

      if (
        (tab === "missions" && vm === "terminal") ||
        (tab === "terminal" && vm === "missions")
      ) {
        store.setViewMode("split");
      }
    };

    document.addEventListener("praxis-tab-drop", handleTabDrop);
    return () => {
      document.removeEventListener("praxis-tab-drop", handleTabDrop);
    };
  }, []);

  const canDrop =
    (draggingTab === "missions" && viewMode === "terminal") ||
    (draggingTab === "terminal" && viewMode === "missions");

  const dropLabel =
    draggingTab === "missions"
      ? "Drop here to split with Missions"
      : "Drop here to split with Terminal";

  const browserMaximized = useBrowserStore((s) => s.browserMaximized);

  // Fullscreen single widget — takes over the entire screen like terminal/browser maximize
  if (fullscreenWidgetId && activeWorkspaceId) {
    const allWidgets = widgetStoreWidgets[activeWorkspaceId] ?? [];
    const fsWidget = allWidgets.find((w) => w.id === fullscreenWidgetId);
    if (fsWidget) {
      return (
        <div
          className="h-screen w-screen flex flex-col"
          style={{
            background: "var(--vp-bg-primary)",
            color: "var(--vp-text-primary)",
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Inter", "SF Pro Display", "Segoe UI", sans-serif',
            position: "relative",
          }}
        >
          <div className="flex-1 min-h-0" style={{ padding: 8 }}>
            <WidgetCard
              widgetId={fsWidget.id}
              widgetType={fsWidget.type}
              workspaceId={activeWorkspaceId}
              config={fsWidget.config}
            />
          </div>
          {/* Restore button */}
          <button
            onClick={() => setFullscreenWidgetId(null)}
            title="Exit fullscreen (ESC)"
            style={{
              position: "absolute", top: 12, right: 12, zIndex: 50,
              background: "var(--vp-bg-surface-hover)", border: "1px solid var(--vp-border-medium)",
              borderRadius: "var(--vp-radius-md)", padding: "4px 8px",
              cursor: "pointer", color: "var(--vp-text-muted)", fontSize: 10,
              display: "flex", alignItems: "center", gap: 4, opacity: 0.7,
              transition: "opacity 0.2s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.7"; }}
          >
            <Minimize2 size={12} />
            <span>ESC</span>
          </button>
        </div>
      );
    }
  }

  // Maximized browser — hide everything else
  if (browserMaximized && viewMode === "browser") {
    return (
      <div
        className="h-screen w-screen flex flex-col"
        style={{
          background: "var(--vp-bg-primary)",
          color: "var(--vp-text-primary)",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Inter", "SF Pro Display", "Segoe UI", sans-serif',
          position: "relative",
        }}
      >
        <div className="flex-1 min-h-0" style={{ padding: 8 }}>
          <div
            className="h-full"
            style={{ ...panelStyle, background: "var(--vp-bg-surface)" }}
          >
            <BrowserPanel />
          </div>
        </div>
        {/* Restore button */}
        <button
          onClick={() => useBrowserStore.getState().setBrowserMaximized(false)}
          title="Exit fullscreen (ESC)"
          style={{
            position: "absolute", top: 12, right: 12, zIndex: 50,
            background: "var(--vp-bg-surface-hover)", border: "1px solid var(--vp-border-medium)",
            borderRadius: "var(--vp-radius-md)", padding: "4px 8px",
            cursor: "pointer", color: "var(--vp-text-muted)", fontSize: 10,
            display: "flex", alignItems: "center", gap: 4, opacity: 0.7,
            transition: "opacity 0.2s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.7"; }}
        >
          <Minimize2 size={12} />
          <span>ESC</span>
        </button>
        <SpawnDialog />
      </div>
    );
  }

  // Maximized terminal — hide everything else
  // MainPanel (TerminalTabs + terminal content) is always rendered so the tab bar stays visible.
  // Other panels overlay the terminal content area (below the 40px header) when active.
  if (terminalMaximized) {
    // Ensure deferred-mount refs are set when opening panels in maximized mode
    if (maximizedContent === "browser") hasOpenedBrowser.current = true;
    if (maximizedContent === "runner") hasOpenedRunner.current = true;

    return (
      <div
        className="h-screen w-screen flex flex-col"
        style={{
          background: "var(--vp-bg-primary)",
          color: "var(--vp-text-primary)",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Inter", "SF Pro Display", "Segoe UI", sans-serif',
        }}
      >
        <div className="flex-1 min-h-0" style={{ padding: 8 }}>
          <div
            className="h-full"
            style={{ ...panelStyle, background: "var(--vp-bg-surface)", position: "relative" }}
          >
            {/* MainPanel always rendered — provides TerminalTabs header + terminal content */}
            <MainPanel />

            {/* Browser overlay — positioned below the 40px TerminalTabs header */}
            {hasOpenedBrowser.current && (
              <div style={{
                position: "absolute", top: 40, left: 0, right: 0, bottom: 0,
                background: "var(--vp-bg-primary)", zIndex: 10,
                overflow: "hidden",
                display: maximizedContent === "browser" ? undefined : "none",
              }}>
                <BrowserPanel />
              </div>
            )}

            {/* Runner overlay */}
            {hasOpenedRunner.current && (
              <div style={{
                position: "absolute", top: 40, left: 0, right: 0, bottom: 0,
                background: "var(--vp-bg-primary)", zIndex: 10,
                overflow: "hidden",
                display: maximizedContent === "runner" ? undefined : "none",
              }}>
                <RunnerPanel />
              </div>
            )}

            {/* Widgets overlay */}
            {maximizedContent === "widgets" && activeWorkspaceId && (
              <div style={{
                position: "absolute", top: 40, left: 0, right: 0, bottom: 0,
                background: "var(--vp-bg-primary)", zIndex: 10,
                overflow: "hidden",
              }}>
                <WorkspaceContent workspaceId={activeWorkspaceId} />
              </div>
            )}

            {showCustomizePanel && activeWorkspaceId && (
              <CustomizePanel workspaceId={activeWorkspaceId} />
            )}
          </div>
        </div>
        <SpawnDialog />
      </div>
    );
  }

  return (
    <div
      className="h-screen w-screen flex flex-col"
      style={{
        background: "var(--vp-bg-primary)",
        color: "var(--vp-text-primary)",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Inter", "SF Pro Display", "Segoe UI", sans-serif',
      }}
    >
      <StatsBar />
      <div className="flex flex-1 min-h-0" style={{ padding: 8, gap: 8 }}>
        {/* Sidebar — always visible */}
        <div
          style={{
            width: currentSidebarWidth,
            minWidth: currentSidebarWidth,
            ...panelStyle,
            background: "var(--vp-bg-surface)",
            transition:
              "width 0.3s cubic-bezier(0.16, 1, 0.3, 1), min-width 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          <Sidebar />
        </div>

        {/* Mission panel — toggled via ⌘+⇧+M, works in terminal and widget modes */}
        {showMissionPanel && activeWorkspaceId && viewMode !== "browser" && viewMode !== "missions" && viewMode !== "split" && viewMode !== "editor" && (
          <div
            style={{
              width: TASK_PANEL_WIDTH,
              minWidth: TASK_PANEL_WIDTH,
              ...panelStyle,
              background: "var(--vp-bg-surface)",
            }}
          >
            <MissionBoard variant="panel" />
          </div>
        )}

        {/* Tasks view — always shown when viewMode is tasks */}
        {viewMode === "missions" && (
          <div
            className="flex-1 min-w-0 min-h-0"
            style={{
              ...panelStyle,
              background: "var(--vp-bg-surface)",
              position: "relative",
            }}
          >
            <MissionBoard variant="full" />
            {canDrop && <DropOverlay label={dropLabel} />}
          </div>
        )}

        {/* Terminal view — now uses DualPaneLayout for terminal + widget strip */}
        {(viewMode === "terminal") && (
          <div
            className="flex-1 min-w-0 min-h-0"
            style={{ ...panelStyle, background: "var(--vp-bg-surface)", position: "relative", zIndex: 1, overflow: "hidden" }}
          >
            <DualPaneLayout
              topPaneContent={topPaneContent}
              dividerRatio={hasWidgets ? widgetDividerRatio : 1.0}
              hasWidgets={hasWidgets}
              workspaceId={activeWorkspaceId || ""}
            />
            {showCustomizePanel && activeWorkspaceId && (
              <CustomizePanel workspaceId={activeWorkspaceId} />
            )}
            {canDrop && <DropOverlay label={dropLabel} />}
          </div>
        )}

        {/* Split view */}
        {viewMode === "split" && (
          <>
            <div
              style={{
                width: TASK_PANEL_WIDTH,
                minWidth: TASK_PANEL_WIDTH,
                ...panelStyle,
                background: "var(--vp-bg-surface)",
              }}
            >
              <MissionBoard variant="panel" />
            </div>
            <div
              className="flex-1 min-w-0 min-h-0"
              style={{ ...panelStyle, background: "var(--vp-bg-surface)", position: "relative", zIndex: 1, overflow: "hidden" }}
            >
              <DualPaneLayout
                topPaneContent={topPaneContent}
                dividerRatio={hasWidgets ? widgetDividerRatio : 1.0}
                hasWidgets={hasWidgets}
                workspaceId={activeWorkspaceId || ""}
              />
              {showCustomizePanel && activeWorkspaceId && (
                <CustomizePanel workspaceId={activeWorkspaceId} />
              )}
            </div>
          </>
        )}

        {/* Editor view — lazily mounted on first open, then kept alive via CSS */}
        {hasOpenedEditor.current && (
          <div
            className="flex-1 min-w-0 min-h-0"
            style={{
              ...panelStyle,
              background: "var(--vp-bg-surface)",
              display: viewMode === "editor" ? undefined : "none",
            }}
          >
            <EditorPanel />
          </div>
        )}

        {/* Runner view — lazily mounted on first open, then kept alive via CSS */}
        {hasOpenedRunner.current && (
          <div
            className="flex-1 min-w-0 min-h-0"
            style={{
              ...panelStyle,
              background: "var(--vp-bg-surface)",
              position: "relative",
              display: viewMode === "runner" ? undefined : "none",
            }}
          >
            <RunnerPanel />
          </div>
        )}

        {/* Browser view — lazily mounted on first open, then kept alive via CSS (webview is very heavy) */}
        {hasOpenedBrowser.current && (
          <div
            className="flex-1 min-w-0 min-h-0"
            style={{
              ...panelStyle,
              background: "var(--vp-bg-surface)",
              position: "relative",
              display: viewMode === "browser" ? undefined : "none",
            }}
          >
            <BrowserPanel />
          </div>
        )}

        {/* Widget catalog is now inside CustomizePanel */}
      </div>
      <SpawnDialog />
      {!onboardingDone && <OnboardingOverlay />}
    </div>
  );
}

function DropOverlay({ label }: { label: string }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "var(--vp-accent-blue-bg)",
        border: "2px dashed var(--vp-accent-blue-border)",
        borderRadius: "var(--vp-radius-3xl)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        pointerEvents: "none",
      }}
    >
      <span
        style={{
          color: "var(--vp-accent-blue)",
          fontSize: 13,
          fontWeight: 500,
          background: "var(--vp-bg-overlay)",
          padding: "8px 16px",
          borderRadius: "var(--vp-radius-lg)",
        }}
      >
        {label}
      </span>
    </div>
  );
}
