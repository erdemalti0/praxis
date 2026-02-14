import { useEffect, useRef } from "react";
import { useConfirmStore } from "../../stores/confirmStore";

export default function ConfirmDialog() {
  const { isOpen, title, message, danger, onConfirm, hideConfirm } = useConfirmStore();
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        hideConfirm();
      } else if (e.key === "Enter") {
        e.preventDefault();
        onConfirm?.();
        hideConfirm();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onConfirm, hideConfirm]);

  useEffect(() => {
    if (isOpen && modalRef.current) {
      modalRef.current.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

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
      onClick={hideConfirm}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 400,
          width: "90%",
          background: "var(--vp-bg-surface)",
          borderRadius: 12,
          padding: 24,
          border: "1px solid var(--vp-border-panel)",
          outline: "none",
        }}
      >
        <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--vp-text-primary)", marginBottom: 8 }}>
          {title}
        </h3>
        <p style={{ fontSize: 12, color: "var(--vp-text-muted)", marginBottom: 20, lineHeight: 1.5 }}>
          {message}
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            onClick={hideConfirm}
            style={{
              padding: "6px 14px",
              fontSize: 12,
              borderRadius: 6,
              border: "1px solid var(--vp-border-medium)",
              background: "var(--vp-bg-surface-hover)",
              color: "var(--vp-text-primary)",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onConfirm?.();
              hideConfirm();
            }}
            style={{
              padding: "6px 14px",
              fontSize: 12,
              borderRadius: 6,
              border: "none",
              background: danger ? "var(--vp-accent-red)" : "var(--vp-accent-blue)",
              color: "#fff",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
