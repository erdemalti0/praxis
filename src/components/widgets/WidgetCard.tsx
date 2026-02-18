import { Suspense, memo, useCallback } from "react";
import { GripVertical, Maximize2, Minimize2, X } from "lucide-react";
import { getWidgetComponent, getWidgetDefinition } from "./registry";
import { useUIStore } from "../../stores/uiStore";
import { useWidgetStore } from "../../stores/widgetStore";

interface WidgetCardProps {
  widgetId: string;
  widgetType: string;
  workspaceId: string;
  config?: Record<string, any>;
}

const LOADING_FALLBACK = (
  <div className="h-full flex items-center justify-center" style={{ color: "var(--vp-text-subtle)", fontSize: 12 }}>
    Loading...
  </div>
);

export default memo(function WidgetCard({ widgetId, widgetType, workspaceId, config }: WidgetCardProps) {
  const def = getWidgetDefinition(widgetType);
  const Component = getWidgetComponent(widgetType);
  const fullscreenWidgetId = useUIStore((s) => s.fullscreenWidgetId);
  const setFullscreenWidgetId = useUIStore((s) => s.setFullscreenWidgetId);
  const isFullscreen = fullscreenWidgetId === widgetId;
  const isCustomizeMode = useUIStore((s) => s.showCustomizePanel);
  const topPaneContent = useUIStore((s) => s.topPaneContent);
  const removeWidget = useWidgetStore((s) => s.removeWidget);

  const toggleFullscreen = useCallback(() => {
    setFullscreenWidgetId(isFullscreen ? null : widgetId);
  }, [isFullscreen, widgetId, setFullscreenWidgetId]);

  const handleRemove = useCallback(() => {
    removeWidget(workspaceId, widgetId);
  }, [workspaceId, widgetId, removeWidget]);

  if (!def || !Component) {
    return (
      <div className="h-full flex items-center justify-center" style={{ color: "var(--vp-text-faint)", fontSize: 12 }}>
        Unknown widget: {widgetType}
      </div>
    );
  }

  return (
    <div
      className="h-full flex flex-col"
      style={{
        background: "var(--vp-bg-surface)",
        border: "1px solid var(--vp-border-subtle)",
        borderRadius: "var(--vp-radius-xl)",
        overflow: "hidden",
        transition: "box-shadow 0.25s ease, border-color 0.25s ease",
        boxShadow: isFullscreen ? "0 8px 40px rgba(0,0,0,0.4)" : "none",
        borderColor: isFullscreen ? "var(--vp-border-medium)" : "var(--vp-border-subtle)",
      }}
    >
      <div
        className="flex items-center gap-2 px-3 shrink-0"
        style={{
          height: 32,
          background: "var(--vp-bg-surface)",
          borderBottom: "1px solid var(--vp-border-subtle)",
          userSelect: "none",
        }}
      >
        <div
          className="widget-drag-handle flex items-center gap-2"
          style={{ flex: 1, minWidth: 0, cursor: "grab", height: "100%" }}
        >
          <GripVertical size={12} style={{ color: "var(--vp-text-subtle)", flexShrink: 0 }} />
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: "var(--vp-text-muted)",
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {def.name}
          </span>
        </div>
        {isCustomizeMode ? (
          <button
            onClick={handleRemove}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 4,
              color: "var(--vp-text-faint)",
              display: "flex",
              alignItems: "center",
              borderRadius: "var(--vp-radius-sm)",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--vp-accent-red-text)";
              e.currentTarget.style.background = "var(--vp-accent-red-bg)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--vp-text-faint)";
              e.currentTarget.style.background = "none";
            }}
            title="Remove widget"
          >
            <X size={13} />
          </button>
        ) : topPaneContent === "widgets" ? (
          /* Widget pane is on top (main view) — show fullscreen button */
          <button
            onClick={(e) => {
              const btn = e.currentTarget;
              btn.style.transform = "scale(0.8)";
              setTimeout(() => { btn.style.transform = "scale(1)"; }, 150);
              toggleFullscreen();
            }}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 4,
              color: "var(--vp-text-subtle)",
              display: "flex",
              alignItems: "center",
              borderRadius: "var(--vp-radius-sm)",
              flexShrink: 0,
              transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--vp-text-primary)";
              e.currentTarget.style.background = "var(--vp-border-subtle)";
              e.currentTarget.style.transform = "scale(1.15)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--vp-text-subtle)";
              e.currentTarget.style.background = "none";
              e.currentTarget.style.transform = "scale(1)";
            }}
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
        ) : null}
      </div>
      <div className="flex-1 min-h-0" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <Suspense fallback={LOADING_FALLBACK}>
          <Component widgetId={widgetId} workspaceId={workspaceId} config={config} />
        </Suspense>
      </div>
    </div>
  );
});
