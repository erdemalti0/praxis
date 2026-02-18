import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Download, Upload, Copy, Check, FileDown, FileUp, Sparkles } from "lucide-react";
import { useMissionStore } from "../../stores/missionStore";
import { useUIStore } from "../../stores/uiStore";
import { useTerminalStore } from "../../stores/terminalStore";
import { send } from "../../lib/ipc";
import { getSessionIds } from "../../lib/layout/layoutUtils";
import AgentPicker from "./AgentPicker";
import { composeMissionPlannerPrompt } from "../../lib/mission/missionPlannerSkill";

import type { MissionExportData } from "../../stores/missionStore";
import type { Mission } from "../../types/mission";

interface Props {
  open: boolean;
  onClose: () => void;
  missions: Mission[];
  projectPath: string;
  initialTab?: "export" | "import";
}


function countSteps(steps: any[]): number {
  let count = 0;
  for (const s of steps) {
    count++;
    const sub = s.children || s.steps || [];
    if (sub.length) count += countSteps(sub);
  }
  return count;
}

/**
 * Normalize a step object from common AI format variations to the expected format.
 * Handles: name→title, phases→steps→children, missing fields, etc.
 */
function normalizeStep(raw: any): any {
  if (!raw || typeof raw !== "object") return raw;

  const step: any = {};

  // title: accept "name" or "title"
  step.title = raw.title || raw.name || "";

  // description: default to empty string if missing
  step.description = raw.description || raw.desc || "";

  // prompt: keep as-is or default to empty
  step.prompt = raw.prompt ?? "";

  // status: keep if present
  if (raw.status) step.status = raw.status;

  // dependsOn: accept "dependsOn", "depends_on", "dependencies"
  step.dependsOn = raw.dependsOn || raw.depends_on || raw.dependencies || [];

  // children: accept "children", "steps", "substeps", "sub_steps", "phases"
  const rawChildren = raw.children || raw.steps || raw.substeps || raw.sub_steps || raw.phases || [];
  step.children = Array.isArray(rawChildren)
    ? rawChildren.map((c: any) => normalizeStep(c))
    : [];

  // If this step has children, force prompt to empty (parent coordination only)
  // but only if prompt looks auto-generated or missing
  if (step.children.length > 0 && !step.prompt) {
    step.prompt = "";
  }

  return step;
}

/**
 * Normalize an entire mission object from various AI output formats.
 * Handles: { mission: { ... } } wrapper, name→title, phases→steps, etc.
 */
function normalizeMission(raw: any): any {
  if (!raw || typeof raw !== "object") return raw;

  // Unwrap { mission: { ... } } wrapper
  const obj = raw.mission && typeof raw.mission === "object" ? raw.mission : raw;

  const mission: any = {};

  // title: accept "name" or "title"
  mission.title = obj.title || obj.name || "";

  // description: default to empty string if missing
  mission.description = obj.description || obj.desc || obj.overview || "";

  // steps: accept "steps", "phases", "children"
  const rawSteps = obj.steps || obj.phases || obj.children || [];
  mission.steps = Array.isArray(rawSteps)
    ? rawSteps.map((s: any) => normalizeStep(s))
    : [];

  return mission;
}

/**
 * Strip markdown code fences and surrounding text to extract raw JSON.
 * Handles: ```json ... ```, ``` ... ```, text before/after JSON, etc.
 */
function extractJson(raw: string): string {
  let text = raw.trim();

  // Strip markdown code fences: ```json ... ``` or ``` ... ```
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }

  // If there's non-JSON text around the JSON, try to extract the outermost { } or [ ]
  if (text.length > 0) {
    const firstBrace = text.indexOf("{");
    const firstBracket = text.indexOf("[");
    let start = -1;
    let endChar = "";

    if (firstBrace >= 0 && (firstBracket < 0 || firstBrace < firstBracket)) {
      start = firstBrace;
      endChar = "}";
    } else if (firstBracket >= 0) {
      start = firstBracket;
      endChar = "]";
    }

    if (start > 0) {
      // There's text before the JSON — strip it
      const end = text.lastIndexOf(endChar);
      if (end > start) {
        text = text.slice(start, end + 1);
      }
    }
  }

  return text;
}

/**
 * Attempt to repair common JSON issues produced by AI models.
 *
 * Fixes (in order):
 * 1. Smart/curly quotes → ASCII quotes
 * 2. Trailing commas before } or ]
 * 3. Unescaped double quotes inside string values (most common AI issue)
 * 4. Literal newlines/tabs/control chars inside string values
 *
 * Uses a character-by-character state machine with depth tracking to
 * distinguish structural JSON quotes from embedded unescaped quotes.
 * Tracks {} and [] nesting depth outside strings to make smarter decisions
 * about whether a " followed by } is a closing quote + structural brace,
 * or an embedded quote followed by string content that looks like }.
 */
function repairJson(text: string): string {
  // Step 1: Replace smart/curly quotes with ASCII equivalents
  text = text
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'");

  // Step 2: Remove trailing commas before } or ]
  text = text.replace(/,(\s*[}\]])/g, "$1");

  // Step 3: State machine with depth tracking
  const out: string[] = [];
  let inStr = false;
  let depth = 0; // tracks {} [] nesting outside of strings
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (!inStr) {
      out.push(ch);
      if (ch === '"') inStr = true;
      else if (ch === "{" || ch === "[") depth++;
      else if (ch === "}" || ch === "]") depth--;
      i++;
      continue;
    }

    // --- Inside a JSON string value ---

    // Escape sequences: preserve both chars
    if (ch === "\\" && i + 1 < text.length) {
      out.push(ch, text[i + 1]);
      i += 2;
      continue;
    }

    // Literal control characters inside strings → escape them
    if (ch === "\n") { out.push("\\n"); i++; continue; }
    if (ch === "\r") { out.push("\\r"); i++; continue; }
    if (ch === "\t") { out.push("\\t"); i++; continue; }

    if (ch === '"') {
      // Is this the closing quote of the string, or an embedded unescaped quote?
      const after = text.slice(i + 1).trimStart();
      const next = after[0] || "";

      // Simple structural chars: , or : → definitely end of string
      if (next === "" || next === "," || next === ":") {
        out.push('"');
        inStr = false;
        i++;
        continue;
      }

      // } or ] → need depth-aware analysis
      if (next === "}" || next === "]") {
        // Count consecutive closing brackets after this quote
        let j = 0;
        let closings = 0;
        while (j < after.length) {
          const c = after[j];
          if (c === "}" || c === "]") { closings++; j++; }
          else if (c === " " || c === "\t" || c === "\n" || c === "\r") { j++; }
          else break;
        }

        // What follows after all closing brackets?
        const rest = after.slice(j).trimStart();
        const nextAfter = rest[0] || "";

        // Structural end: closings don't exceed current depth, and what follows
        // is end-of-input, a comma, or more closing brackets
        if (
          closings <= depth &&
          (nextAfter === "" || nextAfter === "," || nextAfter === "}" || nextAfter === "]")
        ) {
          out.push('"');
          inStr = false;
          i++;
          continue;
        }

        // Otherwise: the } or ] is likely part of string content (e.g. {error: "msg"})
        out.push('\\"');
        i++;
        continue;
      }

      // Any other character → embedded unescaped quote
      out.push('\\"');
      i++;
      continue;
    }

    out.push(ch);
    i++;
  }

  return out.join("");
}

/**
 * Validate a step object recursively and collect specific errors.
 */
function validateStep(step: any, path: string, errors: string[]): void {
  if (!step || typeof step !== "object") {
    errors.push(`${path}: must be an object`);
    return;
  }
  if (!step.title || typeof step.title !== "string") {
    errors.push(`${path}: missing "title" (string)`);
  }
  if (step.description !== undefined && typeof step.description !== "string") {
    errors.push(`${path} "${step.title || "?"}": "description" must be a string`);
  }
  if (step.prompt !== undefined && step.prompt !== "" && typeof step.prompt !== "string") {
    errors.push(`${path} "${step.title || "?"}": "prompt" must be a string`);
  }
  if (step.dependsOn !== undefined && !Array.isArray(step.dependsOn)) {
    errors.push(`${path} "${step.title || "?"}": "dependsOn" must be an array of strings`);
  }

  // Check children (already normalized by normalizeStep)
  const children = step.children;
  if (children !== undefined) {
    if (!Array.isArray(children)) {
      errors.push(`${path} "${step.title || "?"}": "children" must be an array`);
    } else {
      for (let i = 0; i < children.length; i++) {
        validateStep(children[i], `${path} > child ${i + 1}`, errors);
      }
    }
  }
}

function validateImportData(raw: string): { data: MissionExportData | null; error: string | null; warnings: string[] } {
  const warnings: string[] = [];

  // Step 1: Extract JSON from potential markdown/text wrapping
  const cleaned = extractJson(raw);

  if (!cleaned) {
    return { data: null, error: "Empty input. Paste the JSON output from the AI.", warnings };
  }

  // Step 2: Parse JSON (with automatic repair fallback)
  let parsed: any;
  let repaired = false;
  try {
    parsed = JSON.parse(cleaned);
  } catch (firstError) {
    // JSON.parse failed — try to repair common AI issues (unescaped quotes, etc.)
    try {
      const fixed = repairJson(cleaned);
      parsed = JSON.parse(fixed);
      repaired = true;
    } catch {
      // Repair didn't help — show a helpful error
      const msg = firstError instanceof SyntaxError ? firstError.message : "Unknown parse error";
      const posMatch = msg.match(/position\s+(\d+)/i);
      let hint = "Invalid JSON — the AI likely used unescaped double quotes inside text fields.";
      hint += "\n\nAsk the AI to regenerate with this instruction: 'Regenerate the plan. CRITICAL: never use double quotes inside string values — use single quotes instead.'";
      if (posMatch) {
        const pos = parseInt(posMatch[1]);
        const snippet = cleaned.slice(Math.max(0, pos - 30), pos + 30);
        hint += `\n\nError near: ...${snippet}...`;
      }
      if (raw.includes("```")) {
        hint += "\n\nNote: Markdown code fences were stripped automatically.";
      }
      return { data: null, error: hint, warnings };
    }
  }

  if (repaired) {
    warnings.push("Auto-repaired JSON issues (unescaped quotes or trailing commas). The AI output had syntax errors that were fixed automatically.");
  }

  // Step 3: Determine format and normalize to missions array
  let missions: any[];
  let normalized = false;

  if (Array.isArray(parsed)) {
    // Array of missions — normalize each
    missions = parsed.map((m: any) => normalizeMission(m));
    if (missions.length === 0) {
      return { data: null, error: "The array is empty. It must contain at least one mission object.", warnings };
    }
    // Check if normalization changed anything
    if (parsed.some((m: any) => m.name || m.phases || m.mission)) normalized = true;
  } else if (typeof parsed === "object" && parsed !== null) {
    if (parsed.missions && Array.isArray(parsed.missions)) {
      // Praxis export format: { version, missions: [...] }
      missions = parsed.missions.map((m: any) => normalizeMission(m));
      if (parsed.missions.some((m: any) => m.name || m.phases)) normalized = true;
    } else if (parsed.mission && typeof parsed.mission === "object") {
      // Wrapped format: { mission: { ... } }
      missions = [normalizeMission(parsed)];
      normalized = true;
    } else if (parsed.title || parsed.name) {
      // Single mission object — normalize it
      const norm = normalizeMission(parsed);
      if (norm.steps.length === 0 && !parsed.steps && !parsed.children && !parsed.phases) {
        return {
          data: null,
          error: `Found a mission title ("${norm.title}") but no "steps" array. Each mission must have a "steps" array containing the plan phases.`,
          warnings,
        };
      }
      missions = [norm];
      if (parsed.name || parsed.phases) normalized = true;
    } else {
      // Try normalizing anyway — might have "mission" wrapper or other variation
      const norm = normalizeMission(parsed);
      if (norm.title && norm.steps.length > 0) {
        missions = [norm];
        normalized = true;
      } else {
        const keys = Object.keys(parsed).slice(0, 5).join(", ");
        return {
          data: null,
          error: `Unrecognized format. Expected a mission object with "title" and "steps" fields.\n\nFound keys: ${keys}`,
          warnings,
        };
      }
    }
  } else {
    return { data: null, error: "Expected a JSON object or array, got: " + typeof parsed, warnings };
  }

  if (normalized) {
    warnings.push("Auto-corrected field names (e.g. name→title, phases→steps). The AI output used a non-standard format but was successfully converted.");
  }

  // Step 4: Validate each mission deeply (data is already normalized at this point)
  const errors: string[] = [];

  for (let i = 0; i < missions.length; i++) {
    const m = missions[i];
    const label = missions.length > 1 ? `Mission ${i + 1}` : "Mission";

    if (!m.title || typeof m.title !== "string") {
      errors.push(`${label}: missing "title" field (required string)`);
      continue;
    }

    if (!m.steps || !Array.isArray(m.steps)) {
      errors.push(`${label} "${m.title}": missing "steps" array — the mission must have phases/steps`);
      continue;
    }

    if (m.steps.length === 0) {
      warnings.push(`${label} "${m.title}": has 0 steps — the mission is empty`);
    }

    // Validate each top-level step
    for (let j = 0; j < m.steps.length; j++) {
      validateStep(m.steps[j], `${label} > Step ${j + 1}`, errors);
    }
  }

  if (errors.length > 0) {
    const maxShow = 5;
    let msg = errors.slice(0, maxShow).join("\n");
    if (errors.length > maxShow) {
      msg += `\n\n...and ${errors.length - maxShow} more issue(s)`;
    }
    return { data: null, error: msg, warnings };
  }

  return {
    data: { version: 1, exportedAt: new Date().toISOString(), missions },
    error: null,
    warnings,
  };
}

export default function MissionExportImportDialog({ open, onClose, missions, projectPath, initialTab = "export" }: Props) {
  const [tab, setTab] = useState<"export" | "import">(initialTab);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(missions.map((m) => m.id)));
  const [importText, setImportText] = useState("");
  const [copiedExport, setCopiedExport] = useState(false);
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
    const { data, error, warnings } = validateImportData(importText);
    if (error) return { error, warnings, missions: [] };
    return {
      error: null,
      warnings,
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
    borderRadius: "var(--vp-radius-lg)",
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
        border: "1px solid var(--vp-border-light)", borderRadius: "var(--vp-radius-4xl)",
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
              onLoadFile={handleLoadFile}
              onImport={handleImport}
              importError={importError}
              importSuccess={importSuccess}
              preview={importPreview}
              mergeAsOne={mergeAsOne}
              setMergeAsOne={setMergeAsOne}
              onClose={onClose}
              projectPath={projectPath}
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
                padding: "8px 10px", borderRadius: "var(--vp-radius-lg)", cursor: "pointer",
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
              border: "1px solid var(--vp-border-light)", borderRadius: "var(--vp-radius-xl)",
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
  importText, setImportText, onLoadFile, onImport,
  importError, importSuccess, preview, mergeAsOne, setMergeAsOne,
  onClose, projectPath: _projectPath /* reserved for future use */,
}: {
  importText: string;
  setImportText: (v: string) => void;
  onLoadFile: () => void;
  onImport: () => void;
  importError: string | null;
  importSuccess: boolean;
  preview: { error: string | null; warnings: string[]; missions: { title: string; description: string; stepCount: number }[] } | null;
  mergeAsOne: boolean;
  setMergeAsOne: (v: boolean) => void;
  onClose: () => void;
  projectPath: string;
}) {
  const [aiDescription, setAiDescription] = useState("");
  const [showAgentPicker, setShowAgentPicker] = useState(false);
  const generateBtnRef = useRef<HTMLButtonElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number } | null>(null);

  // Click-outside to close agent picker
  useEffect(() => {
    if (!showAgentPicker) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowAgentPicker(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showAgentPicker]);

  const handleSendToAgent = useCallback(
    (sessionId: string, workspaceId: string) => {
      const fullPrompt = composeMissionPlannerPrompt(aiDescription.trim());
      send("write_pty", { id: sessionId, data: fullPrompt + "\n" });

      // Navigate UI to terminal view
      const ui = useUIStore.getState();
      const ts = useTerminalStore.getState();
      if (ui.activeWorkspaceId !== workspaceId) ui.setActiveWorkspaceId(workspaceId);
      const vm = ui.viewMode;
      if (vm !== "terminal" && vm !== "split") ui.setViewMode("terminal");
      const groups = ui.terminalGroups[workspaceId] || [];
      for (const gid of groups) {
        const layout = ui.workspaceLayouts[gid];
        if (layout && getSessionIds(layout).includes(sessionId)) {
          ui.setActiveTerminalGroup(workspaceId, gid);
          break;
        }
      }
      ui.setFocusedPane(sessionId);
      ts.setActiveSession(sessionId);

      setShowAgentPicker(false);
      onClose();
    },
    [aiDescription, onClose]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* AI Generation Section */}
      <div style={{
        background: "var(--vp-bg-surface)", borderRadius: "var(--vp-radius-2xl)",
        border: "1px solid var(--vp-border-light)", padding: 14,
      }}>
        <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
          <Sparkles size={14} style={{ color: "#a78bfa" }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--vp-text-primary)" }}>
            Generate with AI
          </span>
        </div>
        <p style={{ fontSize: 11, color: "var(--vp-text-muted)", lineHeight: 1.6, marginBottom: 10 }}>
          Describe what you want to build. Your AI agent will generate a structured mission plan
          using its knowledge of this project.
        </p>

        <textarea
          value={aiDescription}
          onChange={(e) => setAiDescription(e.target.value)}
          placeholder="e.g., Add JWT authentication with login, registration, and protected routes"
          style={{
            width: "100%", height: 72, background: "var(--vp-bg-deep)",
            border: "1px solid var(--vp-border-light)", borderRadius: "var(--vp-radius-lg)",
            padding: "8px 12px", color: "var(--vp-text-secondary)",
            fontSize: 11, fontFamily: "inherit", outline: "none",
            resize: "vertical", lineHeight: 1.5, marginBottom: 10,
            transition: "border-color 0.15s",
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = "var(--vp-accent-blue-border)"; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = "var(--vp-border-light)"; }}
        />

        <div style={{ position: "relative" }}>
          <button
            ref={generateBtnRef}
            disabled={!aiDescription.trim()}
            onClick={() => {
              const rect = generateBtnRef.current?.getBoundingClientRect();
              if (rect) setPickerPos({ top: rect.bottom + 4, left: Math.min(rect.left, window.innerWidth - 270) });
              setShowAgentPicker((v) => !v);
            }}
            style={{
              width: "100%", padding: "10px 14px", borderRadius: "var(--vp-radius-xl)",
              background: aiDescription.trim()
                ? "linear-gradient(135deg, rgba(167,139,250,0.08), rgba(167,139,250,0.18))"
                : "var(--vp-bg-surface-hover)",
              border: aiDescription.trim()
                ? "1px solid rgba(167,139,250,0.3)"
                : "1px solid var(--vp-border-light)",
              color: aiDescription.trim() ? "#a78bfa" : "var(--vp-text-faint)",
              fontSize: 12, fontWeight: 600,
              cursor: aiDescription.trim() ? "pointer" : "not-allowed",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              transition: "all 0.15s",
              opacity: aiDescription.trim() ? 1 : 0.5,
            }}
            onMouseEnter={(e) => {
              if (aiDescription.trim()) e.currentTarget.style.background = "linear-gradient(135deg, rgba(167,139,250,0.12), rgba(167,139,250,0.25))";
            }}
            onMouseLeave={(e) => {
              if (aiDescription.trim()) e.currentTarget.style.background = "linear-gradient(135deg, rgba(167,139,250,0.08), rgba(167,139,250,0.18))";
            }}
          >
            <Sparkles size={14} />
            Generate Mission Plan
          </button>

          {showAgentPicker && pickerPos && createPortal(
            <div
              ref={pickerRef}
              style={{ position: "fixed", top: pickerPos.top, left: pickerPos.left, zIndex: 9999 }}
            >
              <AgentPicker onSelect={handleSendToAgent} />
            </div>,
            document.body
          )}
        </div>

        <p style={{ fontSize: 10, color: "var(--vp-text-faint)", lineHeight: 1.5, marginTop: 8 }}>
          The agent will output JSON in the terminal. Copy the JSON and paste it below to import.
        </p>

        <div style={{
          marginTop: 8, padding: "8px 10px", borderRadius: "var(--vp-radius-lg)",
          background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.4)",
          display: "flex", alignItems: "flex-start", gap: 6,
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#ef4444", flexShrink: 0, marginTop: 1 }}>BETA</span>
          <span style={{ fontSize: 10, color: "#f87171", lineHeight: 1.5 }}>
            AI-generated plans may contain errors. Review the task sequence and prompts carefully before running any steps.
          </span>
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
            border: `1px solid ${(importError || (preview && preview.error)) ? "rgba(239,68,68,0.4)" : "var(--vp-border-light)"}`,
            borderRadius: "var(--vp-radius-xl)", padding: "10px 14px", color: "var(--vp-text-secondary)",
            fontSize: 11, fontFamily: "JetBrains Mono, monospace", outline: "none",
            resize: "vertical", lineHeight: 1.5, transition: "border-color 0.15s",
          }}
          onFocus={(e) => { if (!importError) e.currentTarget.style.borderColor = "var(--vp-accent-blue-border)"; }}
          onBlur={(e) => { if (!importError) e.currentTarget.style.borderColor = "var(--vp-border-light)"; }}
        />

        {/* Error — show real-time validation errors OR import-time errors */}
        {(importError || (preview && preview.error)) && (
          <div style={{
            marginTop: 8, padding: "10px 12px", borderRadius: "var(--vp-radius-lg)",
            background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)",
            fontSize: 11, color: "#ef4444", whiteSpace: "pre-wrap", lineHeight: 1.6,
          }}>
            {importError || preview?.error}
          </div>
        )}

        {/* Warnings */}
        {preview && !preview.error && preview.warnings.length > 0 && (
          <div style={{
            marginTop: 8, padding: "8px 12px", borderRadius: "var(--vp-radius-lg)",
            background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)",
            fontSize: 11, color: "#f59e0b", whiteSpace: "pre-wrap", lineHeight: 1.5,
          }}>
            {preview.warnings.join("\n")}
          </div>
        )}

        {/* Preview */}
        {preview && !preview.error && preview.missions.length > 0 && (
          <div style={{
            marginTop: 8, padding: "10px 12px", borderRadius: "var(--vp-radius-lg)",
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
            marginTop: 8, padding: "8px 12px", borderRadius: "var(--vp-radius-lg)",
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
                padding: "8px 20px", borderRadius: "var(--vp-radius-lg)",
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
    padding: "6px 12px", borderRadius: "var(--vp-radius-md)",
    background: "var(--vp-bg-surface)", border: "1px solid var(--vp-border-light)",
    color: "var(--vp-text-muted)", fontSize: 11, cursor: "pointer" as const,
    display: "flex" as const, alignItems: "center" as const, gap: 5,
    transition: "all 0.15s",
  };
}
