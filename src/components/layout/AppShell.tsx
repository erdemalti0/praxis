import { lazy, Suspense, useEffect, useRef } from "react";
import { useShallow } from "zustand/shallow";
import StatsBar from "../stats/StatsBar";
import Sidebar from "./Sidebar";
import MainPanel from "./MainPanel";
import DualPaneLayout from "./DualPaneLayout";
import { useUIStore } from "../../stores/uiStore";
import { useBrowserStore } from "../../stores/browserStore";
import { useWidgetStore } from "../../stores/widgetStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { refitAllTerminals } from "../../lib/terminal/terminalCache";

const MissionBoard = lazy(() => import("../missions/MissionBoard"));
const SpawnDialog = lazy(() => import("../terminal/SpawnDialog"));
const BrowserPanel = lazy(() => import("../browser/BrowserPanel"));
const EditorPanel = lazy(() => import("../editor/EditorPanel"));
const CustomizePanel = lazy(() => import("../widgets/CustomizePanel"));
const OnboardingOverlay = lazy(() => import("../ui/OnboardingOverlay"));

const SIDEBAR_COLLAPSED_WIDTH = 48;
const TASK_PANEL_WIDTH = 340;

export default function AppShell() {
  const {
    sidebarWidth, sidebarCollapsed, viewMode, draggingTab, terminalMaximized,
    selectedProject, addWorkspace, workspaces, activeWorkspaceId,
    showCustomizePanel, showMissionPanel,
    topPaneContent, widgetDividerRatio,
  } = useUIStore(useShallow((s) => ({
    sidebarWidth: s.sidebarWidth,
    sidebarCollapsed: s.sidebarCollapsed,
    viewMode: s.viewMode,
    draggingTab: s.draggingTab,
    terminalMaximized: s.terminalMaximized,
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
  const onboardingDone = useSettingsStore((s) => s.onboardingDone);

  const initRef = useRef(false);
  const currentSidebarWidth = sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : sidebarWidth;

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
    borderRadius: 14,
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

  // Maximized browser — hide everything else
  if (browserMaximized && viewMode === "browser") {
    return (
      <Suspense fallback={null}>
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
              style={{ ...panelStyle, background: "var(--vp-bg-surface)" }}
            >
              <BrowserPanel />
            </div>
          </div>
        </div>
      </Suspense>
    );
  }

  // Maximized terminal — hide everything else
  if (terminalMaximized) {
    return (
      <Suspense fallback={null}>
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
              style={{ ...panelStyle, background: "var(--vp-bg-surface)" }}
            >
              <MainPanel />
            </div>
          </div>
          <SpawnDialog />
        </div>
      </Suspense>
    );
  }

  return (
    <Suspense fallback={null}>
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
                style={{ ...panelStyle, background: "var(--vp-bg-surface)" }}
              >
                <MainPanel />
              </div>
            </>
          )}

          {/* Editor view */}
          {viewMode === "editor" && (
            <div
              className="flex-1 min-w-0 min-h-0"
              style={{ ...panelStyle, background: "var(--vp-bg-surface)" }}
            >
              <EditorPanel />
            </div>
          )}

          {/* Browser view — kept mounted to preserve webview state, hidden via CSS */}
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

          {/* Widget catalog is now inside CustomizePanel */}
        </div>
        <SpawnDialog />
        {!onboardingDone && <OnboardingOverlay />}
      </div>
    </Suspense>
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
        borderRadius: 14,
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
          borderRadius: 10,
        }}
      >
        {label}
      </span>
    </div>
  );
}
