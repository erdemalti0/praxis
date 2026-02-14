import { useEffect } from "react";
import { X } from "lucide-react";

interface ShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
}

interface ShortcutEntry {
  label: string;
  keys: string;
}

const SECTIONS: { title: string; shortcuts: ShortcutEntry[] }[] = [
  {
    title: "General",
    shortcuts: [
      { label: "Command Palette", keys: "Cmd+K" },
      { label: "Settings", keys: "Cmd+," },
      { label: "Shortcuts Help", keys: "?" },
    ],
  },
  {
    title: "Terminal",
    shortcuts: [
      { label: "New Terminal", keys: "Cmd+T" },
      { label: "Close Tab", keys: "Cmd+W" },
    ],
  },
  {
    title: "Browser",
    shortcuts: [
      { label: "Focus URL", keys: "Cmd+L" },
      { label: "Reload", keys: "Cmd+R" },
      { label: "Back", keys: "Cmd+[" },
      { label: "Forward", keys: "Cmd+]" },
      { label: "New Tab", keys: "Cmd+T" },
    ],
  },
  {
    title: "Navigation",
    shortcuts: [
      { label: "Switch Workspace", keys: "Cmd+1-9" },
    ],
  },
];

export default function ShortcutsDialog({ open, onClose }: ShortcutsDialogProps) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

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

        <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--vp-text-primary)", marginBottom: 20 }}>
          Keyboard Shortcuts
        </h2>

        {SECTIONS.map((section) => (
          <div key={section.title} style={{ marginBottom: 16 }}>
            <div style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--vp-text-muted)",
              textTransform: "uppercase",
              letterSpacing: 0.5,
              marginBottom: 8,
            }}>
              {section.title}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {section.shortcuts.map((s) => (
                <div
                  key={s.label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "4px 0",
                  }}
                >
                  <span style={{ fontSize: 12, color: "var(--vp-text-primary)" }}>{s.label}</span>
                  <span style={{
                    fontSize: 11,
                    fontFamily: "monospace",
                    background: "var(--vp-bg-surface-hover)",
                    padding: "2px 6px",
                    borderRadius: 4,
                    color: "var(--vp-text-muted)",
                  }}>
                    {s.keys}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
