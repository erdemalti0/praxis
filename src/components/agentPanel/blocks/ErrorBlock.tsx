import { AlertCircle } from "lucide-react";

export default function ErrorBlock({ message }: { message: string }) {
  return (
    <div
      style={{
        borderRadius: 8,
        border: "1px solid var(--vp-accent-red-border, #ef4444)",
        background: "rgba(239, 68, 68, 0.08)",
        padding: "8px 12px",
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        fontSize: 13,
        color: "#ef4444",
      }}
    >
      <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{message}</span>
    </div>
  );
}
