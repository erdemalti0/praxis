import { useEffect, useState } from "react";
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from "lucide-react";
import { useToastStore } from "../../stores/toastStore";

const ICON_MAP = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const COLOR_MAP: Record<string, string> = {
  success: "var(--vp-accent-green)",
  error: "var(--vp-accent-red)",
  warning: "#f59e0b",
  info: "var(--vp-accent-blue)",
};

function ToastItem({ id, message, type }: { id: string; message: string; type: string }) {
  const removeToast = useToastStore((s) => s.removeToast);
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  const Icon = ICON_MAP[type as keyof typeof ICON_MAP] || Info;
  const color = COLOR_MAP[type] || COLOR_MAP.info;

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleClose = () => {
    setExiting(true);
    setTimeout(() => removeToast(id), 200);
  };

  return (
    <div
      style={{
        maxWidth: 350,
        background: "var(--vp-bg-surface)",
        borderLeft: `3px solid ${color}`,
        borderRadius: "var(--vp-radius-lg)",
        padding: "10px 12px",
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 12,
        color: "var(--vp-text-primary)",
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        transform: visible && !exiting ? "translateX(0)" : "translateX(100%)",
        opacity: visible && !exiting ? 1 : 0,
        transition: "transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease",
      }}
    >
      <Icon size={16} style={{ color, flexShrink: 0 }} />
      <span style={{ flex: 1 }}>{message}</span>
      <button
        onClick={handleClose}
        style={{
          background: "none",
          border: "none",
          color: "var(--vp-text-muted)",
          cursor: "pointer",
          padding: 2,
          display: "flex",
          flexShrink: 0,
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} id={t.id} message={t.message} type={t.type} />
      ))}
    </div>
  );
}
