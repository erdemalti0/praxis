import { useState, useEffect, useCallback } from "react";
import WorkspaceContent from "./WorkspaceContent";
import { useUIStore } from "../../stores/uiStore";
import { LayoutGrid } from "lucide-react";
import WidgetCatalog from "./WidgetCatalog";

interface CustomizePanelProps {
  workspaceId: string;
}

export default function CustomizePanel({ workspaceId }: CustomizePanelProps) {
  const setShowCustomizePanel = useUIStore((s) => s.setShowCustomizePanel);
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setShowCustomizePanel(false);
    }, 250);
  }, [setShowCustomizePanel]);

  // ESC to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleClose]);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 100,
        background: "var(--vp-bg-primary)",
        display: "flex",
        flexDirection: "column",
        borderRadius: "var(--vp-radius-3xl)",
        overflow: "hidden",
        animation: isClosing
          ? "customizePanelOut 0.25s cubic-bezier(0.7, 0, 0.84, 0) forwards"
          : "customizePanelIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 16px",
          background: "var(--vp-bg-surface)",
          borderBottom: "1px solid var(--vp-border-subtle)",
          flexShrink: 0,
        }}
      >
        <LayoutGrid size={16} style={{ color: "var(--vp-accent-blue)" }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--vp-text-primary)", flex: 1 }}>
          Customize Widgets
        </span>
        <span style={{ fontSize: 11, color: "var(--vp-text-muted)" }}>
          Drag widgets from the right panel to add them
        </span>
        <button
          onClick={handleClose}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 16px",
            borderRadius: "var(--vp-radius-md)",
            background: "var(--vp-accent-blue)",
            border: "none",
            color: "#fff",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 600,
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = "0.85";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = "1";
          }}
        >
          Done
        </button>
      </div>

      {/* Content: widget grid + catalog side by side */}
      <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
        {/* Widget grid area */}
        <div style={{ flex: 1, minWidth: 0, overflow: "hidden", background: "var(--vp-bg-surface)" }}>
          <WorkspaceContent workspaceId={workspaceId} isCustomizeMode />
        </div>
        {/* Catalog sidebar */}
        <WidgetCatalog
          workspaceId={workspaceId}
          onClose={handleClose}
        />
      </div>
    </div>
  );
}
