import { useCallback, useRef, useState, useEffect } from "react";
import { ArrowUpDown } from "lucide-react";
import MainPanel from "./MainPanel";
import WorkspaceContent from "../widgets/WorkspaceContent";
import { useUIStore } from "../../stores/uiStore";
import { refitAllTerminals } from "../../lib/terminal/terminalCache";

interface DualPaneLayoutProps {
  topPaneContent: "terminal" | "widgets";
  dividerRatio: number;
  hasWidgets: boolean;
  workspaceId: string;
}

export default function DualPaneLayout({ topPaneContent, dividerRatio, hasWidgets, workspaceId }: DualPaneLayoutProps) {
  const setWidgetDividerRatio = useUIStore((s) => s.setWidgetDividerRatio);
  const swapPanes = useUIStore((s) => s.swapPanes);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [localRatio, setLocalRatio] = useState(dividerRatio);
  const localRatioRef = useRef(localRatio);

  useEffect(() => {
    setLocalRatio(dividerRatio);
    localRatioRef.current = dividerRatio;
  }, [dividerRatio]);

  const handleSwap = useCallback(() => {
    swapPanes();
    setTimeout(() => refitAllTerminals(), 50);
  }, [swapPanes]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);

    const container = containerRef.current;
    if (!container) return;

    const onMouseMove = (ev: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const y = ev.clientY - rect.top;
      const ratio = Math.max(0.2, Math.min(0.8, y / rect.height));
      setLocalRatio(ratio);
      localRatioRef.current = ratio;
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      setIsDragging(false);
      setWidgetDividerRatio(localRatioRef.current);
      setTimeout(() => refitAllTerminals(), 50);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [setWidgetDividerRatio]);

  // Refit terminals when ratio changes during drag
  useEffect(() => {
    if (isDragging) {
      const timer = setTimeout(() => refitAllTerminals(), 16);
      return () => clearTimeout(timer);
    }
  }, [isDragging, localRatio]);

  if (!hasWidgets) {
    return (
      <div className="h-full flex flex-col">
        <MainPanel />
      </div>
    );
  }

  const topRatio = localRatio;
  const bottomRatio = 1 - localRatio;

  const terminalPane = (
    <div
      style={{
        flex: topPaneContent === "terminal" ? topRatio : bottomRatio,
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <MainPanel />
    </div>
  );

  const isWidgetBottom = topPaneContent === "terminal";

  const widgetPane = (
    <div
      style={{
        flex: isWidgetBottom ? bottomRatio : topRatio,
        minHeight: 0,
        overflow: "hidden",
        position: "relative",
      }}
    >
      <WorkspaceContent workspaceId={workspaceId} />
      {/* Swap button when widget pane is at the bottom */}
      {isWidgetBottom && (
        <button
          onClick={handleSwap}
          title="Swap panes"
          className="flex items-center justify-center"
          style={{
            position: "absolute",
            top: 6,
            right: 10,
            zIndex: 10,
            color: "var(--vp-text-dim)",
            width: 28,
            height: 28,
            borderRadius: 8,
            border: "none",
            background: "transparent",
            cursor: "pointer",
            transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--vp-text-primary)";
            e.currentTarget.style.background = "var(--vp-bg-surface-hover)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--vp-text-dim)";
            e.currentTarget.style.background = "transparent";
          }}
        >
          <ArrowUpDown size={13} />
        </button>
      )}
    </div>
  );

  return (
    <div ref={containerRef} className="h-full flex flex-col" style={{ position: "relative" }}>
      {/* Drag overlay to prevent terminal/iframe from capturing mouse */}
      {isDragging && (
        <div style={{ position: "absolute", inset: 0, zIndex: 100, cursor: "row-resize" }} />
      )}

      {topPaneContent === "terminal" ? terminalPane : widgetPane}

      {/* Divider — drag to resize, double-click to swap */}
      <div
        className="pane-divider"
        onMouseDown={handleMouseDown}
        onDoubleClick={handleSwap}
        style={{
          height: 6,
          flexShrink: 0,
          background: isDragging ? "var(--vp-accent-blue)" : "var(--vp-border-subtle)",
          cursor: "row-resize",
          position: "relative",
          transition: isDragging ? "none" : "background 0.2s",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: 32,
            height: 3,
            borderRadius: 2,
            background: isDragging ? "rgba(255,255,255,0.4)" : "var(--vp-text-subtle)",
            transition: isDragging ? "none" : "background 0.2s",
          }}
        />
      </div>

      {topPaneContent === "terminal" ? widgetPane : terminalPane}
    </div>
  );
}
