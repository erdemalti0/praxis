import { useState, useMemo } from "react";
import { X, Download, Upload, Copy, Check, FileDown, FileUp, Sparkles, ExternalLink } from "lucide-react";
import { useMissionStore } from "../../stores/missionStore";
import { invoke } from "../../lib/ipc";
import type { MissionExportData } from "../../stores/missionStore";
import type { Mission } from "../../types/mission";

interface Props {
  open: boolean;
  onClose: () => void;
  missions: Mission[];
  projectPath: string;
  initialTab?: "export" | "import";
}

const AI_PROMPT = `Create a project plan/mission for me in the following JSON format.
Topic: [WRITE YOUR TOPIC HERE]

The JSON format should be as follows:
{
  "title": "Mission title — the main goal",
  "description": "Brief description of the overall mission",
  "steps": [
    {
      "title": "Phase/Step title",
      "description": "What this phase involves",
      "prompt": "Command to give to the AI agent for this step (optional)",
      "children": [
        {
          "title": "Sub-step title",
          "description": "Sub-step details",
          "prompt": "AI agent command (optional)",
          "children": []
        }
      ]
    }
  ]
}

Rules:
- Output a SINGLE mission object (not an array) with all phases as top-level steps
- Each step must have a title and description
- The prompt field is optional — if this step will be sent to an AI agent, write the command to give to the agent
- Use the children array to create sub-steps (hierarchical structure, can be nested multiple levels)
- Group related work into phases (top-level steps), with detailed sub-steps inside each phase
- Create detailed and actionable steps
- Return ONLY valid JSON, no extra text`;

function countSteps(steps: any[]): number {
  let count = 0;
  for (const s of steps) {
    count++;
    const sub = s.children || s.steps || [];
    if (sub.length) count += countSteps(sub);
  }
  return count;
}

function validateImportData(raw: string): { data: MissionExportData | null; error: string | null } {
  try {
    const parsed = JSON.parse(raw);

    // Support both { version, missions: [...] } and bare array [{ title, steps }]
    let missions: any[];
    if (Array.isArray(parsed)) {
      missions = parsed;
    } else if (parsed.missions && Array.isArray(parsed.missions)) {
      missions = parsed.missions;
    } else if (parsed.title && typeof parsed.title === "string") {
      // Single mission object
      missions = [parsed];
    } else {
      return { data: null, error: "Invalid format. Expected an object with a \"missions\" array." };
    }

    for (let i = 0; i < missions.length; i++) {
      const m = missions[i];
      if (!m.title || typeof m.title !== "string") {
        return { data: null, error: `Mission ${i + 1} is missing a valid "title" field.` };
      }
    }

    return {
      data: { version: 1, exportedAt: new Date().toISOString(), missions },
      error: null,
    };
  } catch {
    return { data: null, error: "Invalid JSON. Please check the format and try again." };
  }
}

export default function MissionExportImportDialog({ open, onClose, missions, projectPath, initialTab = "export" }: Props) {
  const [tab, setTab] = useState<"export" | "import">(initialTab);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(missions.map((m) => m.id)));
  const [importText, setImportText] = useState("");
  const [copiedExport, setCopiedExport] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const [mergeAsOne, setMergeAsOne] = useState(true);

  const exportMissions = useMissionStore((s) => s.exportMissions);
  const importMissions = useMissionStore((s) => s.importMissions);

  const exportJson = useMemo(() => {
    if (selectedIds.size === 0) return "";
    return JSON.stringify(exportMissions(Array.from(selectedIds)), null, 2);
  }, [selectedIds, exportMissions, missions]);

  const importPreview = useMemo(() => {
    if (!importText.trim()) return null;
    const { data, error } = validateImportData(importText);
    if (error) return { error, missions: [] };
    return {
      error: null,
      missions: data!.missions.map((m) => ({
        title: m.title,
        description: m.description || "",
        stepCount: countSteps(m.steps || []),
      })),
    };
  }, [importText]);

  if (!open) return null;

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCopyExport = async () => {
    await navigator.clipboard.writeText(exportJson);
    setCopiedExport(true);
    setTimeout(() => setCopiedExport(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([exportJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "missions-export.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyPrompt = async () => {
    await navigator.clipboard.writeText(AI_PROMPT);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  const handleLoadFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        setImportText(reader.result as string);
        setImportError(null);
        setImportSuccess(false);
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleImport = async () => {
    const { data, error } = validateImportData(importText);
    if (error || !data) {
      setImportError(error);
      return;
    }
    await importMissions(projectPath, data, mergeAsOne);
    setImportSuccess(true);
    setImportError(null);
    setTimeout(() => {
      onClose();
      setImportText("");
      setImportSuccess(false);
    }, 1000);
  };

  const tabStyle = (active: boolean) => ({
    padding: "8px 16px",
    fontSize: 12,
    fontWeight: 600 as const,
    cursor: "pointer" as const,
    background: active ? "var(--vp-accent-blue-bg)" : "transparent",
    border: active ? "1px solid var(--vp-accent-blue-border)" : "1px solid transparent",
    borderRadius: 8,
    color: active ? "var(--vp-accent-blue)" : "var(--vp-text-muted)",
    transition: "all 0.15s",
    display: "flex" as const,
    alignItems: "center" as const,
    gap: 6,
  });

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 300,
        background: "var(--vp-bg-overlay)", backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: 560, maxHeight: "80vh", background: "var(--vp-bg-secondary)",
        border: "1px solid var(--vp-border-light)", borderRadius: 16,
        boxShadow: "0 20px 60px rgba(0,0,0,0.6)", overflow: "hidden",
        display: "flex", flexDirection: "column",
      }}>
        {/* Header */}
        <div className="flex items-center justify-between" style={{
          padding: "16px 20px", borderBottom: "1px solid var(--vp-bg-surface-hover)",
          background: "var(--vp-bg-surface)", flexShrink: 0,
        }}>
          <div className="flex items-center gap-3">
            <button onClick={() => setTab("export")} style={tabStyle(tab === "export")}>
              <Download size={13} /> Export
            </button>
            <button onClick={() => setTab("import")} style={tabStyle(tab === "import")}>
              <Upload size={13} /> Import
            </button>
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
        <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
          {tab === "export" ? (
            <ExportTab
              missions={missions}
              selectedIds={selectedIds}
              toggleSelection={toggleSelection}
              exportJson={exportJson}
              copiedExport={copiedExport}
              onCopy={handleCopyExport}
              onDownload={handleDownload}
            />
          ) : (
            <ImportTab
              importText={importText}
              setImportText={(v) => { setImportText(v); setImportError(null); setImportSuccess(false); }}
              copiedPrompt={copiedPrompt}
              onCopyPrompt={handleCopyPrompt}
              onLoadFile={handleLoadFile}
              onImport={handleImport}
              importError={importError}
              importSuccess={importSuccess}
              preview={importPreview}
              mergeAsOne={mergeAsOne}
              setMergeAsOne={setMergeAsOne}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Export Tab ─── */
function ExportTab({
  missions, selectedIds, toggleSelection, exportJson, copiedExport, onCopy, onDownload,
}: {
  missions: Mission[];
  selectedIds: Set<string>;
  toggleSelection: (id: string) => void;
  exportJson: string;
  copiedExport: boolean;
  onCopy: () => void;
  onDownload: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Mission selection */}
      <div>
        <label style={{ fontSize: 10, fontWeight: 600, color: "var(--vp-text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, display: "block" }}>
          Select missions to export
        </label>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {missions.map((m) => (
            <label
              key={m.id}
              className="flex items-center gap-2"
              style={{
                padding: "8px 10px", borderRadius: 8, cursor: "pointer",
                background: selectedIds.has(m.id) ? "var(--vp-accent-blue-bg)" : "var(--vp-bg-surface)",
                border: selectedIds.has(m.id) ? "1px solid var(--vp-accent-blue-border)" : "1px solid var(--vp-border-light)",
                transition: "all 0.15s",
              }}
            >
              <input
                type="checkbox"
                checked={selectedIds.has(m.id)}
                onChange={() => toggleSelection(m.id)}
                style={{ accentColor: "var(--vp-accent-blue)" }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--vp-text-primary)" }}>{m.title}</div>
                {m.description && (
                  <div style={{ fontSize: 10, color: "var(--vp-text-subtle)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.description}
                  </div>
                )}
              </div>
              <span style={{ fontSize: 10, color: "var(--vp-text-faint)", flexShrink: 0 }}>
                {m.steps.length} steps
              </span>
            </label>
          ))}
          {missions.length === 0 && (
            <div style={{ padding: 16, textAlign: "center", color: "var(--vp-text-subtle)", fontSize: 11 }}>
              No missions to export
            </div>
          )}
        </div>
      </div>

      {/* JSON preview */}
      {selectedIds.size > 0 && (
        <>
          <label style={{ fontSize: 10, fontWeight: 600, color: "var(--vp-text-dim)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            JSON Output
          </label>
          <textarea
            readOnly
            value={exportJson}
            style={{
              width: "100%", height: 180, background: "var(--vp-bg-surface)",
              border: "1px solid var(--vp-border-light)", borderRadius: 10,
              padding: "10px 14px", color: "var(--vp-text-secondary)", fontSize: 11,
              fontFamily: "JetBrains Mono, monospace", outline: "none", resize: "vertical",
              lineHeight: 1.5,
            }}
          />
          <div className="flex gap-2 justify-end">
            <button onClick={onCopy} style={actionBtnStyle()}>
              {copiedExport ? <Check size={13} /> : <Copy size={13} />}
              {copiedExport ? "Copied!" : "Copy to Clipboard"}
            </button>
            <button onClick={onDownload} style={actionBtnStyle()}>
              <FileDown size={13} /> Download .json
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Import Tab ─── */
function ImportTab({
  importText, setImportText, copiedPrompt, onCopyPrompt, onLoadFile, onImport,
  importError, importSuccess, preview, mergeAsOne, setMergeAsOne,
}: {
  importText: string;
  setImportText: (v: string) => void;
  copiedPrompt: boolean;
  onCopyPrompt: () => void;
  onLoadFile: () => void;
  onImport: () => void;
  importError: string | null;
  importSuccess: boolean;
  preview: { error: string | null; missions: { title: string; description: string; stepCount: number }[] } | null;
  mergeAsOne: boolean;
  setMergeAsOne: (v: boolean) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* AI Prompt Section */}
      <div style={{
        background: "var(--vp-bg-surface)", borderRadius: 12,
        border: "1px solid var(--vp-border-light)", padding: 14,
      }}>
        <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
          <Sparkles size={14} style={{ color: "#a78bfa" }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--vp-text-primary)" }}>
            Generate with AI
          </span>
        </div>
        <p style={{ fontSize: 11, color: "var(--vp-text-muted)", lineHeight: 1.6, marginBottom: 10 }}>
          Use our custom GPT for best results, or copy the prompt below for any AI.
          Then paste the JSON response into the import area.
        </p>

        {/* GPT Link */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            invoke("open_popup_window", {
              url: "https://chatgpt.com/g/g-699095e80e20819191ca0811a54908c4-praxis-mission-planner",
              title: "Praxis Mission Planner GPT",
              width: 1000,
              height: 750,
            }).catch(() => {});
          }}
          style={{
            width: "100%", padding: "10px 14px", borderRadius: 10,
            background: "linear-gradient(135deg, rgba(16,163,127,0.08), rgba(16,163,127,0.15))",
            border: "1px solid rgba(16,163,127,0.25)",
            color: "#10a37f", fontSize: 12, fontWeight: 600,
            cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
            marginBottom: 10, transition: "all 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "linear-gradient(135deg, rgba(16,163,127,0.12), rgba(16,163,127,0.22))"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "linear-gradient(135deg, rgba(16,163,127,0.08), rgba(16,163,127,0.15))"; }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/>
          </svg>
          Open Praxis Mission Planner GPT
          <span style={{
            marginLeft: 4, padding: "2px 6px", borderRadius: 4,
            background: "rgba(16,163,127,0.2)", fontSize: 9, fontWeight: 700,
            letterSpacing: "0.04em",
          }}>
            RECOMMENDED
          </span>
          <ExternalLink size={12} style={{ marginLeft: "auto", opacity: 0.6 }} />
        </button>

        <div style={{ position: "relative" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8, marginBottom: 10,
          }}>
            <div style={{ flex: 1, height: 1, background: "var(--vp-border-light)" }} />
            <span style={{ fontSize: 9, color: "var(--vp-text-subtle)", textTransform: "uppercase", letterSpacing: "0.08em" }}>or copy prompt manually</span>
            <div style={{ flex: 1, height: 1, background: "var(--vp-border-light)" }} />
          </div>
        </div>

        <div style={{
          background: "var(--vp-bg-primary)", borderRadius: 8,
          border: "1px solid var(--vp-border-light)", padding: "10px 12px",
          maxHeight: 100, overflow: "auto",
        }}>
          <pre style={{
            fontSize: 10, color: "var(--vp-text-secondary)",
            fontFamily: "JetBrains Mono, monospace", whiteSpace: "pre-wrap",
            wordBreak: "break-word", margin: 0, lineHeight: 1.5,
          }}>
            {AI_PROMPT}
          </pre>
        </div>
        <div className="flex justify-end" style={{ marginTop: 8 }}>
          <button onClick={onCopyPrompt} style={actionBtnStyle()}>
            {copiedPrompt ? <Check size={13} /> : <Copy size={13} />}
            {copiedPrompt ? "Copied!" : "Copy Prompt"}
          </button>
        </div>
      </div>

      {/* Import JSON Section */}
      <div>
        <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 10, fontWeight: 600, color: "var(--vp-text-dim)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Paste JSON or load from file
          </label>
          <button onClick={onLoadFile} style={actionBtnStyle()}>
            <FileUp size={13} /> Load File
          </button>
        </div>
        <textarea
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder='Paste your mission JSON here...'
          style={{
            width: "100%", height: 150, background: "var(--vp-bg-surface)",
            border: `1px solid ${importError ? "rgba(239,68,68,0.4)" : "var(--vp-border-light)"}`,
            borderRadius: 10, padding: "10px 14px", color: "var(--vp-text-secondary)",
            fontSize: 11, fontFamily: "JetBrains Mono, monospace", outline: "none",
            resize: "vertical", lineHeight: 1.5, transition: "border-color 0.15s",
          }}
          onFocus={(e) => { if (!importError) e.currentTarget.style.borderColor = "var(--vp-accent-blue-border)"; }}
          onBlur={(e) => { if (!importError) e.currentTarget.style.borderColor = "var(--vp-border-light)"; }}
        />

        {/* Error */}
        {importError && (
          <div style={{
            marginTop: 8, padding: "8px 12px", borderRadius: 8,
            background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)",
            fontSize: 11, color: "#ef4444",
          }}>
            {importError}
          </div>
        )}

        {/* Preview */}
        {preview && !preview.error && preview.missions.length > 0 && (
          <div style={{
            marginTop: 8, padding: "10px 12px", borderRadius: 8,
            background: "var(--vp-accent-blue-bg)", border: "1px solid var(--vp-accent-blue-border)",
          }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: "var(--vp-text-dim)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Preview — {preview.missions.length} item{preview.missions.length > 1 ? "s" : ""}
              </span>
              {preview.missions.length > 1 && (
                <label className="flex items-center gap-2" style={{ cursor: "pointer" }}>
                  <span style={{ fontSize: 10, color: mergeAsOne ? "var(--vp-accent-blue)" : "var(--vp-text-muted)" }}>
                    Merge into single mission
                  </span>
                  <input
                    type="checkbox"
                    checked={mergeAsOne}
                    onChange={(e) => setMergeAsOne(e.target.checked)}
                    style={{ accentColor: "var(--vp-accent-blue)" }}
                  />
                </label>
              )}
            </div>
            {preview.missions.map((m, i) => (
              <div key={i} className="flex items-center justify-between" style={{ padding: "4px 0" }}>
                <div className="flex items-center gap-2">
                  {mergeAsOne && preview.missions.length > 1 && (
                    <span style={{ fontSize: 9, color: "var(--vp-text-faint)", fontStyle: "italic" }}>step</span>
                  )}
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--vp-text-primary)" }}>{m.title}</span>
                </div>
                <span style={{ fontSize: 10, color: "var(--vp-text-faint)" }}>
                  {m.stepCount} {mergeAsOne && preview.missions.length > 1 ? "sub-steps" : "steps"}
                </span>
              </div>
            ))}
            {mergeAsOne && preview.missions.length > 1 && (
              <div style={{ marginTop: 6, fontSize: 10, color: "var(--vp-text-subtle)", fontStyle: "italic" }}>
                All items will be imported as phases within a single mission
              </div>
            )}
          </div>
        )}

        {/* Success */}
        {importSuccess && (
          <div style={{
            marginTop: 8, padding: "8px 12px", borderRadius: 8,
            background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.15)",
            fontSize: 11, color: "#4ade80", fontWeight: 600,
          }}>
            Missions imported successfully!
          </div>
        )}

        {/* Import button */}
        {importText.trim() && !importSuccess && (
          <div className="flex justify-end" style={{ marginTop: 12 }}>
            <button
              onClick={onImport}
              disabled={!!importError || !preview || !!preview.error}
              style={{
                padding: "8px 20px", borderRadius: 9,
                background: (!importError && preview && !preview.error)
                  ? "var(--vp-accent-blue-bg)" : "var(--vp-bg-surface)",
                border: `1px solid ${(!importError && preview && !preview.error)
                  ? "var(--vp-accent-blue-border)" : "var(--vp-bg-surface-hover)"}`,
                color: (!importError && preview && !preview.error)
                  ? "var(--vp-accent-blue)" : "var(--vp-text-subtle)",
                fontSize: 12, fontWeight: 600,
                cursor: (!importError && preview && !preview.error) ? "pointer" : "not-allowed",
                display: "flex", alignItems: "center", gap: 6,
                transition: "all 0.15s",
              }}
            >
              <Upload size={13} /> Import Missions
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function actionBtnStyle() {
  return {
    padding: "6px 12px", borderRadius: 7,
    background: "var(--vp-bg-surface)", border: "1px solid var(--vp-border-light)",
    color: "var(--vp-text-muted)", fontSize: 11, cursor: "pointer" as const,
    display: "flex" as const, alignItems: "center" as const, gap: 5,
    transition: "all 0.15s",
  };
}
