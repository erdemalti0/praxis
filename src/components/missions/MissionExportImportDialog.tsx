import { useState, useMemo } from "react";
import { X, Download, Upload, Copy, Check, FileDown, FileUp, Sparkles } from "lucide-react";
import { useMissionStore } from "../../stores/missionStore";

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
  importText, setImportText, onLoadFile, onImport,
  importError, importSuccess, preview, mergeAsOne, setMergeAsOne,
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
}) {
  const [copiedLink, setCopiedLink] = useState(false);
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
          Use our custom GPT to generate structured mission plans.
          Then paste the JSON response into the import area below.
        </p>

        {/* GPT Link — copy to clipboard */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            navigator.clipboard.writeText("https://chatgpt.com/g/g-699095e80e20819191ca0811a54908c4-praxis-mission-planner").then(() => {
              setCopiedLink(true);
              setTimeout(() => setCopiedLink(false), 2000);
            });
          }}
          style={{
            width: "100%", padding: "10px 14px", borderRadius: 10,
            background: copiedLink
              ? "linear-gradient(135deg, rgba(74,222,128,0.08), rgba(74,222,128,0.15))"
              : "linear-gradient(135deg, rgba(16,163,127,0.08), rgba(16,163,127,0.15))",
            border: copiedLink
              ? "1px solid rgba(74,222,128,0.3)"
              : "1px solid rgba(16,163,127,0.25)",
            color: copiedLink ? "var(--vp-accent-green)" : "#10a37f",
            fontSize: 12, fontWeight: 600,
            cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
            marginBottom: 10, transition: "all 0.15s",
          }}
          onMouseEnter={(e) => { if (!copiedLink) e.currentTarget.style.background = "linear-gradient(135deg, rgba(16,163,127,0.12), rgba(16,163,127,0.22))"; }}
          onMouseLeave={(e) => { if (!copiedLink) e.currentTarget.style.background = "linear-gradient(135deg, rgba(16,163,127,0.08), rgba(16,163,127,0.15))"; }}
        >
          {copiedLink ? <Check size={16} /> : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/>
            </svg>
          )}
          {copiedLink ? "Copied!" : "Copy Praxis Mission Planner GPT Link"}
          <span style={{
            marginLeft: 4, padding: "2px 6px", borderRadius: 4,
            background: copiedLink ? "rgba(74,222,128,0.2)" : "rgba(16,163,127,0.2)",
            fontSize: 9, fontWeight: 700, letterSpacing: "0.04em",
          }}>
            BETA
          </span>
          {copiedLink
            ? null
            : <Copy size={12} style={{ marginLeft: "auto", opacity: 0.6 }} />
          }
        </button>

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
            borderRadius: 10, padding: "10px 14px", color: "var(--vp-text-secondary)",
            fontSize: 11, fontFamily: "JetBrains Mono, monospace", outline: "none",
            resize: "vertical", lineHeight: 1.5, transition: "border-color 0.15s",
          }}
          onFocus={(e) => { if (!importError) e.currentTarget.style.borderColor = "var(--vp-accent-blue-border)"; }}
          onBlur={(e) => { if (!importError) e.currentTarget.style.borderColor = "var(--vp-border-light)"; }}
        />

        {/* Error — show real-time validation errors OR import-time errors */}
        {(importError || (preview && preview.error)) && (
          <div style={{
            marginTop: 8, padding: "10px 12px", borderRadius: 8,
            background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)",
            fontSize: 11, color: "#ef4444", whiteSpace: "pre-wrap", lineHeight: 1.6,
          }}>
            {importError || preview?.error}
          </div>
        )}

        {/* Warnings */}
        {preview && !preview.error && preview.warnings.length > 0 && (
          <div style={{
            marginTop: 8, padding: "8px 12px", borderRadius: 8,
            background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)",
            fontSize: 11, color: "#f59e0b", whiteSpace: "pre-wrap", lineHeight: 1.5,
          }}>
            {preview.warnings.join("\n")}
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
