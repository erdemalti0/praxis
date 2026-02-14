import { useState } from "react";
import { X, Workflow } from "lucide-react";

interface MissionCreateDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (title: string, description: string) => void;
}

export default function MissionCreateDialog({ open, onClose, onSubmit }: MissionCreateDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  if (!open) return null;

  const handleSubmit = () => {
    if (!title.trim()) return;
    onSubmit(title.trim(), description.trim());
    setTitle("");
    setDescription("");
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 300,
        background: "var(--vp-bg-overlay)", backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width: 420, background: "var(--vp-bg-secondary)",
          border: "1px solid var(--vp-border-light)",
          borderRadius: 16, padding: 0,
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between" style={{
          padding: "16px 20px",
          borderBottom: "1px solid var(--vp-bg-surface-hover)",
          background: "var(--vp-bg-surface)",
        }}>
          <div className="flex items-center gap-2">
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              background: "var(--vp-accent-blue-bg)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Workflow size={14} style={{ color: "var(--vp-accent-blue)" }} />
            </div>
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--vp-text-primary)" }}>
              New Mission
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", color: "var(--vp-text-faint)", cursor: "pointer",
              width: 28, height: 28, borderRadius: 6,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--vp-text-primary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--vp-text-faint)"; }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px" }}>
          <label style={{ fontSize: 10, fontWeight: 600, color: "var(--vp-text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6, display: "block" }}>
            Title
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Add Dark Mode"
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) handleSubmit(); if (e.key === "Escape") onClose(); }}
            style={{
              width: "100%", background: "var(--vp-bg-surface)",
              border: "1px solid var(--vp-border-light)", borderRadius: 10,
              padding: "10px 14px", color: "var(--vp-text-primary)", fontSize: 13,
              outline: "none", fontFamily: "inherit", marginBottom: 14,
              transition: "border-color 0.15s",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--vp-accent-blue-border)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "var(--vp-border-light)"; }}
          />

          <label style={{ fontSize: 10, fontWeight: 600, color: "var(--vp-text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6, display: "block" }}>
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the mission goal (optional)"
            rows={3}
            style={{
              width: "100%", background: "var(--vp-bg-surface)",
              border: "1px solid var(--vp-border-light)", borderRadius: 10,
              padding: "10px 14px", color: "var(--vp-text-secondary)", fontSize: 12,
              outline: "none", fontFamily: "inherit", resize: "vertical",
              lineHeight: 1.5,
              transition: "border-color 0.15s",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--vp-accent-blue-border)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "var(--vp-border-light)"; }}
          />
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2" style={{
          padding: "14px 20px",
          borderTop: "1px solid var(--vp-bg-surface-hover)",
          background: "var(--vp-bg-surface)",
        }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 18px", borderRadius: 9,
              background: "transparent", border: "1px solid var(--vp-border-light)",
              color: "var(--vp-text-muted)", fontSize: 12, cursor: "pointer",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--vp-border-medium)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--vp-border-light)"; }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!title.trim()}
            style={{
              padding: "8px 18px", borderRadius: 9,
              background: title.trim() ? "var(--vp-accent-blue-bg)" : "var(--vp-bg-surface)",
              border: `1px solid ${title.trim() ? "var(--vp-accent-blue-border)" : "var(--vp-bg-surface-hover)"}`,
              color: title.trim() ? "var(--vp-accent-blue)" : "var(--vp-text-subtle)",
              fontSize: 12, fontWeight: 600, cursor: title.trim() ? "pointer" : "not-allowed",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              if (title.trim()) e.currentTarget.style.background = "var(--vp-accent-blue-bg-hover)";
            }}
            onMouseLeave={(e) => {
              if (title.trim()) e.currentTarget.style.background = "var(--vp-accent-blue-bg)";
            }}
          >
            Create Mission
          </button>
        </div>
      </div>
    </div>
  );
}
