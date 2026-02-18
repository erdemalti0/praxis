import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { listen } from "../../../lib/ipc";
import { useTerminalStore } from "../../../stores/terminalStore";
import { useWidgetStore } from "../../../stores/widgetStore";
import type { LogViewerConfig } from "../../../types/widget";
import { ArrowDown, Search, X, Terminal, Download, Regex } from "lucide-react";

function getLineColor(line: string): string {
  const lower = line.toLowerCase();
  if (lower.includes("error") || lower.includes("fatal") || lower.includes("exception")) return "var(--vp-accent-red-text)";
  if (lower.includes("warn") || lower.includes("warning")) return "var(--vp-accent-amber)";
  if (lower.includes("success") || lower.includes("completed") || lower.includes("done")) return "var(--vp-accent-green)";
  if (lower.includes("info")) return "var(--vp-accent-blue)";
  if (lower.includes("debug") || lower.includes("trace")) return "var(--vp-text-faint)";
  return "var(--vp-text-secondary)";
}

const MAX_LINES = 500;

export default function LogViewerWidget({
  widgetId,
  workspaceId,
  config = {},
}: {
  widgetId: string;
  workspaceId: string;
  config?: LogViewerConfig;
}) {
  const sessions = useTerminalStore((s) => s.sessions);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [outputMap, setOutputMap] = useState<Record<string, string[]>>({});
  const [filterText, setFilterText] = useState(config.filterText ?? "");
  const [useRegex, setUseRegex] = useState(config.useRegex ?? false);
  const [autoScroll, setAutoScroll] = useState(config.autoScroll ?? true);

  // Persist user preferences
  useEffect(() => {
    useWidgetStore.getState().updateWidgetConfig(workspaceId, widgetId, { filterText });
  }, [filterText, workspaceId, widgetId]);

  useEffect(() => {
    useWidgetStore.getState().updateWidgetConfig(workspaceId, widgetId, { useRegex });
  }, [useRegex, workspaceId, widgetId]);

  useEffect(() => {
    useWidgetStore.getState().updateWidgetConfig(workspaceId, widgetId, { autoScroll });
  }, [autoScroll, workspaceId, widgetId]);

  // Filter to shell sessions only (no agentType or agentType === "shell")
  const shellSessions = useMemo(
    () => sessions.filter((s) => !s.agentType || s.agentType === "shell"),
    [sessions]
  );

  // Auto-select first shell session if none selected
  useEffect(() => {
    if (!selectedSessionId && shellSessions.length > 0) {
      setSelectedSessionId(shellSessions[0].id);
    }
    // If selected session was removed, pick another
    if (selectedSessionId && !shellSessions.find((s) => s.id === selectedSessionId)) {
      setSelectedSessionId(shellSessions[0]?.id ?? null);
    }
  }, [shellSessions, selectedSessionId]);

  // Listen to PTY output for all shell sessions
  useEffect(() => {
    const unlisteners: (() => void)[] = [];

    for (const session of shellSessions) {
      const unlisten = listen(`pty-output-${session.id}`, (data: string) => {
        setOutputMap((prev) => {
          const existing = prev[session.id] || [];
          // Split data by newlines, combine with existing
          const newLines = data.split("\n");
          // Merge last line if it was partial
          const merged = [...existing];
          if (merged.length > 0 && newLines.length > 0) {
            // Append first chunk to last existing line
            merged[merged.length - 1] += newLines[0];
            merged.push(...newLines.slice(1));
          } else {
            merged.push(...newLines);
          }
          // Trim to max lines
          const trimmed = merged.slice(-MAX_LINES);
          return { ...prev, [session.id]: trimmed };
        });
      });
      unlisteners.push(unlisten);
    }

    return () => {
      for (const u of unlisteners) u();
    };
  }, [shellSessions.map((s) => s.id).join(",")]);

  const currentLines = selectedSessionId ? (outputMap[selectedSessionId] || []) : [];

  const filteredLines = useMemo(() => {
    if (!filterText) return currentLines;
    try {
      const regex = useRegex ? new RegExp(filterText, "i") : null;
      return currentLines.filter((line) =>
        regex ? regex.test(line) : line.toLowerCase().includes(filterText.toLowerCase())
      );
    } catch {
      return currentLines;
    }
  }, [currentLines, filterText, useRegex]);

  // Strip ANSI escape codes for display
  const stripAnsi = useCallback((text: string) => {
    return text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "").replace(/\x1B\][^\x07]*\x07/g, "");
  }, []);

  const exportLog = () => {
    if (filteredLines.length === 0) return;
    const content = filteredLines.map(stripAnsi).join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `terminal-log-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Shell session tabs */}
      <div
        className="flex items-center gap-1"
        style={{ padding: "4px 6px", borderBottom: "1px solid var(--vp-bg-surface-hover)", overflow: "hidden" }}
      >
        <div className="flex gap-1" style={{ flex: 1, overflow: "auto" }}>
          {shellSessions.length === 0 ? (
            <span style={{ fontSize: 10, color: "var(--vp-text-faint)", padding: "3px 6px" }}>No shell terminals</span>
          ) : (
            shellSessions.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedSessionId(s.id)}
                style={{
                  padding: "3px 8px",
                  fontSize: 10,
                  borderRadius: "var(--vp-radius-sm)",
                  background: selectedSessionId === s.id ? "var(--vp-border-light)" : "transparent",
                  border: "1px solid var(--vp-border-subtle)",
                  color: selectedSessionId === s.id ? "var(--vp-text-primary)" : "var(--vp-text-dim)",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Terminal size={10} />
                <span style={{ maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {s.title}
                </span>
              </button>
            ))
          )}
        </div>
        <button
          onClick={() => setAutoScroll(!autoScroll)}
          style={{
            background: autoScroll ? "var(--vp-accent-blue-bg-hover)" : "none",
            border: "none",
            color: autoScroll ? "var(--vp-accent-blue)" : "var(--vp-text-faint)",
            cursor: "pointer",
            padding: 4,
            borderRadius: "var(--vp-radius-sm)",
            flexShrink: 0,
          }}
          title={autoScroll ? "Auto-scroll ON" : "Auto-scroll OFF"}
        >
          <ArrowDown size={12} />
        </button>
        <button
          onClick={exportLog}
          disabled={filteredLines.length === 0}
          style={{
            background: "none",
            border: "none",
            color: filteredLines.length > 0 ? "var(--vp-text-faint)" : "var(--vp-text-subtle)",
            cursor: filteredLines.length > 0 ? "pointer" : "default",
            padding: 4,
            borderRadius: "var(--vp-radius-sm)",
            flexShrink: 0,
          }}
          title="Export log"
        >
          <Download size={12} />
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2" style={{ padding: "4px 6px", borderBottom: "1px solid var(--vp-bg-surface)" }}>
        <div
          className="flex items-center gap-1"
          style={{ flex: 1, background: "var(--vp-bg-surface)", borderRadius: "var(--vp-radius-sm)", padding: "3px 6px" }}
        >
          {useRegex ? <Regex size={10} style={{ color: "var(--vp-accent-blue)" }} /> : <Search size={10} style={{ color: "var(--vp-text-dim)" }} />}
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder={useRegex ? "Regex filter..." : "Filter logs..."}
            style={{ flex: 1, background: "transparent", border: "none", fontSize: 11, color: "var(--vp-text-primary)", outline: "none" }}
          />
          {filterText && (
            <button onClick={() => setFilterText("")} style={{ background: "none", border: "none", color: "var(--vp-text-faint)", cursor: "pointer", padding: 2 }}>
              <X size={10} />
            </button>
          )}
        </div>
        <button
          onClick={() => setUseRegex(!useRegex)}
          style={{
            background: useRegex ? "var(--vp-accent-blue-bg-hover)" : "none",
            border: "1px solid var(--vp-border-subtle)",
            borderRadius: "var(--vp-radius-sm)",
            padding: "2px 6px",
            fontSize: 9,
            color: useRegex ? "var(--vp-accent-blue)" : "var(--vp-text-faint)",
            cursor: "pointer",
          }}
        >
          .*
        </button>
      </div>

      {/* Log output — virtualized */}
      <VirtualLogList
        selectedSessionId={selectedSessionId}
        filteredLines={filteredLines}
        filterText={filterText}
        autoScroll={autoScroll}
        stripAnsi={stripAnsi}
      />
    </div>
  );
}

const ROW_HEIGHT = 18; // px per log line
const OVERSCAN = 5;

function VirtualLogList({
  selectedSessionId,
  filteredLines,
  filterText,
  autoScroll,
  stripAnsi,
}: {
  selectedSessionId: string | null;
  filteredLines: string[];
  filterText: string;
  autoScroll: boolean;
  stripAnsi: (text: string) => string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(300);

  // Observe container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });
    ro.observe(el);
    setContainerHeight(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  // Filter out empty lines for rendering
  const visibleLines = useMemo(() => {
    return filteredLines
      .map((line, i) => ({ line, idx: i }))
      .filter(({ line }) => stripAnsi(line).trim() !== "");
  }, [filteredLines, stripAnsi]);

  const totalHeight = visibleLines.length * ROW_HEIGHT;

  // Auto-scroll to bottom when new lines arrive
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = totalHeight;
    }
  }, [autoScroll, totalHeight]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIdx = Math.min(visibleLines.length, Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + OVERSCAN);

  if (!selectedSessionId) {
    return (
      <div className="flex-1" style={{ padding: 20, color: "var(--vp-text-faint)", textAlign: "center", fontSize: 11 }}>
        Open a shell terminal to see logs here
      </div>
    );
  }

  if (visibleLines.length === 0) {
    return (
      <div className="flex-1" style={{ padding: 12, color: "var(--vp-text-faint)", textAlign: "center" }}>
        {filterText ? "No matching lines" : "Waiting for output..."}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-auto"
      style={{ fontFamily: "'SF Mono', 'Cascadia Code', 'Fira Code', monospace", fontSize: 10, lineHeight: 1.5 }}
      onScroll={handleScroll}
    >
      <div style={{ height: totalHeight, position: "relative" }}>
        {visibleLines.slice(startIdx, endIdx).map(({ line, idx }, i) => {
          const clean = stripAnsi(line);
          return (
            <div
              key={startIdx + i}
              style={{
                position: "absolute",
                top: (startIdx + i) * ROW_HEIGHT,
                left: 0,
                right: 0,
                height: ROW_HEIGHT,
                display: "flex",
                borderBottom: "1px solid var(--vp-bg-surface)",
                padding: "0 6px",
              }}
            >
              <span
                style={{
                  color: "var(--vp-text-subtle)",
                  paddingRight: 8,
                  marginRight: 8,
                  borderRight: "1px solid var(--vp-bg-surface)",
                  minWidth: 32,
                  textAlign: "right",
                  userSelect: "none",
                  flexShrink: 0,
                }}
              >
                {idx + 1}
              </span>
              <span
                style={{
                  color: getLineColor(clean),
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  flex: 1,
                }}
              >
                {clean}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
