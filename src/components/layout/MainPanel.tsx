import { memo, useMemo } from "react";
import TerminalTabs from "../terminal/TerminalTabs";
import SplitPaneLayout from "../terminal/SplitPaneLayout";
import { useUIStore } from "../../stores/uiStore";
import type { LayoutNode } from "../../types/layout";

const EMPTY_LEAF: LayoutNode = { type: "leaf", sessionId: null };

export default memo(function MainPanel() {
  const activeWorkspaceId = useUIStore((s) => s.activeWorkspaceId);
  const workspaceLayouts = useUIStore((s) => s.workspaceLayouts);
  const activeTerminalGroup = useUIStore((s) => s.activeTerminalGroup);

  const activeGroupId = activeWorkspaceId ? activeTerminalGroup[activeWorkspaceId] : undefined;

  const currentLayout: LayoutNode = useMemo(
    () => (activeGroupId && workspaceLayouts[activeGroupId]) || EMPTY_LEAF,
    [activeGroupId, workspaceLayouts]
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TerminalTabs />
      <div className="flex-1 min-h-0 overflow-hidden">
        <SplitPaneLayout
          layout={currentLayout}
          groupId={activeGroupId ?? ""}
        />
      </div>
    </div>
  );
});
