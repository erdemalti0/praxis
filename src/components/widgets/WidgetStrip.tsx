import { useMemo, useCallback, useRef, useState, useEffect } from "react";
import { ResponsiveGridLayout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { ArrowUpDown } from "lucide-react";
import WidgetCard from "./WidgetCard";
import { useWidgetStore } from "../../stores/widgetStore";
import { useUIStore } from "../../stores/uiStore";
import { getWidgetDefinition } from "./registry";
import type { WidgetInstance, WidgetLayoutItem } from "../../types/widget";

interface WidgetStripProps {
  workspaceId: string;
  isMainView: boolean;
  onSwap: () => void;
}

const EMPTY_WIDGETS: WidgetInstance[] = [];
const EMPTY_LAYOUT: WidgetLayoutItem[] = [];
const COLS = 12;

export default function WidgetStrip({ workspaceId, isMainView, onSwap }: WidgetStripProps) {
  const widgets = useWidgetStore((s) => s.workspaceWidgets[workspaceId] ?? EMPTY_WIDGETS);
  const layout = useWidgetStore((s) => s.workspaceLayouts[workspaceId] ?? EMPTY_LAYOUT);
  const updateLayout = useWidgetStore((s) => s.updateLayout);
  const fullscreenWidgetId = useUIStore((s) => s.fullscreenWidgetId);
  const setFullscreenWidgetId = useUIStore((s) => s.setFullscreenWidgetId);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1200);

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
    (newLayout: any) => {
      if (!isMainView) return; // don't allow layout changes when in strip mode
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
    [workspaceId, updateLayout, isMainView]
  );

  const layoutWithConstraints = useMemo(() => {
    return layout.map((item) => {
      const widget = widgets.find((w) => w.id === item.i);
      const def = widget ? getWidgetDefinition(widget.type) : null;
      const x = Math.min(item.x, COLS - 1);
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

  const rowHeight = isMainView ? 40 : 30;

  return (
    <div
      ref={containerRef}
      className="h-full overflow-y-auto overflow-x-hidden"
      style={{ padding: 4, position: "relative" }}
    >
      {/* Swap button when widget strip is in bottom pane */}
      {!isMainView && (
        <button
          onClick={onSwap}
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
            borderRadius: "var(--vp-radius-lg)",
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

      <ResponsiveGridLayout
        className="widget-grid-layout"
        layouts={{ lg: layoutWithConstraints }}
        breakpoints={{ lg: 0 }}
        cols={{ lg: COLS }}
        rowHeight={rowHeight}
        width={containerWidth}
        margin={[8, 8]}
        containerPadding={[4, 4]}
        draggableHandle=".widget-drag-handle"
        onLayoutChange={handleLayoutChange}
        compactType="vertical"
        useCSSTransforms
        {...{ isDraggable: isMainView, isResizable: isMainView } as any}
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
              animation: "fsOverlayIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setFullscreenWidgetId(null);
            }}
          >
            <div style={{
              flex: 1, minWidth: 0, minHeight: 0,
              animation: "fsContentIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
            }}>
              <WidgetCard
                widgetId={fsWidget.id}
                widgetType={fsWidget.type}
                workspaceId={workspaceId}
                config={fsWidget.config}
              />
            </div>
            <style>{`
              @keyframes fsOverlayIn {
                from { opacity: 0; }
                to { opacity: 1; }
              }
              @keyframes fsContentIn {
                from { opacity: 0; transform: scale(0.92); }
                to { opacity: 1; transform: scale(1); }
              }
            `}</style>
          </div>
        );
      })()}
    </div>
  );
}
