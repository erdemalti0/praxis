import { useState } from "react";
import { ShieldCheck, ShieldX } from "lucide-react";

interface Props {
  promptId: string;
  rawText: string;
  responseType: "yes_no" | "choice" | "freeform";
  onRespond: (response: string) => void;
}

/**
 * Approval card for interactive CLI permission prompts.
 * Shown when permissionMode is "prompt" and the CLI asks for user confirmation.
 */
export default function PromptApprovalBlock({ promptId, rawText, responseType, onRespond }: Props) {
  const [responded, setResponded] = useState(false);
  const [freeformValue, setFreeformValue] = useState("");

  const handleRespond = (response: string) => {
    if (responded) return;
    setResponded(true);
    onRespond(response);
  };

  return (
    <div
      data-prompt-id={promptId}
      style={{
        border: responded ? "1px solid var(--vp-border-subtle)" : "1px solid #f59e0b",
        borderRadius: 8,
        padding: 12,
        margin: "4px 0",
        background: responded ? "var(--vp-bg-surface)" : "rgba(245, 158, 11, 0.05)",
        opacity: responded ? 0.6 : 1,
      }}
    >
      {/* Prompt text */}
      <div style={{ fontSize: 12, color: "var(--vp-text-primary)", marginBottom: 8, fontFamily: "monospace" }}>
        {rawText}
      </div>

      {responded ? (
        <div style={{ fontSize: 11, color: "var(--vp-text-dim)" }}>Response sent</div>
      ) : (
        <>
          {responseType === "yes_no" && (
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => handleRespond("y\n")}
                style={{
                  display: "flex", alignItems: "center", gap: 4,
                  padding: "6px 14px", borderRadius: 6,
                  border: "1px solid #22c55e",
                  background: "rgba(34, 197, 94, 0.1)",
                  color: "#22c55e", fontSize: 12, cursor: "pointer", fontWeight: 500,
                }}
              >
                <ShieldCheck size={14} /> Allow
              </button>
              <button
                onClick={() => handleRespond("n\n")}
                style={{
                  display: "flex", alignItems: "center", gap: 4,
                  padding: "6px 14px", borderRadius: 6,
                  border: "1px solid #ef4444",
                  background: "rgba(239, 68, 68, 0.1)",
                  color: "#ef4444", fontSize: 12, cursor: "pointer", fontWeight: 500,
                }}
              >
                <ShieldX size={14} /> Deny
              </button>
            </div>
          )}

          {responseType === "freeform" && (
            <div style={{ display: "flex", gap: 6 }}>
              <input
                value={freeformValue}
                onChange={(e) => setFreeformValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && freeformValue.trim()) {
                    handleRespond(freeformValue.trim() + "\n");
                  }
                }}
                placeholder="Type your response..."
                style={{
                  flex: 1, padding: "6px 10px", borderRadius: 6,
                  border: "1px solid var(--vp-border-subtle)",
                  background: "var(--vp-bg-primary)",
                  color: "var(--vp-text-primary)", fontSize: 12,
                  outline: "none",
                }}
              />
              <button
                onClick={() => freeformValue.trim() && handleRespond(freeformValue.trim() + "\n")}
                disabled={!freeformValue.trim()}
                style={{
                  padding: "6px 12px", borderRadius: 6,
                  border: "1px solid var(--vp-border-subtle)",
                  background: freeformValue.trim() ? "var(--vp-bg-surface-hover)" : "transparent",
                  color: "var(--vp-text-secondary)", fontSize: 12, cursor: "pointer",
                }}
              >
                Send
              </button>
            </div>
          )}

          {responseType === "choice" && (
            <div style={{ fontSize: 11, color: "var(--vp-text-dim)" }}>
              Choice prompts detected — review the terminal output and respond manually.
            </div>
          )}
        </>
      )}
    </div>
  );
}
