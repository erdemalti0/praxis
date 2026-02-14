import { Key, X, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { usePasswordStore } from "../../stores/passwordStore";

export function PasswordSavePrompt() {
  const savePrompt = usePasswordStore((s) => s.savePrompt);
  const confirmSavePrompt = usePasswordStore((s) => s.confirmSavePrompt);
  const declineSavePrompt = usePasswordStore((s) => s.declineSavePrompt);
  const [showPassword, setShowPassword] = useState(false);

  if (!savePrompt || !savePrompt.isOpen) return null;

  return (
    <div
      className="fixed inset-x-0 z-50 flex justify-center"
      style={{
        bottom: 20,
        padding: "0 20px",
      }}
    >
      <div
        style={{
          background: "var(--vp-bg-secondary)",
          border: "1px solid var(--vp-border-light)",
          borderRadius: 14,
          padding: "14px 18px",
          maxWidth: 420,
          width: "100%",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}
      >
        <div className="flex items-start gap-3">
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "rgba(34,197,94,0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Key size={18} style={{ color: "var(--vp-accent-green)" }} />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 4,
              }}
            >
              <span style={{ color: "var(--vp-text-primary)", fontSize: 13, fontWeight: 600 }}>
                Save Password?
              </span>
              <button
                onClick={declineSavePrompt}
                style={{
                  color: "var(--vp-text-faint)",
                  padding: 4,
                  borderRadius: 6,
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <X size={14} />
              </button>
            </div>

            <p style={{ color: "var(--vp-text-dim)", fontSize: 12, marginBottom: 10 }}>
              Save password for <span style={{ color: "var(--vp-text-muted)" }}>{savePrompt.domain}</span>?
            </p>

            <div
              style={{
                background: "var(--vp-bg-surface)",
                borderRadius: 8,
                padding: "10px 12px",
                marginBottom: 12,
              }}
            >
              <div className="flex items-center justify-between mb-1">
                <span style={{ color: "var(--vp-text-dim)", fontSize: 10 }}>Username</span>
              </div>
              <span style={{ color: "var(--vp-text-secondary)", fontSize: 12 }}>{savePrompt.username}</span>

              <div
                className="flex items-center justify-between mt-2"
                style={{ borderTop: "1px solid var(--vp-bg-surface-hover)", paddingTop: 8 }}
              >
                <span style={{ color: "var(--vp-text-dim)", fontSize: 10 }}>Password</span>
                <button
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    color: "var(--vp-text-faint)",
                    padding: 2,
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  {showPassword ? <EyeOff size={12} /> : <Eye size={12} />}
                </button>
              </div>
              <span style={{ color: "var(--vp-text-secondary)", fontSize: 12, fontFamily: "monospace" }}>
                {showPassword ? savePrompt.password : "••••••••••••"}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={declineSavePrompt}
                style={{
                  flex: 1,
                  padding: "9px 0",
                  background: "transparent",
                  border: "1px solid var(--vp-border-light)",
                  borderRadius: 8,
                  color: "var(--vp-text-muted)",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "var(--vp-text-primary)";
                  e.currentTarget.style.borderColor = "var(--vp-border-medium)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "var(--vp-text-muted)";
                  e.currentTarget.style.borderColor = "var(--vp-border-light)";
                }}
              >
                Never
              </button>
              <button
                onClick={declineSavePrompt}
                style={{
                  flex: 1,
                  padding: "9px 0",
                  background: "transparent",
                  border: "1px solid var(--vp-border-light)",
                  borderRadius: 8,
                  color: "var(--vp-text-muted)",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "var(--vp-text-primary)";
                  e.currentTarget.style.borderColor = "var(--vp-border-medium)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "var(--vp-text-muted)";
                  e.currentTarget.style.borderColor = "var(--vp-border-light)";
                }}
              >
                Not Now
              </button>
              <button
                onClick={confirmSavePrompt}
                style={{
                  flex: 1,
                  padding: "9px 0",
                  background: "var(--vp-accent-green)",
                  border: "none",
                  borderRadius: 8,
                  color: "var(--vp-button-primary-text)",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "opacity 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = "0.85";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = "1";
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PasswordAutofillPrompt() {
  const autofillPrompt = usePasswordStore((s) => s.autofillPrompt);
  const hideAutofillPrompt = usePasswordStore((s) => s.hideAutofillPrompt);
  const selectAutofillCredential = usePasswordStore((s) => s.selectAutofillCredential);

  if (!autofillPrompt || !autofillPrompt.isOpen) return null;

  return (
    <div
      className="fixed z-50"
      style={{
        top: 88,
        right: 20,
        width: 280,
      }}
    >
      <div
        style={{
          background: "var(--vp-bg-secondary)",
          border: "1px solid var(--vp-border-light)",
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}
      >
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: "1px solid var(--vp-bg-surface-hover)" }}
        >
          <span style={{ color: "var(--vp-text-muted)", fontSize: 11 }}>Use saved password?</span>
          <button
            onClick={hideAutofillPrompt}
            style={{
              color: "var(--vp-text-faint)",
              padding: 2,
              background: "transparent",
              border: "none",
              cursor: "pointer",
            }}
          >
            <X size={12} />
          </button>
        </div>

        <div style={{ maxHeight: 200, overflowY: "auto" }}>
          {autofillPrompt.credentials.map((cred) => (
            <button
              key={cred.id}
              onClick={async () => {
                const result = await selectAutofillCredential(cred);
                if (result) {
                  const event = new CustomEvent("praxis-autofill", {
                    detail: result,
                  });
                  window.dispatchEvent(event);
                }
              }}
              style={{
                width: "100%",
                padding: "10px 14px",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--vp-bg-surface-hover)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              <div style={{ color: "var(--vp-text-primary)", fontSize: 12, marginBottom: 2 }}>
                {cred.username}
              </div>
              <div style={{ color: "var(--vp-text-faint)", fontSize: 10 }}>
                {cred.domain}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
