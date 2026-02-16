import { useEffect } from "react";
import { X, Settings } from "lucide-react";
import { ALL_SHORTCUTS, SHORTCUT_CATEGORIES, formatShortcut, getShortcutKey } from "../../lib/shortcuts";
import { useSettingsStore } from "../../stores/settingsStore";

interface ShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function ShortcutsDialog({ open, onClose }: ShortcutsDialogProps) {
  const customShortcuts = useSettingsStore((s) => s.customShortcuts);
  const setShowSettingsPanel = useSettingsStore((s) => s.setShowSettingsPanel);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const openShortcutSettings = () => {
    onClose();
    setShowSettingsPanel(true);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        zIndex: 9998,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 550,
          width: "90%",
          maxHeight: "70vh",
          overflowY: "auto",
          background: "var(--vp-bg-surface)",
          borderRadius: 12,
          padding: 24,
          border: "1px solid var(--vp-border-panel)",
          position: "relative",
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            background: "none",
            border: "none",
            color: "var(--vp-text-muted)",
            cursor: "pointer",
            padding: 4,
            display: "flex",
          }}
        >
          <X size={16} />
        </button>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--vp-text-primary)", margin: 0 }}>
            Keyboard Shortcuts
          </h2>
          <button
            onClick={openShortcutSettings}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "4px 10px",
              borderRadius: 6,
              background: "transparent",
              border: "1px solid var(--vp-border-light)",
              color: "var(--vp-accent-blue)",
              cursor: "pointer",
              fontSize: 11,
              marginRight: 28,
            }}
          >
            <Settings size={12} />
            Customize
          </button>
        </div>

        {SHORTCUT_CATEGORIES.map((category) => {
          const shortcuts = ALL_SHORTCUTS.filter((s) => s.category === category);
          if (shortcuts.length === 0) return null;

          return (
            <div key={category} style={{ marginBottom: 16 }}>
              <div style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--vp-text-muted)",
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginBottom: 8,
              }}>
                {category}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {shortcuts.map((shortcut) => {
                  const currentKey = getShortcutKey(shortcut.id, customShortcuts);
                  const isCustom = customShortcuts[shortcut.id] !== undefined;
                  const display = currentKey ? formatShortcut(currentKey) : "—";

                  return (
                    <div
                      key={shortcut.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "4px 0",
                      }}
                    >
                      <span style={{ fontSize: 12, color: "var(--vp-text-primary)" }}>{shortcut.label}</span>
                      <span style={{
                        fontSize: 11,
                        fontFamily: "monospace",
                        background: "var(--vp-bg-surface-hover)",
                        padding: "2px 6px",
                        borderRadius: 4,
                        color: isCustom ? "var(--vp-accent-blue)" : "var(--vp-text-muted)",
                        fontWeight: isCustom ? 600 : 400,
                      }}>
                        {display}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
