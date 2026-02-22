import { useState, useEffect } from "react";
import { X, Play, FolderOpen } from "lucide-react";
import { invoke } from "../../lib/ipc";
import type { RunConfig } from "../../types/runner";

const PRESETS = [
  { label: "npm run dev", command: "npm", args: ["run", "dev"] },
  { label: "npm run build", command: "npm", args: ["run", "build"] },
  { label: "npm start", command: "npm", args: ["start"] },
  { label: "yarn dev", command: "yarn", args: ["dev"] },
  { label: "pnpm dev", command: "pnpm", args: ["dev"] },
  { label: "bun dev", command: "bun", args: ["dev"] },
  { label: "python manage.py runserver", command: "python", args: ["manage.py", "runserver"] },
  { label: "flutter run", command: "flutter", args: ["run"] },
  { label: "go run .", command: "go", args: ["run", "."] },
  { label: "cargo run", command: "cargo", args: ["run"] },
  { label: "Custom", command: "", args: [] },
];

interface RunConfigDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (config: Omit<RunConfig, "id" | "createdAt" | "updatedAt">) => void;
  editConfig?: RunConfig | null;
  defaultCwd?: string;
}

export default function RunConfigDialog({ open, onClose, onSubmit, editConfig, defaultCwd = "~" }: RunConfigDialogProps) {
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [argsStr, setArgsStr] = useState("");
  const [cwd, setCwd] = useState(defaultCwd);
  const [envStr, setEnvStr] = useState("");
  const [autoRestart, setAutoRestart] = useState(false);

  useEffect(() => {
    if (editConfig) {
      setName(editConfig.name);
      setCommand(editConfig.command);
      setArgsStr(editConfig.args.join(" "));
      setCwd(editConfig.cwd);
      setEnvStr(
        editConfig.env
          ? Object.entries(editConfig.env).map(([k, v]) => `${k}=${v}`).join("\n")
          : ""
      );
      setAutoRestart(editConfig.autoRestart || false);
    } else {
      setName("");
      setCommand("");
      setArgsStr("");
      setCwd(defaultCwd);
      setEnvStr("");
      setAutoRestart(false);
    }
  }, [editConfig, open, defaultCwd]);

  if (!open) return null;

  const handlePreset = (preset: (typeof PRESETS)[number]) => {
    if (preset.command) {
      setCommand(preset.command);
      setArgsStr(preset.args.join(" "));
      if (!name) setName(preset.label);
    }
  };

  const handleBrowse = async () => {
    try {
      const result = await invoke<string | null>("open_directory_dialog");
      if (result) setCwd(result);
    } catch {}
  };

  const parseEnv = (): Record<string, string> | undefined => {
    if (!envStr.trim()) return undefined;
    const env: Record<string, string> = {};
    for (const line of envStr.split("\n")) {
      const idx = line.indexOf("=");
      if (idx > 0) {
        env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
      }
    }
    return Object.keys(env).length > 0 ? env : undefined;
  };

  const handleSubmit = () => {
    if (!name.trim() || !command.trim()) return;
    onSubmit({
      name: name.trim(),
      command: command.trim(),
      args: argsStr.trim() ? argsStr.trim().split(/\s+/) : [],
      cwd: cwd.trim() || defaultCwd,
      env: parseEnv(),
      autoRestart,
    });
    onClose();
  };

  const isValid = name.trim() && command.trim();

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
          width: 480, background: "var(--vp-bg-secondary)",
          border: "1px solid var(--vp-border-light)",
          borderRadius: "var(--vp-radius-4xl)", overflow: "hidden",
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
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
              width: 28, height: 28, borderRadius: "var(--vp-radius-lg)",
              background: "rgba(251,146,60,0.12)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Play size={14} style={{ color: "var(--vp-accent-orange)" }} />
            </div>
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--vp-text-primary)" }}>
              {editConfig ? "Edit Run Config" : "New Run Config"}
            </span>
          </div>
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
        <div style={{ padding: "20px", maxHeight: 480, overflowY: "auto" }}>
          {/* Presets */}
          {!editConfig && (
            <>
              <label style={{ fontSize: 10, fontWeight: 600, color: "var(--vp-text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, display: "block" }}>
                Quick Preset
              </label>
              <div className="flex flex-wrap gap-1" style={{ marginBottom: 16 }}>
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => handlePreset(p)}
                    style={{
                      padding: "4px 10px", borderRadius: "var(--vp-radius-md)",
                      background: "var(--vp-bg-surface)", border: "1px solid var(--vp-border-light)",
                      color: "var(--vp-text-muted)", fontSize: 11, cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(251,146,60,0.5)"; e.currentTarget.style.color = "var(--vp-accent-orange)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--vp-border-light)"; e.currentTarget.style.color = "var(--vp-text-muted)"; }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Name */}
          <label style={{ fontSize: 10, fontWeight: 600, color: "var(--vp-text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6, display: "block" }}>
            Name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Dev Server"
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) handleSubmit(); if (e.key === "Escape") onClose(); }}
            style={{
              width: "100%", background: "var(--vp-bg-surface)",
              border: "1px solid var(--vp-border-light)", borderRadius: "var(--vp-radius-xl)",
              padding: "10px 14px", color: "var(--vp-text-primary)", fontSize: 13,
              outline: "none", fontFamily: "inherit", marginBottom: 14,
              transition: "border-color 0.15s",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(251,146,60,0.5)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "var(--vp-border-light)"; }}
          />

          {/* Command */}
          <label style={{ fontSize: 10, fontWeight: 600, color: "var(--vp-text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6, display: "block" }}>
            Command
          </label>
          <input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="e.g. npm, flutter, python"
            style={{
              width: "100%", background: "var(--vp-bg-surface)",
              border: "1px solid var(--vp-border-light)", borderRadius: "var(--vp-radius-xl)",
              padding: "10px 14px", color: "var(--vp-text-primary)", fontSize: 13,
              outline: "none", fontFamily: "'JetBrains Mono', monospace", marginBottom: 14,
              transition: "border-color 0.15s",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(251,146,60,0.5)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "var(--vp-border-light)"; }}
          />

          {/* Args */}
          <label style={{ fontSize: 10, fontWeight: 600, color: "var(--vp-text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6, display: "block" }}>
            Arguments
          </label>
          <input
            value={argsStr}
            onChange={(e) => setArgsStr(e.target.value)}
            placeholder="e.g. run dev --port 3000"
            style={{
              width: "100%", background: "var(--vp-bg-surface)",
              border: "1px solid var(--vp-border-light)", borderRadius: "var(--vp-radius-xl)",
              padding: "10px 14px", color: "var(--vp-text-primary)", fontSize: 13,
              outline: "none", fontFamily: "'JetBrains Mono', monospace", marginBottom: 14,
              transition: "border-color 0.15s",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(251,146,60,0.5)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "var(--vp-border-light)"; }}
          />

          {/* Working Directory */}
          <label style={{ fontSize: 10, fontWeight: 600, color: "var(--vp-text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6, display: "block" }}>
            Working Directory
          </label>
          <div className="flex gap-2" style={{ marginBottom: 14 }}>
            <input
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
              placeholder={defaultCwd}
              style={{
                flex: 1, background: "var(--vp-bg-surface)",
                border: "1px solid var(--vp-border-light)", borderRadius: "var(--vp-radius-xl)",
                padding: "10px 14px", color: "var(--vp-text-primary)", fontSize: 13,
                outline: "none", fontFamily: "'JetBrains Mono', monospace",
                transition: "border-color 0.15s",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(251,146,60,0.5)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--vp-border-light)"; }}
            />
            <button
              onClick={handleBrowse}
              title="Browse"
              style={{
                width: 40, height: 40, borderRadius: "var(--vp-radius-xl)",
                background: "var(--vp-bg-surface)", border: "1px solid var(--vp-border-light)",
                color: "var(--vp-text-muted)", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.15s", flexShrink: 0,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--vp-border-medium)"; e.currentTarget.style.color = "var(--vp-text-primary)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--vp-border-light)"; e.currentTarget.style.color = "var(--vp-text-muted)"; }}
            >
              <FolderOpen size={14} />
            </button>
          </div>

          {/* Env vars */}
          <label style={{ fontSize: 10, fontWeight: 600, color: "var(--vp-text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6, display: "block" }}>
            Environment Variables <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(one per line: KEY=value)</span>
          </label>
          <textarea
            value={envStr}
            onChange={(e) => setEnvStr(e.target.value)}
            placeholder={"PORT=3000\nNODE_ENV=development"}
            rows={3}
            style={{
              width: "100%", background: "var(--vp-bg-surface)",
              border: "1px solid var(--vp-border-light)", borderRadius: "var(--vp-radius-xl)",
              padding: "10px 14px", color: "var(--vp-text-secondary)", fontSize: 12,
              outline: "none", fontFamily: "'JetBrains Mono', monospace", resize: "vertical",
              lineHeight: 1.5, marginBottom: 14,
              transition: "border-color 0.15s",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(251,146,60,0.5)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "var(--vp-border-light)"; }}
          />

          {/* Auto restart */}
          <label className="flex items-center gap-2" style={{ cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={autoRestart}
              onChange={(e) => setAutoRestart(e.target.checked)}
              style={{ accentColor: "var(--vp-accent-orange)" }}
            />
            <span style={{ fontSize: 12, color: "var(--vp-text-muted)" }}>
              Auto-restart on crash
            </span>
          </label>
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
            disabled={!isValid}
            style={{
              padding: "8px 18px", borderRadius: "var(--vp-radius-lg)",
              background: isValid ? "var(--vp-accent-orange-bg, rgba(251,146,60,0.12))" : "var(--vp-bg-surface)",
              border: `1px solid ${isValid ? "var(--vp-accent-orange-border, rgba(251,146,60,0.35))" : "var(--vp-bg-surface-hover)"}`,
              color: isValid ? "var(--vp-accent-orange)" : "var(--vp-text-subtle)",
              fontSize: 12, fontWeight: 600, cursor: isValid ? "pointer" : "not-allowed",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              if (isValid) e.currentTarget.style.background = "rgba(251,146,60,0.2)";
            }}
            onMouseLeave={(e) => {
              if (isValid) e.currentTarget.style.background = "rgba(251,146,60,0.12)";
            }}
          >
            {editConfig ? "Save Changes" : "Create Config"}
          </button>
        </div>
      </div>
    </div>
  );
}
