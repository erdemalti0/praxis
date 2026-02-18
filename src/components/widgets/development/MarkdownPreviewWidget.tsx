import { useState, useEffect, useMemo, useRef } from "react";
import { marked } from "marked";
import hljs from "highlight.js/lib/core";
// Register only commonly used languages
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import bash from "highlight.js/lib/languages/bash";
import json from "highlight.js/lib/languages/json";
import css from "highlight.js/lib/languages/css";
import xml from "highlight.js/lib/languages/xml";
import markdown from "highlight.js/lib/languages/markdown";
import yaml from "highlight.js/lib/languages/yaml";
import sql from "highlight.js/lib/languages/sql";
import rust from "highlight.js/lib/languages/rust";
import { getBaseName } from "../../../lib/pathUtils";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import diff from "highlight.js/lib/languages/diff";
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("js", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("sh", bash);
hljs.registerLanguage("shell", bash);
hljs.registerLanguage("json", json);
hljs.registerLanguage("css", css);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("yaml", yaml);
hljs.registerLanguage("yml", yaml);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("go", go);
hljs.registerLanguage("java", java);
hljs.registerLanguage("diff", diff);

import { invoke } from "../../../lib/ipc";
import { useUIStore } from "../../../stores/uiStore";
import { useWidgetStore } from "../../../stores/widgetStore";
import type { MarkdownPreviewConfig } from "../../../types/widget";
import { Download, Columns, Hash, Save, RefreshCw, FileText, ChevronDown } from "lucide-react";

(marked.setOptions as any)({
  highlight: function (code: string, lang: string): string {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, { language: lang }).value;
      } catch {}
    }
    // Fallback: try auto-detect with registered subset only
    try {
      return hljs.highlightAuto(code).value;
    } catch {}
    return code;
  },
  breaks: true,
  gfm: true,
});

const previewStyles = `
  .markdown-preview h1 { font-size: 20px; font-weight: 700; margin: 16px 0 12px; color: var(--vp-text-primary); border-bottom: 1px solid var(--vp-border-light); padding-bottom: 8px; }
  .markdown-preview h2 { font-size: 18px; font-weight: 600; margin: 14px 0 10px; color: var(--vp-text-primary); }
  .markdown-preview h3 { font-size: 16px; font-weight: 600; margin: 12px 0 8px; color: var(--vp-text-primary); }
  .markdown-preview h4 { font-size: 14px; font-weight: 600; margin: 10px 0 6px; color: var(--vp-text-secondary); }
  .markdown-preview p { margin: 8px 0; line-height: 1.6; color: var(--vp-text-secondary); }
  .markdown-preview ul, .markdown-preview ol { margin: 8px 0; padding-left: 20px; color: var(--vp-text-secondary); }
  .markdown-preview li { margin: 4px 0; }
  .markdown-preview code { background: var(--vp-border-subtle); padding: 2px 6px; border-radius: var(--vp-radius-sm); font-size: 12px; color: var(--vp-accent-red-text); font-family: monospace; }
  .markdown-preview pre { background: rgba(0,0,0,0.3); padding: 12px; border-radius: var(--vp-radius-lg); overflow-x: auto; margin: 12px 0; }
  .markdown-preview pre code { background: transparent; padding: 0; color: var(--vp-text-secondary); }
  .markdown-preview blockquote { border-left: 3px solid var(--vp-accent-blue); padding-left: 12px; margin: 12px 0; color: var(--vp-text-muted); font-style: italic; }
  .markdown-preview table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  .markdown-preview th, .markdown-preview td { border: 1px solid var(--vp-border-light); padding: 8px 12px; text-align: left; }
  .markdown-preview th { background: var(--vp-bg-surface-hover); font-weight: 600; color: var(--vp-text-secondary); }
  .markdown-preview td { color: var(--vp-text-secondary); }
  .markdown-preview hr { border: none; border-top: 1px solid var(--vp-border-light); margin: 16px 0; }
  .markdown-preview a { color: var(--vp-accent-blue); text-decoration: none; }
  .markdown-preview a:hover { text-decoration: underline; }
  .markdown-preview img { max-width: 100%; border-radius: var(--vp-radius-md); }
  .markdown-preview .task-list-item { list-style: none; margin-left: -20px; }
  .markdown-preview input[type="checkbox"] { margin-right: 8px; accent-color: var(--vp-accent-blue); }
`;

export default function MarkdownPreviewWidget({
  widgetId,
  workspaceId,
  config = {},
}: {
  widgetId: string;
  workspaceId: string;
  config?: MarkdownPreviewConfig;
}) {
  const selectedProject = useUIStore((s) => s.selectedProject);
  const [mdFiles, setMdFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [originalText, setOriginalText] = useState("");
  const [viewMode, setViewMode] = useState<"edit" | "preview" | "split">(config.viewMode ?? "preview");
  const [showLineNumbers, setShowLineNumbers] = useState(config.showLineNumbers ?? false);
  const [syncScroll, setSyncScroll] = useState(config.syncScroll ?? true);
  const [loading, setLoading] = useState(false);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Persist user preferences
  useEffect(() => {
    useWidgetStore.getState().updateWidgetConfig(workspaceId, widgetId, { viewMode });
  }, [viewMode, workspaceId, widgetId]);

  useEffect(() => {
    useWidgetStore.getState().updateWidgetConfig(workspaceId, widgetId, { showLineNumbers });
  }, [showLineNumbers, workspaceId, widgetId]);

  useEffect(() => {
    useWidgetStore.getState().updateWidgetConfig(workspaceId, widgetId, { syncScroll });
  }, [syncScroll, workspaceId, widgetId]);

  const isDirty = text !== originalText;

  // Load .md files from project
  useEffect(() => {
    if (!selectedProject?.path) {
      setMdFiles([]);
      return;
    }
    loadMdFiles();
  }, [selectedProject?.path]);

  const loadMdFiles = async () => {
    if (!selectedProject?.path) return;
    try {
      const files = await invoke<string[]>("glob_files", { pattern: "*.md", cwd: selectedProject.path });
      // Sort: README.md first, then alphabetically
      const sorted = files.sort((a, b) => {
        const nameA = getBaseName(a).toLowerCase();
        const nameB = getBaseName(b).toLowerCase();
        if (nameA === "readme.md") return -1;
        if (nameB === "readme.md") return 1;
        return nameA.localeCompare(nameB);
      });
      setMdFiles(sorted);
      // Auto-select README.md or first file
      if (sorted.length > 0 && !selectedFile) {
        loadFile(sorted[0]);
      }
    } catch {
      setMdFiles([]);
    }
  };

  const loadFile = async (filePath: string) => {
    setLoading(true);
    try {
      const content = await invoke<string>("read_file", { path: filePath });
      setText(content);
      setOriginalText(content);
      setSelectedFile(filePath);
    } catch {
      setText("Error: Could not read file");
      setOriginalText("");
    }
    setLoading(false);
    setShowFilePicker(false);
  };

  const saveFile = async () => {
    if (!selectedFile || !isDirty) return;
    try {
      await invoke("write_file", { path: selectedFile, content: text });
      setOriginalText(text);
    } catch {}
  };

  const html = useMemo(() => {
    try {
      return marked.parse(text) as string;
    } catch {
      return "<p>Error parsing markdown</p>";
    }
  }, [text]);

  const handleEditScroll = () => {
    if (!syncScroll || viewMode !== "split" || !editRef.current || !previewRef.current) return;
    const pct = editRef.current.scrollTop / (editRef.current.scrollHeight - editRef.current.clientHeight);
    previewRef.current.scrollTop = pct * (previewRef.current.scrollHeight - previewRef.current.clientHeight);
  };

  const exportHtml = () => {
    const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Markdown Export</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; background: var(--vp-bg-tertiary); color: var(--vp-text-primary); }
    ${previewStyles}
  </style>
</head>
<body class="markdown-preview">${html}</body>
</html>`;
    const blob = new Blob([fullHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedFile ? getBaseName(selectedFile) : "markdown"}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Close picker on outside click
  useEffect(() => {
    if (!showFilePicker) return;
    const close = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowFilePicker(false);
      }
    };
    const id = setTimeout(() => document.addEventListener("mousedown", close), 0);
    return () => { clearTimeout(id); document.removeEventListener("mousedown", close); };
  }, [showFilePicker]);

  const fileName = selectedFile ? getBaseName(selectedFile) : "No file";
  const relativePath = (f: string) => {
    if (!selectedProject?.path) return f;
    return f.startsWith(selectedProject.path) ? f.slice(selectedProject.path.length + 1) : f;
  };

  const lines = text.split("\n");

  return (
    <div className="h-full flex flex-col">
      <style>{previewStyles}</style>

      {/* Toolbar */}
      <div
        className="flex items-center gap-2"
        style={{ padding: "4px 8px", borderBottom: "1px solid var(--vp-bg-surface-hover)" }}
      >
        {/* File picker dropdown */}
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setShowFilePicker(!showFilePicker)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "3px 8px",
              fontSize: 10,
              borderRadius: "var(--vp-radius-sm)",
              background: "var(--vp-bg-surface-hover)",
              border: "1px solid var(--vp-border-light)",
              color: "var(--vp-text-primary)",
              cursor: "pointer",
              maxWidth: 160,
            }}
          >
            <FileText size={10} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {fileName}
            </span>
            <ChevronDown size={10} style={{ flexShrink: 0, opacity: 0.5 }} />
          </button>

          {showFilePicker && (
            <div
              ref={pickerRef}
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                marginTop: 4,
                background: "var(--vp-bg-tertiary)",
                border: "1px solid var(--vp-border-medium)",
                borderRadius: "var(--vp-radius-lg)",
                padding: 4,
                zIndex: 100,
                minWidth: 220,
                maxHeight: 300,
                overflow: "auto",
                boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
              }}
            >
              {mdFiles.length === 0 ? (
                <div style={{ padding: "8px 12px", color: "var(--vp-text-faint)", fontSize: 11 }}>
                  No .md files found
                </div>
              ) : (
                mdFiles.map((f) => (
                  <button
                    key={f}
                    onClick={() => loadFile(f)}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "6px 10px",
                      fontSize: 11,
                      borderRadius: "var(--vp-radius-md)",
                      background: selectedFile === f ? "var(--vp-accent-blue-bg-hover)" : "transparent",
                      border: "none",
                      color: selectedFile === f ? "var(--vp-accent-blue)" : "var(--vp-text-secondary)",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      if (selectedFile !== f) e.currentTarget.style.background = "var(--vp-bg-surface-hover)";
                    }}
                    onMouseLeave={(e) => {
                      if (selectedFile !== f) e.currentTarget.style.background = "transparent";
                    }}
                  >
                    {relativePath(f)}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* View mode tabs */}
        <div className="flex gap-1">
          {(["edit", "preview", "split"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              style={{
                fontSize: 10,
                padding: "3px 8px",
                borderRadius: "var(--vp-radius-sm)",
                background: viewMode === mode ? "var(--vp-border-light)" : "transparent",
                border: "none",
                color: viewMode === mode ? "var(--vp-text-primary)" : "var(--vp-text-dim)",
                cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {mode}
            </button>
          ))}
        </div>

        <span style={{ flex: 1 }} />

        {/* Actions */}
        <div className="flex gap-1">
          {isDirty && (
            <button
              onClick={saveFile}
              style={{
                background: "var(--vp-accent-green-bg-hover)",
                border: "none",
                color: "var(--vp-accent-green)",
                cursor: "pointer",
                padding: 4,
                borderRadius: "var(--vp-radius-sm)",
                display: "flex",
                alignItems: "center",
                gap: 3,
                fontSize: 10,
              }}
              title="Save changes"
            >
              <Save size={12} />
            </button>
          )}
          <button
            onClick={loadMdFiles}
            style={{ background: "none", border: "none", color: "var(--vp-text-faint)", cursor: "pointer", padding: 4 }}
            title="Refresh files"
          >
            <RefreshCw size={12} />
          </button>
          <button
            onClick={() => setShowLineNumbers(!showLineNumbers)}
            style={{
              background: showLineNumbers ? "var(--vp-border-light)" : "none",
              border: "none",
              color: showLineNumbers ? "var(--vp-text-primary)" : "var(--vp-text-faint)",
              cursor: "pointer",
              padding: 4,
              borderRadius: "var(--vp-radius-sm)",
            }}
            title="Line numbers"
          >
            <Hash size={12} />
          </button>
          <button
            onClick={() => setSyncScroll(!syncScroll)}
            style={{
              background: syncScroll ? "var(--vp-accent-blue-bg-hover)" : "none",
              border: "none",
              color: syncScroll ? "var(--vp-accent-blue)" : "var(--vp-text-faint)",
              cursor: "pointer",
              padding: 4,
              borderRadius: "var(--vp-radius-sm)",
            }}
            title="Sync scroll"
          >
            <Columns size={12} />
          </button>
          <button
            onClick={exportHtml}
            style={{ background: "none", border: "none", color: "var(--vp-text-faint)", cursor: "pointer", padding: 4 }}
            title="Export HTML"
          >
            <Download size={12} />
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center" style={{ color: "var(--vp-text-faint)", fontSize: 12 }}>
          Loading...
        </div>
      ) : !selectedFile && mdFiles.length === 0 ? (
        <div className="flex-1 flex items-center justify-center" style={{ color: "var(--vp-text-faint)", fontSize: 12, textAlign: "center", padding: 20 }}>
          {selectedProject?.path ? "No .md files found in project" : "Select a project to browse markdown files"}
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex" style={{ flexDirection: viewMode === "split" ? "row" : "column" }}>
          {(viewMode === "edit" || viewMode === "split") && (
            <div
              style={{
                flex: viewMode === "split" ? 1 : "none",
                display: "flex",
                borderRight: viewMode === "split" ? "1px solid var(--vp-bg-surface-hover)" : "none",
                height: viewMode === "edit" ? "100%" : undefined,
              }}
            >
              {showLineNumbers && (
                <div
                  style={{
                    background: "rgba(0,0,0,0.2)",
                    padding: "8px 4px",
                    fontSize: 10,
                    color: "var(--vp-text-subtle)",
                    fontFamily: "monospace",
                    textAlign: "right",
                    userSelect: "none",
                    minWidth: 32,
                    lineHeight: 1.5,
                    overflow: "hidden",
                  }}
                >
                  {lines.map((_, i) => (
                    <div key={i}>{i + 1}</div>
                  ))}
                </div>
              )}
              <textarea
                ref={editRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onScroll={handleEditScroll}
                style={{
                  flex: 1,
                  width: "100%",
                  height: "100%",
                  background: "transparent",
                  border: "none",
                  color: "var(--vp-text-secondary)",
                  fontFamily: "monospace",
                  fontSize: 12,
                  padding: 8,
                  outline: "none",
                  resize: "none",
                  lineHeight: 1.5,
                }}
                spellCheck={false}
              />
            </div>
          )}

          {(viewMode === "preview" || viewMode === "split") && (
            <div
              ref={previewRef}
              className="markdown-preview flex-1 overflow-auto"
              style={{ padding: 12, fontSize: 13, lineHeight: 1.6 }}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )}
        </div>
      )}
    </div>
  );
}
