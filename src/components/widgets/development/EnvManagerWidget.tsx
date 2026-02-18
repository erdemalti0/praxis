import { useEffect, useState, useCallback, useRef } from "react";
import { invoke } from "../../../lib/ipc";
import { useUIStore } from "../../../stores/uiStore";
import type { EnvManagerConfig } from "../../../types/widget";
import {
  Eye,
  EyeOff,
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
  FileWarning,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

const ENV_FILES = [
  ".env",
  ".env.local",
  ".env.example",
  ".env.development",
  ".env.production",
  ".env.test",
];

interface ParsedEnvFile {
  raw: string;
  lines: string[];
  vars: Array<{ key: string; value: string }>;
}

function parseEnvContent(raw: string): ParsedEnvFile {
  const lines = raw.split("\n");
  const vars: Array<{ key: string; value: string }> = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1).trim();
    if (key) vars.push({ key, value });
  }
  return { raw, lines, vars };
}

function rebuildContent(
  originalLines: string[],
  vars: Array<{ key: string; value: string }>,
  deletedKeys: Set<string>
): string {
  const varMap = new Map(vars.map((v) => [v.key, v.value]));
  const seenKeys = new Set<string>();
  const resultLines: string[] = [];

  for (const line of originalLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      resultLines.push(line);
      continue;
    }
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) {
      resultLines.push(line);
      continue;
    }
    const key = line.slice(0, eqIdx).trim();
    if (deletedKeys.has(key)) continue;
    seenKeys.add(key);
    const newValue = varMap.get(key);
    if (newValue !== undefined) {
      resultLines.push(`${key}=${newValue}`);
    } else {
      resultLines.push(line);
    }
  }

  // Append new variables not in original lines
  for (const v of vars) {
    if (!seenKeys.has(v.key) && !deletedKeys.has(v.key)) {
      resultLines.push(`${v.key}=${v.value}`);
    }
  }

  return resultLines.join("\n");
}

export default function EnvManagerWidget({
  widgetId: _widgetId,
  config = {},
}: {
  widgetId: string;
  config?: EnvManagerConfig;
}) {
  const projectPath = useUIStore((s) => s.selectedProject?.path) || "";

  const [envFiles, setEnvFiles] = useState<Map<string, ParsedEnvFile>>(
    new Map()
  );
  const [activeFile, setActiveFile] = useState<string>("");
  const [showValues, setShowValues] = useState<boolean>(
    config.showValues ?? false
  );
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [censored, setCensored] = useState(true);

  const loadFiles = useCallback(async () => {
    if (!projectPath) return;
    setLoading(true);
    const newMap = new Map<string, ParsedEnvFile>();

    for (const filename of ENV_FILES) {
      try {
        const content = await invoke<string>("read_file", {
          path: projectPath + "/" + filename,
        });
        if (content) {
          newMap.set(filename, parseEnvContent(content));
        }
      } catch {
        // File doesn't exist or can't be read — skip
      }
    }

    setEnvFiles(newMap);

    // Set default active file
    const preferred = config.activeFile || ".env";
    if (newMap.has(preferred)) {
      setActiveFile(preferred);
    } else {
      const first = newMap.keys().next().value;
      setActiveFile(first || "");
    }

    setLoading(false);
  }, [projectPath, config.activeFile]);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadFiles();

    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(loadFiles, config.refreshInterval ?? 15000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [loadFiles, config.refreshInterval]);

  const writeBack = useCallback(
    async (
      filename: string,
      vars: Array<{ key: string; value: string }>,
      originalLines: string[],
      deletedKeys: Set<string>
    ) => {
      const content = rebuildContent(originalLines, vars, deletedKeys);
      const filePath = projectPath + "/" + filename;
      await invoke("write_file", { path: filePath, content });
      // Reload
      const freshContent = await invoke<string>("read_file", { path: filePath });
      if (freshContent) {
        setEnvFiles((prev) => {
          const next = new Map(prev);
          next.set(filename, parseEnvContent(freshContent));
          return next;
        });
      }
    },
    [projectPath]
  );

  const handleEdit = (key: string, currentValue: string) => {
    setEditingKey(key);
    setEditValue(currentValue);
  };

  const handleSaveEdit = async () => {
    if (!editingKey || !activeFile) return;
    const file = envFiles.get(activeFile);
    if (!file) return;
    const updatedVars = file.vars.map((v) =>
      v.key === editingKey ? { ...v, value: editValue } : v
    );
    await writeBack(activeFile, updatedVars, file.lines, new Set());
    setEditingKey(null);
    setEditValue("");
  };

  const handleDelete = async (key: string) => {
    if (!activeFile) return;
    const file = envFiles.get(activeFile);
    if (!file) return;
    const updatedVars = file.vars.filter((v) => v.key !== key);
    await writeBack(activeFile, updatedVars, file.lines, new Set([key]));
  };

  const handleAdd = async () => {
    if (!newKey.trim() || !activeFile) return;
    const file = envFiles.get(activeFile);
    if (!file) return;
    const updatedVars = [...file.vars, { key: newKey.trim(), value: newValue }];
    await writeBack(activeFile, updatedVars, file.lines, new Set());
    setNewKey("");
    setNewValue("");
    setAdding(false);
  };

  const toggleKeyVisibility = (key: string) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const isKeyVisible = (key: string) => showValues || visibleKeys.has(key);

  // Determine missing keys from .env.example
  const exampleFile = envFiles.get(".env.example");
  const activeEnvFile = envFiles.get(activeFile);
  const missingKeys: string[] = [];
  if (
    exampleFile &&
    activeFile !== ".env.example" &&
    activeEnvFile
  ) {
    const activeKeys = new Set(activeEnvFile.vars.map((v) => v.key));
    for (const v of exampleFile.vars) {
      if (!activeKeys.has(v.key)) {
        missingKeys.push(v.key);
      }
    }
  }

  const foundFiles = Array.from(envFiles.keys());

  if (!projectPath) {
    return (
      <div
        className="h-full flex flex-col items-center justify-center gap-2"
        style={{ color: "var(--vp-text-dim)" }}
      >
        <FileWarning size={20} />
        <span style={{ fontSize: 12 }}>No project selected</span>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        className="h-full flex flex-col items-center justify-center gap-3"
        style={{ padding: 16 }}
      >
        {[80, 60, 70].map((w, i) => (
          <div
            key={i}
            style={{
              width: `${w}%`,
              height: 10,
              borderRadius: "var(--vp-radius-md)",
              background: "var(--vp-bg-surface-hover)",
              animation: "pulse 1.5s ease-in-out infinite",
              animationDelay: `${i * 0.2}s`,
            }}
          />
        ))}
        <style>{`@keyframes pulse { 0%,100% { opacity: 0.3; } 50% { opacity: 0.7; } }`}</style>
      </div>
    );
  }

  if (foundFiles.length === 0) {
    return (
      <div
        className="h-full flex flex-col items-center justify-center gap-2"
        style={{ color: "var(--vp-text-dim)" }}
      >
        <FileWarning size={20} />
        <span style={{ fontSize: 12 }}>No .env files found</span>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" style={{ position: "relative" }}>
      {/* Censor banner */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "5px 8px",
          background: censored
            ? "rgba(248,113,113,0.1)"
            : "rgba(74,222,128,0.1)",
          borderBottom: censored
            ? "1px solid rgba(248,113,113,0.2)"
            : "1px solid rgba(74,222,128,0.2)",
          fontSize: 10,
          color: censored
            ? "var(--vp-accent-red-text)"
            : "var(--vp-accent-green)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {censored ? <ShieldAlert size={12} /> : <ShieldCheck size={12} />}
          <span style={{ fontWeight: 500 }}>
            {censored ? "Content hidden — sensitive data" : "Content visible"}
          </span>
        </div>
        <button
          onClick={() => setCensored(!censored)}
          style={{
            padding: "2px 8px",
            fontSize: 9,
            fontWeight: 600,
            borderRadius: "var(--vp-radius-sm)",
            border: "1px solid",
            borderColor: censored
              ? "var(--vp-accent-red-text)"
              : "var(--vp-accent-green)",
            background: censored
              ? "rgba(248,113,113,0.15)"
              : "rgba(74,222,128,0.15)",
            color: censored
              ? "var(--vp-accent-red-text)"
              : "var(--vp-accent-green)",
            cursor: "pointer",
          }}
        >
          {censored ? "Show" : "Hide"}
        </button>
      </div>

      {/* Censor overlay */}
      {censored && (
        <div
          style={{
            position: "absolute",
            top: 30,
            left: 0,
            right: 0,
            bottom: 0,
            background: "var(--vp-bg-base, #1a1a2e)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            zIndex: 10,
          }}
        >
          <ShieldAlert size={28} style={{ opacity: 0.3, color: "var(--vp-text-faint)" }} />
          <span style={{ fontSize: 12, color: "var(--vp-text-faint)" }}>
            Environment variables are hidden
          </span>
          <button
            onClick={() => setCensored(false)}
            style={{
              padding: "4px 14px",
              fontSize: 11,
              borderRadius: "var(--vp-radius-md)",
              border: "1px solid var(--vp-border-light)",
              background: "var(--vp-bg-surface)",
              color: "var(--vp-text-secondary)",
              cursor: "pointer",
            }}
          >
            Reveal content
          </button>
        </div>
      )}

      {/* Tab bar */}
      <div
        className="flex gap-1 flex-wrap"
        style={{
          padding: "6px 8px",
          borderBottom: "1px solid var(--vp-bg-surface-hover)",
        }}
      >
        {foundFiles.map((filename) => {
          const isActive = filename === activeFile;
          return (
            <button
              key={filename}
              onClick={() => setActiveFile(filename)}
              style={{
                padding: "3px 8px",
                fontSize: 10,
                borderRadius: "var(--vp-radius-xl)",
                border: isActive
                  ? "1px solid var(--vp-accent-blue)"
                  : "1px solid var(--vp-border-light)",
                background: isActive
                  ? "rgba(96,165,250,0.15)"
                  : "var(--vp-bg-surface)",
                color: isActive
                  ? "var(--vp-accent-blue)"
                  : "var(--vp-text-muted)",
                cursor: "pointer",
                fontWeight: isActive ? 600 : 400,
              }}
            >
              {filename}
            </button>
          );
        })}
      </div>

      {/* Toolbar row */}
      <div
        className="flex items-center justify-between"
        style={{
          padding: "4px 8px",
          borderBottom: "1px solid var(--vp-bg-surface)",
        }}
      >
        <button
          onClick={() => setShowValues(!showValues)}
          style={{
            background: "none",
            border: "none",
            color: showValues
              ? "var(--vp-accent-blue)"
              : "var(--vp-text-faint)",
            cursor: "pointer",
            padding: 4,
            borderRadius: "var(--vp-radius-sm)",
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 10,
          }}
          title={showValues ? "Hide all values" : "Show all values"}
        >
          {showValues ? <Eye size={13} /> : <EyeOff size={13} />}
          <span>{showValues ? "Hide values" : "Show values"}</span>
        </button>
        <button
          onClick={() => {
            setAdding(true);
            setNewKey("");
            setNewValue("");
          }}
          style={{
            padding: "3px 8px",
            fontSize: 10,
            borderRadius: "var(--vp-radius-sm)",
            background: "var(--vp-bg-surface)",
            border: "1px solid var(--vp-border-light)",
            color: "var(--vp-text-secondary)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <Plus size={10} />
          Add Variable
        </button>
      </div>

      {/* Missing keys warning */}
      {missingKeys.length > 0 && (
        <div
          style={{
            padding: "5px 8px",
            background: "rgba(251,191,36,0.1)",
            borderBottom: "1px solid rgba(251,191,36,0.2)",
            fontSize: 10,
            color: "var(--vp-accent-amber)",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <FileWarning size={12} />
          <span>
            Missing from .env.example:{" "}
            <strong>{missingKeys.join(", ")}</strong>
          </span>
        </div>
      )}

      {/* Add form */}
      {adding && (
        <div
          style={{
            padding: "6px 8px",
            borderBottom: "1px solid var(--vp-bg-surface-hover)",
            display: "flex",
            gap: 4,
            alignItems: "center",
          }}
        >
          <input
            type="text"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="KEY"
            style={{
              flex: 1,
              background: "var(--vp-bg-surface-hover)",
              border: "1px solid var(--vp-border-light)",
              borderRadius: "var(--vp-radius-sm)",
              padding: "4px 6px",
              fontSize: 11,
              fontFamily: "monospace",
              color: "var(--vp-text-primary)",
              outline: "none",
            }}
          />
          <input
            type="text"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder="value"
            onKeyDown={(e) => {
              if (e.key === "Enter" && newKey.trim()) handleAdd();
            }}
            style={{
              flex: 2,
              background: "var(--vp-bg-surface-hover)",
              border: "1px solid var(--vp-border-light)",
              borderRadius: "var(--vp-radius-sm)",
              padding: "4px 6px",
              fontSize: 11,
              fontFamily: "monospace",
              color: "var(--vp-text-primary)",
              outline: "none",
            }}
          />
          <button
            onClick={handleAdd}
            disabled={!newKey.trim()}
            style={{
              padding: "4px 8px",
              fontSize: 10,
              borderRadius: "var(--vp-radius-sm)",
              background: "var(--vp-accent-green)",
              border: "none",
              color: "#fff",
              cursor: !newKey.trim() ? "not-allowed" : "pointer",
              opacity: !newKey.trim() ? 0.5 : 1,
            }}
          >
            <Check size={10} />
          </button>
          <button
            onClick={() => setAdding(false)}
            style={{
              padding: "4px 6px",
              fontSize: 10,
              borderRadius: "var(--vp-radius-sm)",
              background: "var(--vp-bg-surface-hover)",
              border: "none",
              color: "var(--vp-text-dim)",
              cursor: "pointer",
            }}
          >
            <X size={10} />
          </button>
        </div>
      )}

      {/* Variable list */}
      <div className="flex-1 overflow-auto" style={{ padding: "4px 0" }}>
        {activeEnvFile && activeEnvFile.vars.length > 0 ? (
          activeEnvFile.vars.map((v) => {
            const isEditing = editingKey === v.key;
            return (
              <div
                key={v.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 8px",
                  borderBottom: "1px solid var(--vp-bg-surface)",
                  fontSize: 11,
                }}
              >
                {/* Key */}
                <span
                  style={{
                    fontFamily: "monospace",
                    fontWeight: 600,
                    fontSize: 11,
                    color: "var(--vp-text-primary)",
                    minWidth: 80,
                    flexShrink: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={v.key}
                >
                  {v.key}
                </span>

                {/* Value */}
                {isEditing ? (
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveEdit();
                      if (e.key === "Escape") {
                        setEditingKey(null);
                        setEditValue("");
                      }
                    }}
                    autoFocus
                    style={{
                      flex: 1,
                      background: "var(--vp-bg-surface-hover)",
                      border: "1px solid var(--vp-accent-blue)",
                      borderRadius: "var(--vp-radius-xs)",
                      padding: "2px 6px",
                      fontSize: 11,
                      fontFamily: "monospace",
                      color: "var(--vp-text-primary)",
                      outline: "none",
                    }}
                  />
                ) : (
                  <span
                    style={{
                      flex: 1,
                      fontFamily: "monospace",
                      fontSize: 11,
                      color: "var(--vp-text-secondary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={isKeyVisible(v.key) ? v.value : undefined}
                  >
                    {isKeyVisible(v.key) ? v.value : "\u2022\u2022\u2022\u2022\u2022\u2022"}
                  </span>
                )}

                {/* Actions */}
                <div
                  className="flex items-center gap-1"
                  style={{ flexShrink: 0 }}
                >
                  {/* Per-key visibility toggle */}
                  {!showValues && (
                    <button
                      onClick={() => toggleKeyVisibility(v.key)}
                      style={{
                        background: "none",
                        border: "none",
                        color: visibleKeys.has(v.key)
                          ? "var(--vp-accent-blue)"
                          : "var(--vp-text-faint)",
                        cursor: "pointer",
                        padding: 2,
                      }}
                      title={
                        visibleKeys.has(v.key) ? "Hide value" : "Show value"
                      }
                    >
                      {visibleKeys.has(v.key) ? (
                        <Eye size={11} />
                      ) : (
                        <EyeOff size={11} />
                      )}
                    </button>
                  )}

                  {isEditing ? (
                    <>
                      <button
                        onClick={handleSaveEdit}
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--vp-accent-green)",
                          cursor: "pointer",
                          padding: 2,
                        }}
                        title="Save"
                      >
                        <Check size={11} />
                      </button>
                      <button
                        onClick={() => {
                          setEditingKey(null);
                          setEditValue("");
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--vp-text-faint)",
                          cursor: "pointer",
                          padding: 2,
                        }}
                        title="Cancel"
                      >
                        <X size={11} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => handleEdit(v.key, v.value)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--vp-text-faint)",
                          cursor: "pointer",
                          padding: 2,
                        }}
                        title="Edit"
                      >
                        <Pencil size={11} />
                      </button>
                      <button
                        onClick={() => handleDelete(v.key)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--vp-accent-red-text)",
                          cursor: "pointer",
                          padding: 2,
                        }}
                        title="Delete"
                      >
                        <Trash2 size={11} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div
            style={{
              color: "var(--vp-text-faint)",
              fontSize: 12,
              textAlign: "center",
              marginTop: 20,
            }}
          >
            No variables in this file
          </div>
        )}
      </div>
    </div>
  );
}
