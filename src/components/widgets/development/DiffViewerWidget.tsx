import { useEffect, useState, useMemo } from "react";
import { invoke } from "../../../lib/ipc";
import type { DiffViewerConfig } from "../../../types/widget";
import { RefreshCw, Columns, List, FileCode, ChevronDown, Settings, Hash } from "lucide-react";
import { useWidgetStore } from "../../../stores/widgetStore";

interface DiffLine {
  type: "add" | "remove" | "context" | "header";
  content: string;
  oldLine?: number;
  newLine?: number;
}

interface ParsedDiff {
  file: string;
  lines: DiffLine[];
}

function parseDiff(diffText: string): ParsedDiff[] {
  const files: ParsedDiff[] = [];
  let currentFile: ParsedDiff | null = null;
  let oldLine = 0;
  let newLine = 0;

  const lines = diffText.split("\n");

  for (const line of lines) {
    if (line.startsWith("diff --git")) {
      const match = line.match(/diff --git a\/(.+) b\/(.+)/);
      if (match) {
        if (currentFile) files.push(currentFile);
        currentFile = { file: match[2], lines: [] };
        oldLine = 0;
        newLine = 0;
      }
    } else if (line.startsWith("@@") && currentFile) {
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLine = parseInt(match[1], 10);
        newLine = parseInt(match[2], 10);
        currentFile.lines.push({ type: "header", content: line });
      }
    } else if (currentFile) {
      if (line.startsWith("+") && !line.startsWith("+++")) {
        currentFile.lines.push({ type: "add", content: line, newLine: newLine++ });
      } else if (line.startsWith("-") && !line.startsWith("---")) {
        currentFile.lines.push({ type: "remove", content: line, oldLine: oldLine++ });
      } else if (line.startsWith(" ")) {
        currentFile.lines.push({ type: "context", content: line, oldLine: oldLine++, newLine: newLine++ });
      }
    }
  }

  if (currentFile) files.push(currentFile);
  return files;
}

function DiffLineView({
  line,
  showLineNumbers,
}: {
  line: DiffLine;
  showLineNumbers: boolean;
}) {
  const bgColor =
    line.type === "add"
      ? "var(--vp-accent-green-bg)"
      : line.type === "remove"
      ? "var(--vp-accent-red-bg)"
      : "transparent";

  const textColor =
    line.type === "add"
      ? "var(--vp-accent-green)"
      : line.type === "remove"
      ? "var(--vp-accent-red-text)"
      : line.type === "header"
      ? "var(--vp-accent-blue)"
      : "var(--vp-text-muted)";

  const prefix =
    line.type === "add" ? "+" : line.type === "remove" ? "-" : line.type === "header" ? "@" : " ";

  return (
    <div
      style={{
        display: "flex",
        fontFamily: "monospace",
        fontSize: 11,
        lineHeight: 1.5,
        background: bgColor,
      }}
    >
      {showLineNumbers && (
        <>
          <span
            style={{
              width: 36,
              textAlign: "right",
              paddingRight: 8,
              color: "var(--vp-text-subtle)",
              userSelect: "none",
              flexShrink: 0,
            }}
          >
            {line.oldLine ?? ""}
          </span>
          <span
            style={{
              width: 36,
              textAlign: "right",
              paddingRight: 8,
              borderRight: "1px solid var(--vp-bg-surface-hover)",
              color: "var(--vp-text-subtle)",
              userSelect: "none",
              flexShrink: 0,
            }}
          >
            {line.newLine ?? ""}
          </span>
        </>
      )}
      <span style={{ width: 16, textAlign: "center", color: textColor, flexShrink: 0 }}>{prefix}</span>
      <span style={{ color: textColor, whiteSpace: "pre", flex: 1, overflow: "hidden" }}>
        {line.content.slice(1)}
      </span>
    </div>
  );
}

export default function DiffViewerWidget({
  widgetId,
  workspaceId,
  config = {},
}: {
  widgetId: string;
  workspaceId: string;
  config?: DiffViewerConfig;
}) {
  const [diff, setDiff] = useState("");
  const [staged, setStaged] = useState(false);
  const [viewMode, setViewMode] = useState<"unified" | "split">(config.viewMode ?? "unified");
  const [showLineNumbers, setShowLineNumbers] = useState(config.showLineNumbers ?? true);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(config.selectedFile ?? null);
  const [showFileList, setShowFileList] = useState(false);

  // Persist user preferences
  useEffect(() => {
    useWidgetStore.getState().updateWidgetConfig(workspaceId, widgetId, { viewMode });
  }, [viewMode, workspaceId, widgetId]);

  useEffect(() => {
    useWidgetStore.getState().updateWidgetConfig(workspaceId, widgetId, { showLineNumbers });
  }, [showLineNumbers, workspaceId, widgetId]);

  useEffect(() => {
    const fetchDiff = (showLoader = false) => {
      if (showLoader) setLoading(true);
      invoke<string>("git_diff", { staged })
        .then(setDiff)
        .catch(() => setDiff(""))
        .finally(() => { if (showLoader) setLoading(false); });
    };
    fetchDiff(true);
    const interval = setInterval(() => fetchDiff(false), 1000);
    return () => clearInterval(interval);
  }, [staged]);

  const parsedDiffs = useMemo(() => parseDiff(diff), [diff]);

  const currentDiff = useMemo(() => {
    if (!selectedFile && parsedDiffs.length > 0) {
      return parsedDiffs[0];
    }
    return parsedDiffs.find((d) => d.file === selectedFile) ?? parsedDiffs[0];
  }, [parsedDiffs, selectedFile]);

  const stats = useMemo(() => {
    let additions = 0;
    let deletions = 0;
    for (const file of parsedDiffs) {
      for (const line of file.lines) {
        if (line.type === "add") additions++;
        if (line.type === "remove") deletions++;
      }
    }
    return { additions, deletions, files: parsedDiffs.length };
  }, [parsedDiffs]);

  return (
    <div className="h-full flex flex-col">
      <div
        className="flex items-center gap-2"
        style={{ padding: "6px 8px", borderBottom: "1px solid var(--vp-bg-surface-hover)" }}
      >
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setShowFileList(!showFileList)}
            className="flex items-center gap-1"
            style={{
              background: "var(--vp-bg-surface-hover)",
              border: "1px solid var(--vp-border-light)",
              borderRadius: 4,
              padding: "3px 8px",
              color: "var(--vp-text-secondary)",
              cursor: "pointer",
              fontSize: 10,
              maxWidth: 120,
            }}
          >
            <FileCode size={10} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {currentDiff?.file ?? "No file"}
            </span>
            <ChevronDown size={10} style={{ flexShrink: 0 }} />
          </button>
          {showFileList && parsedDiffs.length > 1 && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                background: "var(--vp-bg-secondary)",
                border: "1px solid var(--vp-border-light)",
                borderRadius: 6,
                marginTop: 4,
                minWidth: 180,
                maxHeight: 200,
                overflow: "auto",
                zIndex: 10,
              }}
            >
              {parsedDiffs.map((d) => (
                <button
                  key={d.file}
                  onClick={() => {
                    setSelectedFile(d.file);
                    setShowFileList(false);
                  }}
                  style={{
                    width: "100%",
                    padding: "6px 10px",
                    background: d.file === selectedFile ? "var(--vp-accent-blue-bg-hover)" : "transparent",
                    border: "none",
                    color: d.file === selectedFile ? "var(--vp-accent-blue)" : "var(--vp-text-secondary)",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: 11,
                  }}
                >
                  {d.file}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-1">
          <button
            onClick={() => setStaged(false)}
            style={{
              fontSize: 10,
              padding: "3px 8px",
              borderRadius: 4,
              background: !staged ? "var(--vp-border-light)" : "transparent",
              border: "1px solid var(--vp-border-light)",
              color: !staged ? "var(--vp-text-primary)" : "var(--vp-text-dim)",
              cursor: "pointer",
            }}
          >
            Unstaged
          </button>
          <button
            onClick={() => setStaged(true)}
            style={{
              fontSize: 10,
              padding: "3px 8px",
              borderRadius: 4,
              background: staged ? "var(--vp-border-light)" : "transparent",
              border: "1px solid var(--vp-border-light)",
              color: staged ? "var(--vp-text-primary)" : "var(--vp-text-dim)",
              cursor: "pointer",
            }}
          >
            Staged
          </button>
        </div>

        <span style={{ flex: 1 }} />

        <div className="flex gap-2" style={{ fontSize: 10 }}>
          <span style={{ color: "var(--vp-accent-green)" }}>+{stats.additions}</span>
          <span style={{ color: "var(--vp-accent-red-text)" }}>-{stats.deletions}</span>
        </div>

        <div className="flex gap-1">
          <button
            onClick={() => setViewMode("unified")}
            style={{
              background: viewMode === "unified" ? "var(--vp-border-light)" : "none",
              border: "none",
              color: viewMode === "unified" ? "var(--vp-text-primary)" : "var(--vp-text-faint)",
              cursor: "pointer",
              padding: 4,
              borderRadius: 4,
            }}
            title="Unified view"
          >
            <List size={12} />
          </button>
          <button
            onClick={() => setViewMode("split")}
            style={{
              background: viewMode === "split" ? "var(--vp-border-light)" : "none",
              border: "none",
              color: viewMode === "split" ? "var(--vp-text-primary)" : "var(--vp-text-faint)",
              cursor: "pointer",
              padding: 4,
              borderRadius: 4,
            }}
            title="Split view"
          >
            <Columns size={12} />
          </button>
          <button
            onClick={() => setShowLineNumbers(!showLineNumbers)}
            style={{
              background: showLineNumbers ? "var(--vp-border-light)" : "none",
              border: "none",
              color: showLineNumbers ? "var(--vp-text-primary)" : "var(--vp-text-faint)",
              cursor: "pointer",
              padding: 4,
              borderRadius: 4,
            }}
            title="Toggle line numbers"
          >
            <Hash size={12} />
          </button>
        </div>
      </div>

      <div
        className="flex-1 overflow-auto"
        style={{ fontFamily: "monospace", fontSize: 11, lineHeight: 1.5 }}
      >
        {loading ? (
          <div className="flex items-center justify-center h-full" style={{ color: "var(--vp-text-faint)" }}>
            <RefreshCw size={14} className="animate-spin" />
          </div>
        ) : !currentDiff || currentDiff.lines.length === 0 ? (
          <div style={{ color: "var(--vp-text-faint)", textAlign: "center", padding: 20 }}>
            No changes
          </div>
        ) : viewMode === "unified" ? (
          currentDiff.lines.map((line, i) => (
            <DiffLineView key={i} line={line} showLineNumbers={showLineNumbers} />
          ))
        ) : (
          <SplitDiffView diff={currentDiff} showLineNumbers={showLineNumbers} />
        )}
      </div>
    </div>
  );
}

function SplitDiffView({ diff, showLineNumbers }: { diff: ParsedDiff; showLineNumbers: boolean }) {
  const leftLines: (DiffLine | null)[] = [];
  const rightLines: (DiffLine | null)[] = [];

  for (const line of diff.lines) {
    if (line.type === "header") {
      leftLines.push(line);
      rightLines.push(line);
    } else if (line.type === "remove") {
      leftLines.push(line);
      rightLines.push(null);
    } else if (line.type === "add") {
      leftLines.push(null);
      rightLines.push(line);
    } else {
      leftLines.push(line);
      rightLines.push(line);
    }
  }

  const renderSide = (line: DiffLine | null, side: "left" | "right") => {
    if (!line) {
      return (
        <div
          style={{
            background: side === "left" ? "var(--vp-accent-red-bg)" : "var(--vp-accent-green-bg)",
            height: 18,
          }}
        />
      );
    }

    const bgColor =
      line.type === "add"
        ? "var(--vp-accent-green-bg-hover)"
        : line.type === "remove"
        ? "var(--vp-accent-red-bg-hover)"
        : line.type === "header"
        ? "var(--vp-accent-blue-bg)"
        : "transparent";

    const textColor =
      line.type === "add"
        ? "var(--vp-accent-green)"
        : line.type === "remove"
        ? "var(--vp-accent-red-text)"
        : line.type === "header"
        ? "var(--vp-accent-blue)"
        : "var(--vp-text-muted)";

    return (
      <div
        style={{
          display: "flex",
          background: bgColor,
          lineHeight: "18px",
        }}
      >
        {showLineNumbers && (
          <span
            style={{
              width: 32,
              textAlign: "right",
              paddingRight: 6,
              color: "var(--vp-text-subtle)",
              userSelect: "none",
              fontSize: 10,
              flexShrink: 0,
            }}
          >
            {side === "left" ? line.oldLine ?? "" : line.newLine ?? ""}
          </span>
        )}
        <span style={{ color: textColor, whiteSpace: "pre", flex: 1, overflow: "hidden", fontSize: 10 }}>
          {line.type === "header" ? line.content : line.content.slice(1)}
        </span>
      </div>
    );
  };

  return (
    <div style={{ display: "flex", height: "100%" }}>
      <div style={{ flex: 1, borderRight: "1px solid var(--vp-border-light)", overflow: "auto" }}>
        {leftLines.map((line, i) => (
          <div key={i}>{renderSide(line, "left")}</div>
        ))}
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        {rightLines.map((line, i) => (
          <div key={i}>{renderSide(line, "right")}</div>
        ))}
      </div>
    </div>
  );
}
