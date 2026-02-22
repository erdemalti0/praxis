import { useRef, useCallback, useMemo, memo } from "react";
import type { LayoutNode } from "../../types/layout";
import { updateRatio } from "../../lib/layout/layoutUtils";
import { useUIStore } from "../../stores/uiStore";
import TerminalPane from "./TerminalPane";
import ResizeHandle from "./ResizeHandle";

interface SplitPaneLayoutProps {
  layout: LayoutNode;
  groupId: string;
  path?: number[];
}

const EMPTY_PATH: number[] = [];

export default memo(function SplitPaneLayout({
  layout,
  groupId,
  path = EMPTY_PATH,
}: SplitPaneLayoutProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const focusedPaneSessionId = useUIStore((s) => s.focusedPaneSessionId);
  const setWorkspaceLayout = useUIStore((s) => s.setWorkspaceLayout);

  const handleResize = useCallback(
    (newRatio: number) => {
      const rootLayout = useUIStore.getState().workspaceLayouts[groupId];
      if (!rootLayout) return;
      const updated = updateRatio(rootLayout, path, newRatio);
      setWorkspaceLayout(groupId, updated);
    },
    [groupId, path, setWorkspaceLayout]
  );

  // All hooks must be called before any early return
  const leftPath = useMemo(() => [...path, 0], [path]);
  const rightPath = useMemo(() => [...path, 1], [path]);

  if (layout.type === "leaf") {
    return (
      <TerminalPane
        sessionId={layout.sessionId}
        groupId={groupId}
        isFocused={layout.sessionId === focusedPaneSessionId}
      />
    );
  }

  const isHorizontal = layout.direction === "horizontal";
  const { ratio, children } = layout;

  return (
    <div
      ref={containerRef}
      className="flex w-full h-full"
      style={{
        flexDirection: isHorizontal ? "row" : "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          flex: `${ratio} 1 0%`,
          minWidth: 0,
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <SplitPaneLayout
          layout={children[0]}
          groupId={groupId}
          path={leftPath}
        />
      </div>

      <ResizeHandle
        direction={layout.direction}
        onResize={handleResize}
        containerRef={containerRef}
      />

      <div
        style={{
          flex: `${1 - ratio} 1 0%`,
          minWidth: 0,
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <SplitPaneLayout
          layout={children[1]}
          groupId={groupId}
          path={rightPath}
        />
      </div>
    </div>
  );
});
