import { useMemo, useCallback, useRef, useState, useEffect } from "react";
import { ResponsiveGridLayout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import WidgetCard from "./WidgetCard";
import { useWidgetStore } from "../../stores/widgetStore";
import { useUIStore } from "../../stores/uiStore";
import { getWidgetDefinition } from "./registry";
import type { WidgetInstance, WidgetLayoutItem } from "../../types/widget";
import { LayoutGrid, Terminal, GitBranch, Timer, Plus } from "lucide-react";

interface WorkspaceContentProps {
  workspaceId: string;
  isCustomizeMode?: boolean;
}

const EMPTY_WIDGETS: WidgetInstance[] = [];
const EMPTY_LAYOUT: WidgetLayoutItem[] = [];

export default function WorkspaceContent({ workspaceId, isCustomizeMode = false }: WorkspaceContentProps) {
  const widgets = useWidgetStore((s) => s.workspaceWidgets[workspaceId] ?? EMPTY_WIDGETS);
  const layout = useWidgetStore((s) => s.workspaceLayouts[workspaceId] ?? EMPTY_LAYOUT);
  const updateLayout = useWidgetStore((s) => s.updateLayout);
  const addWidget = useWidgetStore((s) => s.addWidget);
  const fullscreenWidgetId = useUIStore((s) => s.fullscreenWidgetId);
  const setFullscreenWidgetId = useUIStore((s) => s.setFullscreenWidgetId);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1200);
  const [dragOver, setDragOver] = useState(false);
  const [resizing, setResizing] = useState<{ w: number; h: number } | null>(null);

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
    (newLayout: any) => {
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

  const setShowWidgetCatalog = useUIStore((s) => s.setShowWidgetCatalog);
  const setShowCustomizePanel = useUIStore((s) => s.setShowCustomizePanel);

  const popularWidgets = [
    { type: "terminal", name: "Terminal", icon: <Terminal size={20} />, color: "var(--vp-accent-green)" },
    { type: "git-status", name: "Git Status", icon: <GitBranch size={20} />, color: "var(--vp-accent-blue)" },
    { type: "pomodoro", name: "Pomodoro", icon: <Timer size={20} />, color: "var(--vp-accent-amber)" },
  ];

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
          gap: 24,
          border: dragOver ? "2px dashed var(--vp-accent-blue-glow)" : "2px dashed transparent",
          background: dragOver ? "var(--vp-accent-blue-bg)" : "transparent",
          borderRadius: "var(--vp-radius-xl)",
          transition: "all 0.2s",
        }}
      >
        {dragOver ? (
          <span style={{ fontSize: 14, fontWeight: 500, color: "var(--vp-accent-blue)" }}>
            Drop widget here
          </span>
        ) : (
          <>
            {/* Hero */}
            <div style={{ textAlign: "center" }}>
              <LayoutGrid size={48} style={{ color: "var(--vp-accent-blue)", marginBottom: 12 }} />
              <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--vp-text-primary)", marginBottom: 6 }}>
                Add Your First Widget
              </h3>
              <p style={{ fontSize: 12, color: "var(--vp-text-muted)", maxWidth: 320 }}>
                Customize your workspace with terminals, git status, timers, and more
              </p>
            </div>

            {/* Popular widgets */}
            <div style={{ display: "flex", gap: 12 }}>
              {popularWidgets.map((pw) => (
                <button
                  key={pw.type}
                  onClick={() => addWidget(workspaceId, pw.type)}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                    padding: "16px 20px", borderRadius: "var(--vp-radius-2xl)", minWidth: 100,
                    background: "var(--vp-bg-surface)", border: "1px solid var(--vp-border-light)",
                    color: pw.color, cursor: "pointer", transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-2px)";
                    e.currentTarget.style.borderColor = "var(--vp-border-medium)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.borderColor = "var(--vp-border-light)";
                  }}
                >
                  {pw.icon}
                  <span style={{ fontSize: 11, fontWeight: 500 }}>{pw.name}</span>
                </button>
              ))}
            </div>

            {/* Browse all */}
            <button
              onClick={() => {
                if (isCustomizeMode) {
                  setShowWidgetCatalog(true);
                } else {
                  setShowCustomizePanel(true);
                }
              }}
              style={{
                padding: "8px 20px", borderRadius: "var(--vp-radius-lg)", fontSize: 12, fontWeight: 500,
                background: "var(--vp-accent-blue-bg)", border: "1px solid var(--vp-accent-blue-border)",
                color: "var(--vp-accent-blue)", cursor: "pointer", transition: "all 0.2s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--vp-accent-blue-bg-hover)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "var(--vp-accent-blue-bg)"; }}
            >
              Browse All Widgets
            </button>
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
            borderRadius: "var(--vp-radius-xl)",
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
              borderRadius: "var(--vp-radius-xl)",
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
        draggableHandle=".widget-drag-handle"
        onLayoutChange={handleLayoutChange}
        onResizeStart={(_layout: any, _oldItem: any, newItem: any) => setResizing({ w: newItem.w, h: newItem.h })}
        onResize={(_layout: any, _oldItem: any, newItem: any) => setResizing({ w: newItem.w, h: newItem.h })}
        onResizeStop={() => setResizing(null)}
        compactType="vertical"
        useCSSTransforms
        {...{ isDraggable: true, isResizable: true } as any}
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

      {/* Resize size indicator */}
      {resizing && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%",
          transform: "translateX(-50%)",
          background: "var(--vp-bg-overlay)", backdropFilter: "blur(8px)",
          border: "1px solid var(--vp-border-panel)",
          borderRadius: "var(--vp-radius-lg)", padding: "6px 14px",
          zIndex: 100,
          fontSize: 13, fontWeight: 600, color: "var(--vp-text-primary)",
          fontFamily: "monospace",
          pointerEvents: "none",
        }}>
          {resizing.w} × {resizing.h}
        </div>
      )}

      {/* Floating add widget button — hidden in customize mode (catalog is inline) */}
      {!fullscreenWidgetId && !isCustomizeMode && (
        <button
          onClick={() => setShowCustomizePanel(true)}
          title="Add Widget"
          style={{
            position: "fixed", bottom: 24, right: 24,
            width: 48, height: 48, borderRadius: "50%",
            background: "var(--vp-accent-blue)",
            border: "2px solid var(--vp-accent-blue-border)",
            color: "#fff", cursor: "pointer", zIndex: 10,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 16px var(--vp-accent-blue-glow)",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.1)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
        >
          <Plus size={22} />
        </button>
      )}

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
