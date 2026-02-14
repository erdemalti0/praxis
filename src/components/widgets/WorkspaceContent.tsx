import { useMemo, useCallback, useRef, useState, useEffect } from "react";
import { ResponsiveGridLayout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import WidgetCard from "./WidgetCard";
import { useWidgetStore } from "../../stores/widgetStore";
import { useUIStore } from "../../stores/uiStore";
import { getWidgetDefinition } from "./registry";
import type { WidgetInstance, WidgetLayoutItem } from "../../types/widget";

interface WorkspaceContentProps {
  workspaceId: string;
}

const EMPTY_WIDGETS: WidgetInstance[] = [];
const EMPTY_LAYOUT: WidgetLayoutItem[] = [];

export default function WorkspaceContent({ workspaceId }: WorkspaceContentProps) {
  const widgets = useWidgetStore((s) => s.workspaceWidgets[workspaceId] ?? EMPTY_WIDGETS);
  const layout = useWidgetStore((s) => s.workspaceLayouts[workspaceId] ?? EMPTY_LAYOUT);
  const updateLayout = useWidgetStore((s) => s.updateLayout);
  const addWidget = useWidgetStore((s) => s.addWidget);
  const fullscreenWidgetId = useUIStore((s) => s.fullscreenWidgetId);
  const setFullscreenWidgetId = useUIStore((s) => s.setFullscreenWidgetId);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1200);
  const [dragOver, setDragOver] = useState(false);

  // ESC to exit fullscreen
  useEffect(() => {
    if (!fullscreenWidgetId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreenWidgetId(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [fullscreenWidgetId, setFullscreenWidgetId]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const lastLayoutRef = useRef<string>("");
  const handleLayoutChange = useCallback(
    (newLayout: any[]) => {
      const mapped: WidgetLayoutItem[] = newLayout.map((l: any) => {
        const x = Math.max(0, Math.min(l.x, COLS - 1));
        const w = Math.min(l.w, COLS - x);
        return { i: l.i, x, y: l.y, w, h: l.h };
      });
      const key = JSON.stringify(mapped);
      if (key === lastLayoutRef.current) return;
      lastLayoutRef.current = key;
      updateLayout(workspaceId, mapped);
    },
    [workspaceId, updateLayout]
  );

  // Handle drop from catalog
  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("application/widget-type")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const widgetType = e.dataTransfer.getData("application/widget-type");
    if (!widgetType) return;
    addWidget(workspaceId, widgetType);
  }, [workspaceId, addWidget]);

  const COLS = 12;

  const layoutWithConstraints = useMemo(() => {
    return layout.map((item) => {
      const widget = widgets.find((w) => w.id === item.i);
      const def = widget ? getWidgetDefinition(widget.type) : null;
      // Clamp x so widget doesn't start beyond grid
      const x = Math.min(item.x, COLS - 1);
      // Clamp w so widget doesn't extend past 12 columns
      const maxAllowedW = COLS - x;
      const w = Math.min(item.w, maxAllowedW);
      const defMaxW = def?.maxSize?.w ?? COLS;
      return {
        ...item,
        x,
        w,
        minW: def?.minSize.w ?? 2,
        minH: def?.minSize.h ?? 1,
        maxW: Math.min(defMaxW, maxAllowedW),
        maxH: def?.maxSize?.h,
      };
    });
  }, [layout, widgets]);

  if (widgets.length === 0) {
    return (
      <div
        ref={containerRef}
        className="h-full flex flex-col items-center justify-center"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          color: "var(--vp-text-subtle)",
          gap: 8,
          border: dragOver ? "2px dashed var(--vp-accent-blue-glow)" : "2px dashed transparent",
          background: dragOver ? "var(--vp-accent-blue-bg)" : "transparent",
          borderRadius: 10,
          transition: "all 0.2s",
        }}
      >
        {dragOver ? (
          <span style={{ fontSize: 14, fontWeight: 500, color: "var(--vp-accent-blue)" }}>
            Drop widget here
          </span>
        ) : (
          <>
            <span style={{ fontSize: 14, fontWeight: 500 }}>No widgets yet</span>
            <span style={{ fontSize: 12, color: "var(--vp-text-subtle)" }}>
              Drag a widget from the panel or click "Add Widget"
            </span>
          </>
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-full overflow-y-auto overflow-x-hidden"
      style={{ padding: 4, position: "relative" }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drop overlay when dragging */}
      {dragOver && (
        <div
          style={{
            position: "absolute",
            inset: 4,
            border: "2px dashed var(--vp-accent-blue-glow)",
            background: "var(--vp-accent-blue-bg)",
            borderRadius: 10,
            zIndex: 50,
            pointerEvents: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
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
            Drop to add widget
          </span>
        </div>
      )}

      <ResponsiveGridLayout
        className="widget-grid-layout"
        layouts={{ lg: layoutWithConstraints }}
        breakpoints={{ lg: 0 }}
        cols={{ lg: 12 }}
        rowHeight={40}
        width={containerWidth}
        margin={[8, 8]}
        containerPadding={[4, 4]}
        isDraggable
        isResizable
        draggableHandle=".widget-drag-handle"
        onLayoutChange={handleLayoutChange}
        compactType="vertical"
        useCSSTransforms
      >
        {widgets.map((widget) => (
          <div key={widget.id}>
            <WidgetCard
              widgetId={widget.id}
              widgetType={widget.type}
              workspaceId={workspaceId}
              config={widget.config}
            />
          </div>
        ))}
      </ResponsiveGridLayout>

      {/* Fullscreen overlay */}
      {fullscreenWidgetId && (() => {
        const fsWidget = widgets.find((w) => w.id === fullscreenWidgetId);
        if (!fsWidget) return null;
        return (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 200,
              background: "var(--vp-bg-overlay)",
              backdropFilter: "blur(8px)",
              display: "flex",
              alignItems: "stretch",
              justifyContent: "stretch",
              padding: 16,
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setFullscreenWidgetId(null);
            }}
          >
            <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
              <WidgetCard
                widgetId={fsWidget.id}
                widgetType={fsWidget.type}
                workspaceId={workspaceId}
                config={fsWidget.config}
              />
            </div>
          </div>
        );
      })()}
    </div>
  );
}
