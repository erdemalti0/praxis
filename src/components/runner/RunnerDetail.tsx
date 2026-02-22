import { useEffect, useRef, useState, useCallback, useMemo, useSyncExternalStore } from "react";
import {
  Play, Square, RotateCw, ExternalLink, Edit2, Copy, Trash2,
  Globe, FolderOpen, Smartphone, Tablet, SendHorizontal, Link,
} from "lucide-react";
import type { RunConfig, RunnerInstance, EmulatorInfo } from "../../types/runner";
import { send } from "../../lib/ipc";
import { getRunnerOutput, subscribeRunnerOutput } from "../../stores/runnerStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { getTerminalThemeById } from "../../lib/terminal/terminalThemes";

const EMPTY_LINES: string[] = [];

interface RunnerDetailProps {
  config: RunConfig | null;
  instance: RunnerInstance | null;
  emulators: { android: EmulatorInfo[]; ios: EmulatorInfo[] };
  onStart: (configId: string) => void;
  onStop: (configId: string) => void;
  onRestart: (configId: string) => void;
  onEdit: (config: RunConfig) => void;
  onDelete: (configId: string) => void;
  onDuplicate: (config: RunConfig) => void;
}

function UptimeTicker({ startedAt }: { startedAt: number }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const elapsed = Math.floor((Date.now() - startedAt) / 1000);
  if (elapsed < 60) return <span>{elapsed}s</span>;
  const mins = Math.floor(elapsed / 60);
  if (mins < 60) return <span>{mins}m {elapsed % 60}s</span>;
  const hours = Math.floor(mins / 60);
  return <span>{hours}h {mins % 60}m</span>;
}

// Regex to match URLs in log output
const URL_RE = /https?:\/\/[^\s<>"')\]},]+/g;

/** Extract unique URLs from output lines */
function extractUrls(lines: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const line of lines) {
    const matches = line.match(URL_RE);
    if (!matches) continue;
    for (const url of matches) {
      // Trim trailing dots/colons that aren't part of the URL
      const cleaned = url.replace(/[.:]+$/, "");
      if (!seen.has(cleaned)) {
        seen.add(cleaned);
        result.push(cleaned);
      }
    }
  }
  return result;
}

/** Render a single line with clickable URLs */
function LineWithLinks({ text }: { text: string }) {
  const parts: (string | { url: string })[] = [];
  let lastIndex = 0;
  const re = new RegExp(URL_RE.source, "g");
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push({ url: match[0].replace(/[.:]+$/, "") });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  if (parts.length <= 1 && typeof parts[0] === "string") {
    return <>{text}</>;
  }

  return (
    <>
      {parts.map((p, i) =>
        typeof p === "string" ? (
          <span key={i}>{p}</span>
        ) : (
          <a
            key={i}
            href="#"
            onClick={(e) => {
              e.preventDefault();
              window.electronAPI?.invoke("open_external", p.url).catch(() => {});
            }}
            style={{
              color: "var(--vp-accent-blue)",
              textDecoration: "underline",
              textDecorationColor: "rgba(96,165,250,0.4)",
              cursor: "pointer",
            }}
            title={p.url}
          >
            {p.url}
          </a>
        )
      )}
    </>
  );
}

export default function RunnerDetail({
  config, instance, emulators,
  onStart, onStop, onRestart, onEdit, onDelete, onDuplicate,
}: RunnerDetailProps) {
  const [inputValue, setInputValue] = useState("");
  const outputRef = useRef<HTMLPreElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const autoScrollRef = useRef(true);

  const isRunning = instance?.status === "running";

  // Get terminal theme for output colors
  const terminalThemeId = useSettingsStore((s) => s.terminalThemeId);
  const customTerminalThemes = useSettingsStore((s) => s.customTerminalThemes);
  const termTheme = useMemo(
    () => getTerminalThemeById(terminalThemeId, customTerminalThemes).theme,
    [terminalThemeId, customTerminalThemes],
  );

  // Read output from the persistent store buffer (survives view switches)
  const sessionId = instance?.sessionId || "";
  const outputLines = useSyncExternalStore(
    useCallback((cb) => sessionId ? subscribeRunnerOutput(sessionId, cb) : () => {}, [sessionId]),
    () => sessionId ? getRunnerOutput(sessionId) : EMPTY_LINES,
  );

  // Extract URLs found in output (localhost links, preview URLs, etc.)
  const extractedUrls = useMemo(() => extractUrls(outputLines), [outputLines]);

  // Auto-scroll output to bottom
  useEffect(() => {
    if (autoScrollRef.current && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [outputLines]);

  const handleOutputScroll = useCallback(() => {
    if (!outputRef.current) return;
    const el = outputRef.current;
    autoScrollRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }, []);

  const handleSendInput = useCallback(() => {
    if (!instance?.sessionId || !inputValue) return;
    send("write_pty", { id: instance.sessionId, data: inputValue + "\n" });
    setInputValue("");
    inputRef.current?.focus();
  }, [instance?.sessionId, inputValue]);

  if (!config) {
    return (
      <div className="h-full flex flex-col items-center justify-center" style={{ color: "var(--vp-text-faint)" }}>
        <Play size={40} style={{ opacity: 0.15, marginBottom: 12 }} />
        <span style={{ fontSize: 13, fontWeight: 500 }}>Select or create a run configuration</span>
        <span style={{ fontSize: 11, marginTop: 4, opacity: 0.6 }}>
          Run and monitor your development servers, builds, and tools
        </span>
      </div>
    );
  }

  const openPort = (port: number) => {
    window.electronAPI?.invoke("open_external", `http://localhost:${port}`).catch(() => {});
  };

  const fullCommand = `${config.command} ${config.args.join(" ")}`.trim();

  return (
    <div className="h-full flex flex-col" style={{ overflow: "hidden" }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-5"
        style={{
          height: 52, flexShrink: 0,
          borderBottom: "1px solid var(--vp-bg-surface-hover)",
        }}
      >
        <div className="flex items-center gap-3">
          <div style={{
            width: 8, height: 8, borderRadius: "50%",
            background: isRunning ? "var(--vp-accent-green)" : instance?.status === "error" ? "var(--vp-accent-red)" : "var(--vp-text-muted)",
            boxShadow: isRunning ? "0 0 8px rgba(74,222,128,0.5)" : "none",
          }} />
          <span style={{ fontSize: 15, fontWeight: 600, color: "var(--vp-text-primary)" }}>
            {config.name}
          </span>
          {isRunning && instance && (
            <span style={{
              fontSize: 10, color: "var(--vp-text-faint)",
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              PID {instance.pid} | <UptimeTicker startedAt={instance.startedAt} />
            </span>
          )}
          {instance?.status === "error" && instance.exitCode !== undefined && (
            <span style={{
              padding: "2px 8px", borderRadius: "var(--vp-radius-sm)",
              background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)",
              color: "var(--vp-accent-red)", fontSize: 10, fontWeight: 600,
            }}>
              Exit {instance.exitCode}
            </span>
          )}
          {instance?.status === "stopped" && (
            <span style={{
              padding: "2px 8px", borderRadius: "var(--vp-radius-sm)",
              background: "rgba(107,114,128,0.1)", border: "1px solid rgba(107,114,128,0.25)",
              color: "var(--vp-text-muted)", fontSize: 10, fontWeight: 600,
            }}>
              Stopped
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => onEdit(config)}
            title="Edit"
            style={{
              width: 28, height: 28, borderRadius: "var(--vp-radius-md)",
              background: "transparent", border: "1px solid var(--vp-border-light)",
              color: "var(--vp-text-muted)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--vp-border-medium)"; e.currentTarget.style.color = "var(--vp-text-primary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--vp-border-light)"; e.currentTarget.style.color = "var(--vp-text-muted)"; }}
          >
            <Edit2 size={12} />
          </button>
          <button
            onClick={() => onDuplicate(config)}
            title="Duplicate"
            style={{
              width: 28, height: 28, borderRadius: "var(--vp-radius-md)",
              background: "transparent", border: "1px solid var(--vp-border-light)",
              color: "var(--vp-text-muted)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--vp-border-medium)"; e.currentTarget.style.color = "var(--vp-text-primary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--vp-border-light)"; e.currentTarget.style.color = "var(--vp-text-muted)"; }}
          >
            <Copy size={12} />
          </button>
          <button
            onClick={() => onDelete(config.id)}
            title="Delete"
            style={{
              width: 28, height: 28, borderRadius: "var(--vp-radius-md)",
              background: "transparent", border: "1px solid var(--vp-border-light)",
              color: "var(--vp-text-muted)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(239,68,68,0.3)"; e.currentTarget.style.color = "var(--vp-accent-red)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--vp-border-light)"; e.currentTarget.style.color = "var(--vp-text-muted)"; }}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Content — split into info section (top) and output (bottom, flex-1) */}
      <div className="flex-1 flex flex-col min-h-0" style={{ overflow: "hidden" }}>
        {/* Info section */}
        <div style={{ padding: "16px 20px", flexShrink: 0 }}>
          {/* Command + CWD inline */}
          <div className="flex gap-4" style={{ marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 10, fontWeight: 600, color: "var(--vp-text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4, display: "block" }}>
                Command
              </label>
              <div style={{
                padding: "8px 12px", borderRadius: "var(--vp-radius-lg)",
                background: "var(--vp-bg-secondary)", border: "1px solid var(--vp-border-light)",
                fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                color: "var(--vp-text-primary)",
              }}>
                {fullCommand}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 10, fontWeight: 600, color: "var(--vp-text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4, display: "block" }}>
                Working Directory
              </label>
              <div className="flex items-center gap-2" style={{
                padding: "8px 12px", borderRadius: "var(--vp-radius-lg)",
                background: "var(--vp-bg-secondary)", border: "1px solid var(--vp-border-light)",
              }}>
                <FolderOpen size={11} style={{ color: "var(--vp-text-faint)", flexShrink: 0 }} />
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                  color: "var(--vp-text-secondary)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {config.cwd}
                </span>
              </div>
            </div>
          </div>

          {/* Ports + Emulators + Actions row */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Actions */}
            {isRunning ? (
              <>
                <button
                  onClick={() => onStop(config.id)}
                  className="flex items-center gap-1.5"
                  style={{
                    padding: "6px 14px", borderRadius: "var(--vp-radius-lg)",
                    background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)",
                    color: "var(--vp-accent-red)", fontSize: 11, fontWeight: 600, cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.18)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.1)"; }}
                >
                  <Square size={10} />
                  Stop
                </button>
                <button
                  onClick={() => onRestart(config.id)}
                  className="flex items-center gap-1.5"
                  style={{
                    padding: "6px 14px", borderRadius: "var(--vp-radius-lg)",
                    background: "rgba(251,146,60,0.1)", border: "1px solid rgba(251,146,60,0.25)",
                    color: "var(--vp-accent-orange)", fontSize: 11, fontWeight: 600, cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(251,146,60,0.18)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(251,146,60,0.1)"; }}
                >
                  <RotateCw size={10} />
                  Restart
                </button>
              </>
            ) : (
              <button
                onClick={() => onStart(config.id)}
                className="flex items-center gap-1.5"
                style={{
                  padding: "6px 14px", borderRadius: "var(--vp-radius-lg)",
                  background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.25)",
                  color: "var(--vp-accent-green)", fontSize: 11, fontWeight: 600, cursor: "pointer",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(74,222,128,0.18)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(74,222,128,0.1)"; }}
              >
                <Play size={10} />
                Start
              </button>
            )}

            {/* Separator */}
            {instance && instance.ports.length > 0 && (
              <div style={{ width: 1, height: 20, background: "var(--vp-border-subtle)", margin: "0 4px" }} />
            )}

            {/* Port badges */}
            {instance && instance.ports.map((port) => (
              <button
                key={port}
                onClick={() => openPort(port)}
                className="flex items-center gap-1.5"
                style={{
                  padding: "4px 10px", borderRadius: "var(--vp-radius-md)",
                  background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.25)",
                  color: "var(--vp-accent-blue)", fontSize: 11, fontWeight: 600, cursor: "pointer",
                  fontFamily: "'JetBrains Mono', monospace",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(96,165,250,0.15)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(96,165,250,0.08)"; }}
              >
                <Globe size={10} />
                :{port}
                <ExternalLink size={9} style={{ opacity: 0.6 }} />
              </button>
            ))}

            {/* Emulator badges */}
            {emulators.android.map((d) => (
              <div
                key={d.id}
                className="flex items-center gap-1.5"
                style={{
                  padding: "4px 10px", borderRadius: "var(--vp-radius-md)",
                  background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.2)",
                  fontSize: 10, color: "var(--vp-text-secondary)",
                }}
              >
                <Smartphone size={10} style={{ color: "var(--vp-accent-green)" }} />
                {d.name}
              </div>
            ))}
            {emulators.ios.map((d) => (
              <div
                key={d.id}
                className="flex items-center gap-1.5"
                style={{
                  padding: "4px 10px", borderRadius: "var(--vp-radius-md)",
                  background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.2)",
                  fontSize: 10, color: "var(--vp-text-secondary)",
                }}
              >
                <Tablet size={10} style={{ color: "var(--vp-accent-blue)" }} />
                {d.name}
              </div>
            ))}
          </div>

          {/* Env vars (collapsed) */}
          {config.env && Object.keys(config.env).length > 0 && (
            <div style={{ marginTop: 10 }}>
              <span style={{ fontSize: 10, color: "var(--vp-text-faint)" }}>
                ENV: {Object.keys(config.env).join(", ")}
              </span>
            </div>
          )}
        </div>

        {/* Output section — takes remaining space */}
        {instance?.sessionId && (
          <div className="flex-1 min-h-0 flex flex-col" style={{ borderTop: "1px solid var(--vp-bg-surface-hover)" }}>
            <div className="flex items-center justify-between px-4" style={{ height: 32, flexShrink: 0 }}>
              <div className="flex items-center gap-2">
                <label style={{ fontSize: 10, fontWeight: 600, color: "var(--vp-text-dim)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Output
                </label>
                {isRunning && (
                  <div className="flex items-center gap-1.5">
                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--vp-accent-green)", animation: "pulse 2s infinite" }} />
                    <span style={{ fontSize: 9, color: "var(--vp-text-faint)" }}>Live</span>
                  </div>
                )}
              </div>
            </div>
            {/* Extracted URLs bar */}
            {extractedUrls.length > 0 && (
              <div
                className="flex items-center gap-2 flex-wrap px-4"
                style={{
                  padding: "6px 16px",
                  background: "rgba(96,165,250,0.04)",
                  borderBottom: "1px solid rgba(96,165,250,0.1)",
                  flexShrink: 0,
                }}
              >
                <Link size={11} style={{ color: "var(--vp-accent-blue)", flexShrink: 0 }} />
                {extractedUrls.map((url) => (
                  <button
                    key={url}
                    onClick={() => {
                      window.electronAPI?.invoke("open_external", url).catch(() => {});
                    }}
                    className="flex items-center gap-1"
                    style={{
                      padding: "2px 8px",
                      borderRadius: "var(--vp-radius-sm)",
                      background: "rgba(96,165,250,0.08)",
                      border: "1px solid rgba(96,165,250,0.2)",
                      color: "var(--vp-accent-blue)",
                      fontSize: 10,
                      fontWeight: 500,
                      fontFamily: "'JetBrains Mono', monospace",
                      cursor: "pointer",
                      transition: "all 0.15s",
                      whiteSpace: "nowrap",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(96,165,250,0.15)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(96,165,250,0.08)"; }}
                  >
                    {url.replace(/^https?:\/\//, "")}
                    <ExternalLink size={8} style={{ opacity: 0.6 }} />
                  </button>
                ))}
              </div>
            )}
            <pre
              ref={outputRef}
              onScroll={handleOutputScroll}
              style={{
                flex: 1,
                margin: 0,
                padding: "8px 16px",
                background: termTheme.background,
                color: termTheme.foreground,
                fontFamily: "'JetBrains Mono', 'SF Mono', Monaco, Menlo, monospace",
                fontSize: 11,
                lineHeight: 1.5,
                overflowY: "auto",
                overflowX: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {outputLines.length > 0 ? (
                outputLines.map((line, i) => (
                  <span key={i}>
                    {i > 0 && "\n"}
                    <LineWithLinks text={line} />
                  </span>
                ))
              ) : (
                <span style={{ color: termTheme.brightBlack }}>
                  {isRunning ? "Waiting for output..." : "No output captured"}
                </span>
              )}
            </pre>
            {/* Input bar */}
            {isRunning && (
              <div
                className="flex items-center gap-2"
                style={{
                  padding: "6px 12px",
                  background: termTheme.background,
                  borderTop: `1px solid ${termTheme.selectionBackground}`,
                  flexShrink: 0,
                }}
              >
                <span style={{ color: termTheme.green, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", flexShrink: 0 }}>
                  &gt;
                </span>
                <input
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSendInput();
                    }
                  }}
                  placeholder="Send input to process..."
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    color: termTheme.foreground,
                    fontFamily: "'JetBrains Mono', 'SF Mono', Monaco, Menlo, monospace",
                    fontSize: 12,
                    padding: "4px 0",
                  }}
                />
                <button
                  onClick={handleSendInput}
                  disabled={!inputValue}
                  style={{
                    width: 28, height: 28, borderRadius: "var(--vp-radius-md)",
                    background: inputValue ? `${termTheme.selectionBackground}` : "transparent",
                    border: inputValue ? `1px solid ${termTheme.brightBlack}` : "1px solid transparent",
                    color: inputValue ? termTheme.green : termTheme.brightBlack,
                    cursor: inputValue ? "pointer" : "default",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 0.15s",
                    flexShrink: 0,
                  }}
                >
                  <SendHorizontal size={12} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
