import { useState, useEffect } from "react";
import { X, Zap } from "lucide-react";
import type { MissionStep } from "../../types/mission";

interface MissionStepDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (title: string, description: string, prompt?: string) => void;
  editStep?: MissionStep | null;
}

export default function MissionStepDialog({ open, onClose, onSubmit, editStep }: MissionStepDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [prompt, setPrompt] = useState("");
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    if (editStep) {
      setTitle(editStep.title);
      setDescription(editStep.description);
      setPrompt(editStep.prompt || "");
      setShowPrompt(!!editStep.prompt);
    } else {
      setTitle("");
      setDescription("");
      setPrompt("");
      setShowPrompt(false);
    }
  }, [editStep, open]);

  if (!open) return null;

  const handleSubmit = () => {
    if (!title.trim()) return;
    onSubmit(title.trim(), description.trim(), prompt.trim() || undefined);
    onClose();
  };

  const inputStyle = {
    width: "100%",
    background: "var(--vp-bg-surface)",
    border: "1px solid var(--vp-border-light)",
    borderRadius: "var(--vp-radius-xl)",
    padding: "10px 14px",
    color: "var(--vp-text-primary)",
    fontSize: 12 as const,
    outline: "none",
    fontFamily: "inherit",
    transition: "border-color 0.15s",
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
          width: 440, background: "var(--vp-bg-secondary)",
          border: "1px solid var(--vp-border-light)",
          borderRadius: "var(--vp-radius-4xl)",
          boxShadow: "0 20px 60px var(--vp-bg-overlay)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between" style={{
          padding: "16px 20px",
          borderBottom: "1px solid var(--vp-border-subtle)",
          background: "var(--vp-bg-surface)",
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--vp-text-primary)" }}>
            {editStep ? "Edit Step" : "New Step"}
          </span>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", color: "var(--vp-text-faint)", cursor: "pointer",
              width: 28, height: 28, borderRadius: "var(--vp-radius-md)",
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
            placeholder="Step title"
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) handleSubmit(); if (e.key === "Escape") onClose(); }}
            style={{ ...inputStyle, fontSize: 13, marginBottom: 14 }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--vp-accent-blue-border)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "var(--vp-border-light)"; }}
          />

          <label style={{ fontSize: 10, fontWeight: 600, color: "var(--vp-text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6, display: "block" }}>
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What needs to be done (optional)"
            rows={2}
            style={{
              ...inputStyle, color: "var(--vp-text-secondary)",
              resize: "vertical", marginBottom: 14,
              lineHeight: 1.5,
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--vp-accent-blue-border)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "var(--vp-border-light)"; }}
          />

          {/* AI Prompt toggle */}
          {!showPrompt ? (
            <button
              onClick={() => setShowPrompt(true)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 12px", borderRadius: "var(--vp-radius-lg)",
                background: "rgba(167,139,250,0.06)", border: "1px solid rgba(167,139,250,0.15)",
                color: "#a78bfa", fontSize: 11, cursor: "pointer",
                transition: "all 0.15s", width: "100%",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(167,139,250,0.1)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(167,139,250,0.06)"; }}
            >
              <Zap size={12} />
              Add AI prompt (sent to agent on play)
            </button>
          ) : (
            <div>
              <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                <label className="flex items-center gap-1.5" style={{ fontSize: 10, fontWeight: 600, color: "#a78bfa", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  <Zap size={10} /> AI Prompt
                </label>
                <button
                  onClick={() => { setShowPrompt(false); setPrompt(""); }}
                  style={{
                    background: "none", border: "none", color: "var(--vp-text-faint)",
                    fontSize: 9, cursor: "pointer",
                  }}
                >
                  Remove
                </button>
              </div>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="The prompt to send to the AI agent..."
                rows={4}
                style={{
                  ...inputStyle,
                  color: "var(--vp-accent-purple, #c9b8fa)",
                  fontFamily: "monospace",
                  fontSize: 11,
                  resize: "vertical",
                  background: "rgba(167,139,250,0.04)",
                  borderColor: "rgba(167,139,250,0.15)",
                  lineHeight: 1.5,
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(167,139,250,0.3)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(167,139,250,0.15)"; }}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2" style={{
          padding: "14px 20px",
          borderTop: "1px solid var(--vp-border-subtle)",
          background: "var(--vp-bg-surface)",
        }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 18px", borderRadius: "var(--vp-radius-lg)",
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
              padding: "8px 18px", borderRadius: "var(--vp-radius-lg)",
              background: title.trim() ? "var(--vp-accent-blue-bg)" : "var(--vp-bg-surface)",
              border: `1px solid ${title.trim() ? "var(--vp-accent-blue-border)" : "var(--vp-border-subtle)"}`,
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
            {editStep ? "Save Changes" : "Add Step"}
          </button>
        </div>
      </div>
    </div>
  );
}
