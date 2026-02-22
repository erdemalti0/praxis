import { Suspense, memo, useCallback, useState, useRef, useEffect } from "react";
import { GripVertical, Maximize2, Minimize2, X, Lock, Unlock, Copy, Pencil } from "lucide-react";
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
  const renameWidget = useWidgetStore((s) => s.renameWidget);
  const toggleWidgetLock = useWidgetStore((s) => s.toggleWidgetLock);
  const duplicateWidget = useWidgetStore((s) => s.duplicateWidget);
  const widgets = useWidgetStore((s) => s.workspaceWidgets[workspaceId] || []);
  const widgetInstance = widgets.find((w) => w.id === widgetId);
  const isLocked = widgetInstance?.locked ?? false;
  const customName = widgetInstance?.customName;

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming && renameRef.current) {
      renameRef.current.focus();
      renameRef.current.select();
    }
  }, [isRenaming]);

  const toggleFullscreen = useCallback(() => {
    setFullscreenWidgetId(isFullscreen ? null : widgetId);
  }, [isFullscreen, widgetId, setFullscreenWidgetId]);

  const handleRemove = useCallback(() => {
    removeWidget(workspaceId, widgetId);
  }, [workspaceId, widgetId, removeWidget]);

  const handleStartRename = useCallback(() => {
    setRenameValue(customName || def?.name || "");
    setIsRenaming(true);
  }, [customName, def]);

  const handleFinishRename = useCallback(() => {
    renameWidget(workspaceId, widgetId, renameValue.trim());
    setIsRenaming(false);
  }, [workspaceId, widgetId, renameValue, renameWidget]);

  const handleLock = useCallback(() => {
    toggleWidgetLock(workspaceId, widgetId);
  }, [workspaceId, widgetId, toggleWidgetLock]);

  const handleDuplicate = useCallback(() => {
    duplicateWidget(workspaceId, widgetId);
  }, [workspaceId, widgetId, duplicateWidget]);

  if (!def || !Component) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2" style={{ color: "var(--vp-text-faint)", fontSize: 12 }}>
        <span>This widget is no longer available</span>
        <button
          onClick={handleRemove}
          style={{
            fontSize: 10,
            color: "var(--vp-accent-red)",
            background: "none",
            border: "1px solid var(--vp-accent-red-border, var(--vp-border-light))",
            borderRadius: "var(--vp-radius-sm)",
            padding: "2px 8px",
            cursor: "pointer",
          }}
        >
          Remove
        </button>
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
          className={isLocked ? "" : "widget-drag-handle"}
          style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0, cursor: isLocked ? "default" : "grab", height: "100%" }}
        >
          {!isLocked && <GripVertical size={12} className="grip-icon" style={{ color: "var(--vp-text-subtle)", flexShrink: 0 }} />}
          {isLocked && <Lock size={11} style={{ color: "var(--vp-text-subtle)", flexShrink: 0 }} />}
          {isRenaming ? (
            <div style={{ display: "flex", alignItems: "center", gap: 2, flex: 1, minWidth: 0 }}>
              <input
                ref={renameRef}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleFinishRename();
                  if (e.key === "Escape") setIsRenaming(false);
                }}
                onBlur={handleFinishRename}
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: "var(--vp-text-primary)",
                  background: "var(--vp-input-bg)",
                  border: "1px solid var(--vp-input-border-focus)",
                  borderRadius: "var(--vp-radius-sm)",
                  padding: "1px 4px",
                  outline: "none",
                  flex: 1,
                  minWidth: 0,
                }}
              />
            </div>
          ) : (
            <span
              onDoubleClick={handleStartRename}
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: "var(--vp-text-muted)",
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                cursor: "default",
              }}
              title="Double-click to rename"
            >
              {customName || def.name}
            </span>
          )}
        </div>
        {isCustomizeMode ? (
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            <button
              onClick={handleStartRename}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--vp-text-faint)", display: "flex", alignItems: "center", borderRadius: "var(--vp-radius-sm)", flexShrink: 0 }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--vp-text-primary)"; e.currentTarget.style.background = "var(--vp-bg-surface-hover)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--vp-text-faint)"; e.currentTarget.style.background = "none"; }}
              title="Rename"
            >
              <Pencil size={12} />
            </button>
            <button
              onClick={handleLock}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: isLocked ? "var(--vp-accent-blue)" : "var(--vp-text-faint)", display: "flex", alignItems: "center", borderRadius: "var(--vp-radius-sm)", flexShrink: 0 }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--vp-bg-surface-hover)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
              title={isLocked ? "Unlock" : "Lock position"}
            >
              {isLocked ? <Lock size={12} /> : <Unlock size={12} />}
            </button>
            <button
              onClick={handleDuplicate}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--vp-text-faint)", display: "flex", alignItems: "center", borderRadius: "var(--vp-radius-sm)", flexShrink: 0 }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--vp-text-primary)"; e.currentTarget.style.background = "var(--vp-bg-surface-hover)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--vp-text-faint)"; e.currentTarget.style.background = "none"; }}
              title="Duplicate"
            >
              <Copy size={12} />
            </button>
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
          </div>
        ) : (topPaneContent === "widgets" || isFullscreen) ? (
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
