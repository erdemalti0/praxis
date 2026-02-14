import { useState } from "react";
import { useTaskStore } from "../../stores/taskStore";
import { X } from "lucide-react";

interface Props {
  projectPath: string;
  onClose: () => void;
}

export default function TaskCreateDialog({ projectPath, onClose }: Props) {
  const addTask = useTaskStore((s) => s.addTask);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [prompt, setPrompt] = useState("");
  const [tagInput, setTagInput] = useState("");

  const tags = tagInput
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const handleSubmit = async () => {
    if (!title.trim()) return;
    await addTask(projectPath, title.trim(), description.trim(), prompt.trim(), tags);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ background: "var(--vp-bg-overlay)", zIndex: 100 }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 460,
          background: "var(--vp-bg-secondary)",
          border: "1px solid var(--vp-border-medium)",
          borderRadius: 14,
          padding: "24px",
        }}
      >
        <div className="flex items-center justify-between mb-5">
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--vp-text-primary)" }}>
            New Task
          </span>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--vp-text-dim)",
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div className="mb-4">
          <label
            style={{
              fontSize: 11,
              color: "var(--vp-text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              display: "block",
              marginBottom: 6,
            }}
          >
            Title
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs to be done?"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) handleSubmit();
            }}
            style={{
              width: "100%",
              background: "var(--vp-bg-surface)",
              border: "1px solid var(--vp-border-medium)",
              borderRadius: 8,
              padding: "8px 12px",
              color: "var(--vp-text-primary)",
              fontSize: 13,
              outline: "none",
              fontFamily: "inherit",
            }}
          />
        </div>

        <div className="mb-4">
          <label
            style={{
              fontSize: 11,
              color: "var(--vp-text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              display: "block",
              marginBottom: 6,
            }}
          >
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional details..."
            rows={3}
            style={{
              width: "100%",
              background: "var(--vp-bg-surface)",
              border: "1px solid var(--vp-border-medium)",
              borderRadius: 8,
              padding: "8px 12px",
              color: "var(--vp-text-primary)",
              fontSize: 12,
              outline: "none",
              fontFamily: "inherit",
              resize: "vertical",
            }}
          />
        </div>

        <div className="mb-4">
          <label
            style={{
              fontSize: 11,
              color: "var(--vp-text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              display: "block",
              marginBottom: 6,
            }}
          >
            Prompt
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="AI prompt for this task..."
            rows={5}
            style={{
              width: "100%",
              background: "var(--vp-bg-surface)",
              border: "1px solid var(--vp-border-medium)",
              borderRadius: 8,
              padding: "8px 12px",
              color: "var(--vp-text-primary)",
              fontSize: 12,
              outline: "none",
              fontFamily: "inherit",
              resize: "vertical",
            }}
          />
        </div>

        <div className="mb-5">
          <label
            style={{
              fontSize: 11,
              color: "var(--vp-text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              display: "block",
              marginBottom: 6,
            }}
          >
            Tags (comma separated)
          </label>
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            placeholder="frontend, bug, urgent"
            style={{
              width: "100%",
              background: "var(--vp-bg-surface)",
              border: "1px solid var(--vp-border-medium)",
              borderRadius: 8,
              padding: "8px 12px",
              color: "var(--vp-text-primary)",
              fontSize: 12,
              outline: "none",
              fontFamily: "inherit",
            }}
          />
        </div>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              fontSize: 12,
              cursor: "pointer",
              background: "transparent",
              border: "1px solid var(--vp-border-medium)",
              color: "var(--vp-text-muted)",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--vp-border-medium)")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--vp-border-medium)")}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!title.trim()}
            style={{
              padding: "8px 20px",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 500,
              cursor: title.trim() ? "pointer" : "not-allowed",
              background: title.trim()
                ? "var(--vp-border-light)"
                : "var(--vp-bg-surface)",
              border: "1px solid var(--vp-border-medium)",
              color: title.trim() ? "var(--vp-text-primary)" : "var(--vp-text-faint)",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              if (title.trim()) e.currentTarget.style.background = "var(--vp-border-medium)";
            }}
            onMouseLeave={(e) => {
              if (title.trim()) e.currentTarget.style.background = "var(--vp-border-light)";
            }}
          >
            Create Task
          </button>
        </div>
      </div>
    </div>
  );
}
