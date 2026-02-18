import { memo, useMemo, useEffect } from "react";
import TerminalTabs from "../terminal/TerminalTabs";
import SplitPaneLayout from "../terminal/SplitPaneLayout";
import { useUIStore } from "../../stores/uiStore";
import type { LayoutNode } from "../../types/layout";
import { refitAllTerminals, setActiveScrollback, setBackgroundScrollback } from "../../lib/terminal/terminalCache";
import { useTerminalStore } from "../../stores/terminalStore";
import { useShallow } from "zustand/shallow";

const EMPTY_LEAF: LayoutNode = { type: "leaf", sessionId: null };

export default memo(function MainPanel() {
  const { activeWorkspaceId, workspaceLayouts, activeTerminalGroup, terminalMaximized, sidebarCollapsed } = useUIStore(
    useShallow((s) => ({
      activeWorkspaceId: s.activeWorkspaceId,
      workspaceLayouts: s.workspaceLayouts,
      activeTerminalGroup: s.activeTerminalGroup,
      terminalMaximized: s.terminalMaximized,
      sidebarCollapsed: s.sidebarCollapsed,
    }))
  );

  const activeGroupId = activeWorkspaceId ? activeTerminalGroup[activeWorkspaceId] : undefined;

  const currentLayout: LayoutNode = useMemo(
    () => (activeGroupId && workspaceLayouts[activeGroupId]) || EMPTY_LEAF,
    [activeGroupId, workspaceLayouts]
  );

  // Re-fit all terminals when layout changes
  // Triggers: fullscreen toggle, sidebar toggle, workspace switch, terminal group switch
  useEffect(() => {
    refitAllTerminals();
  }, [terminalMaximized, sidebarCollapsed, activeWorkspaceId, activeGroupId]);

  // Adaptive scrollback: reduce memory for background terminals, restore for visible ones
  const sessions = useTerminalStore((s) => s.sessions);
  useEffect(() => {
    if (!activeGroupId) return;
    // Collect session IDs visible in the active layout
    const visibleIds = new Set<string>();
    const collectIds = (node: LayoutNode) => {
      if (node.type === "leaf") {
        if (node.sessionId) visibleIds.add(node.sessionId);
      } else {
        node.children.forEach(collectIds);
      }
    };
    collectIds(currentLayout);
    // Set active scrollback for visible, background for the rest
    for (const s of sessions) {
      if (visibleIds.has(s.id)) {
        setActiveScrollback(s.id);
      } else {
        setBackgroundScrollback(s.id);
      }
    }
  }, [activeGroupId, currentLayout, sessions]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TerminalTabs />
      <div className="flex-1 min-h-0 overflow-hidden">
        <SplitPaneLayout
          key={activeGroupId ?? "empty"}
          layout={currentLayout}
          groupId={activeGroupId ?? ""}
        />
      </div>
    </div>
  );
});
