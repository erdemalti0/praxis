import { useState, useEffect, useRef } from "react";
import type { HttpClientConfig } from "../../../types/widget";
import { Send, Plus, Trash2, Clock, Pin, ChevronRight, ChevronDown, X } from "lucide-react";
import { invoke } from "../../../lib/ipc";
import { useUIStore } from "../../../stores/uiStore";
import { useSettingsStore } from "../../../stores/settingsStore";
import { loadJsonFile, createDebouncedSaver } from "../../../lib/persistence";
import { getProjectDataDir } from "../../../lib/projectSlug";

function getMethodColor(method: string): string {
  switch (method) {
    case "GET": return "var(--vp-accent-green)";
    case "POST": return "var(--vp-accent-blue)";
    case "PUT": return "var(--vp-accent-amber)";
    case "DELETE": return "var(--vp-accent-red-text)";
    default: return "var(--vp-text-muted)";
  }
}

function getStatusColor(status: number): string {
  if (status >= 200 && status < 300) return "var(--vp-accent-green)";
  if (status >= 400 && status < 500) return "var(--vp-accent-amber)";
  if (status >= 500) return "var(--vp-accent-red-text)";
  return "var(--vp-text-muted)";
}

interface HistoryEntry {
  id: string;
  method: string;
  url: string;
  status: number;
  elapsed: number;
  timestamp: number;
  pinned: boolean;
}

interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  elapsed: number;
}

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
const BODY_METHODS = new Set(["POST", "PUT", "PATCH"]);
const MAX_HISTORY = 50;

export default function HttpClientWidget({
  widgetId: _widgetId,
  config: _config = {},
}: {
  widgetId: string;
  config?: HttpClientConfig;
}) {
  const projectPath = useUIStore((s) => s.selectedProject?.path);
  const homeDir = useSettingsStore((s) => s.homeDir);
  const saverRef = useRef(createDebouncedSaver(500));
  const dataDir = projectPath && homeDir ? getProjectDataDir(homeDir, projectPath) : null;

  const [method, setMethod] = useState("GET");
  const [url, setUrl] = useState("");
  const [requestBody, setRequestBody] = useState("");
  const [requestHeaders, setRequestHeaders] = useState<Array<{ key: string; value: string }>>([
    { key: "", value: "" },
  ]);
  const [response, setResponse] = useState<HttpResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [activeRequestTab, setActiveRequestTab] = useState<"body" | "headers">("body");
  const [showResponseHeaders, setShowResponseHeaders] = useState(false);

  // Load history from disk
  useEffect(() => {
    if (!dataDir) return;
    try {
      const filePath = `${dataDir}/http-client.json`;
      const data = loadJsonFile(filePath, { history: [] as HistoryEntry[] });
      if (data.history) setHistory(data.history);
    } catch {}
  }, [dataDir]);

  // Persist history to disk
  useEffect(() => {
    if (!dataDir) return;
    const filePath = `${dataDir}/http-client.json`;
    saverRef.current(filePath, { history });
  }, [history, dataDir]);

  const sendRequest = async () => {
    if (!url.trim() || loading) return;
    setLoading(true);
    setResponse(null);

    const headers: Record<string, string> = {};
    for (const h of requestHeaders) {
      if (h.key.trim()) {
        headers[h.key.trim()] = h.value;
      }
    }

    try {
      const result = await invoke<HttpResponse>("http_request", {
        method,
        url: url.trim(),
        headers,
        body: BODY_METHODS.has(method) ? requestBody : undefined,
        timeout: 30000,
      });
      setResponse(result);

      const entry: HistoryEntry = {
        id: `req-${Date.now()}`,
        method,
        url: url.trim(),
        status: result.status,
        elapsed: result.elapsed,
        timestamp: Date.now(),
        pinned: false,
      };
      setHistory((prev) => {
        const next = [entry, ...prev];
        // Keep pinned items and trim to MAX_HISTORY
        const pinned = next.filter((h) => h.pinned);
        const unpinned = next.filter((h) => !h.pinned);
        return [...pinned, ...unpinned].slice(0, MAX_HISTORY);
      });
    } catch (err: any) {
      setResponse({
        status: 0,
        statusText: "Error",
        headers: {},
        body: err?.message || String(err),
        elapsed: 0,
      });
    } finally {
      setLoading(false);
    }
  };

  const loadFromHistory = (entry: HistoryEntry) => {
    setMethod(entry.method);
    setUrl(entry.url);
  };

  const togglePin = (id: string) => {
    setHistory((prev) =>
      prev.map((h) => (h.id === id ? { ...h, pinned: !h.pinned } : h))
    );
  };

  const removeHistory = (id: string) => {
    setHistory((prev) => prev.filter((h) => h.id !== id));
  };

  const addHeader = () => {
    setRequestHeaders([...requestHeaders, { key: "", value: "" }]);
  };

  const removeHeader = (index: number) => {
    setRequestHeaders(requestHeaders.filter((_, i) => i !== index));
  };

  const updateHeader = (index: number, field: "key" | "value", val: string) => {
    setRequestHeaders(
      requestHeaders.map((h, i) => (i === index ? { ...h, [field]: val } : h))
    );
  };

  const formatResponseBody = (body: string): string => {
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      return body;
    }
  };

  const inputStyle: React.CSSProperties = {
    background: "var(--vp-bg-surface-hover)",
    border: "1px solid var(--vp-border-light)",
    borderRadius: "var(--vp-radius-sm)",
    padding: "4px 8px",
    fontSize: 11,
    color: "var(--vp-text-primary)",
    outline: "none",
  };

  const btnStyle: React.CSSProperties = {
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 4,
    borderRadius: "var(--vp-radius-sm)",
  };

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        overflow: "hidden",
        padding: 8,
        gap: 8,
      }}
    >
      {/* Main area */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        {/* Request bar */}
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            style={{
              background: "var(--vp-bg-surface)",
              border: "1px solid var(--vp-border-light)",
              borderRadius: "var(--vp-radius-sm)",
              padding: "5px 6px",
              fontSize: 11,
              fontWeight: 600,
              color: getMethodColor(method),
              cursor: "pointer",
              outline: "none",
            }}
          >
            {METHODS.map((m) => (
              <option key={m} value={m} style={{ color: getMethodColor(m) }}>
                {m}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendRequest()}
            placeholder="https://api.example.com/endpoint"
            style={{
              ...inputStyle,
              flex: 1,
            }}
          />
          <button
            onClick={sendRequest}
            disabled={loading || !url.trim()}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              background: "var(--vp-accent-blue)",
              border: "none",
              borderRadius: "var(--vp-radius-sm)",
              padding: "5px 10px",
              fontSize: 11,
              fontWeight: 600,
              color: "#fff",
              cursor: loading || !url.trim() ? "not-allowed" : "pointer",
              opacity: loading || !url.trim() ? 0.5 : 1,
            }}
          >
            {loading ? (
              <span
                style={{
                  display: "inline-block",
                  width: 12,
                  height: 12,
                  border: "2px solid rgba(255,255,255,0.3)",
                  borderTopColor: "#fff",
                  borderRadius: "50%",
                  animation: "spin 0.6s linear infinite",
                }}
              />
            ) : (
              <Send size={12} />
            )}
            Send
          </button>
          <button
            onClick={() => setShowHistory(!showHistory)}
            style={{
              ...btnStyle,
              color: showHistory ? "var(--vp-accent-blue)" : "var(--vp-text-faint)",
            }}
            title="Toggle history"
          >
            <Clock size={14} />
          </button>
        </div>

        {/* Request tabs */}
        <div>
          <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--vp-border-light)" }}>
            {(["body", "headers"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveRequestTab(tab)}
                style={{
                  ...btnStyle,
                  padding: "4px 12px",
                  fontSize: 10,
                  fontWeight: 500,
                  color: activeRequestTab === tab ? "var(--vp-accent-blue)" : "var(--vp-text-muted)",
                  borderBottom: activeRequestTab === tab ? "2px solid var(--vp-accent-blue)" : "2px solid transparent",
                  borderRadius: 0,
                  textTransform: "capitalize",
                }}
              >
                {tab === "headers" ? `Headers (${requestHeaders.filter((h) => h.key.trim()).length})` : "Body"}
              </button>
            ))}
          </div>

          {activeRequestTab === "body" && (
            <div style={{ marginTop: 6 }}>
              {BODY_METHODS.has(method) ? (
                <textarea
                  value={requestBody}
                  onChange={(e) => setRequestBody(e.target.value)}
                  placeholder='{"key": "value"}'
                  style={{
                    ...inputStyle,
                    width: "100%",
                    minHeight: 80,
                    maxHeight: 160,
                    resize: "vertical",
                    fontFamily: "monospace",
                    fontSize: 11,
                    boxSizing: "border-box",
                  }}
                />
              ) : (
                <div
                  style={{
                    padding: 12,
                    color: "var(--vp-text-faint)",
                    fontSize: 10,
                    textAlign: "center",
                  }}
                >
                  Body is not available for {method} requests.
                </div>
              )}
            </div>
          )}

          {activeRequestTab === "headers" && (
            <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
              {requestHeaders.map((h, i) => (
                <div key={i} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <input
                    type="text"
                    value={h.key}
                    onChange={(e) => updateHeader(i, "key", e.target.value)}
                    placeholder="Header name"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <input
                    type="text"
                    value={h.value}
                    onChange={(e) => updateHeader(i, "value", e.target.value)}
                    placeholder="Value"
                    style={{ ...inputStyle, flex: 2 }}
                  />
                  <button
                    onClick={() => removeHeader(i)}
                    style={{ ...btnStyle, color: "var(--vp-text-faint)" }}
                    title="Remove header"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              ))}
              <button
                onClick={addHeader}
                style={{
                  ...btnStyle,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  color: "var(--vp-text-muted)",
                  fontSize: 10,
                  padding: "4px 8px",
                }}
              >
                <Plus size={10} />
                Add header
              </button>
            </div>
          )}
        </div>

        {/* Response panel */}
        {response && (
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              gap: 6,
              overflow: "hidden",
            }}
          >
            {/* Status bar */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  display: "inline-block",
                  padding: "2px 8px",
                  borderRadius: "var(--vp-radius-sm)",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#fff",
                  background: getStatusColor(response.status),
                }}
              >
                {response.status} {response.statusText}
              </span>
              {response.elapsed > 0 && (
                <span style={{ fontSize: 10, color: "var(--vp-text-muted)" }}>
                  {Math.round(response.elapsed)}ms
                </span>
              )}
            </div>

            {/* Response body */}
            <pre
              style={{
                flex: 1,
                minHeight: 0,
                overflow: "auto",
                margin: 0,
                padding: 8,
                background: "var(--vp-bg-surface)",
                borderRadius: "var(--vp-radius-md)",
                fontSize: 11,
                fontFamily: "monospace",
                color: "var(--vp-text-secondary)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                border: "1px solid var(--vp-border-light)",
              }}
            >
              {formatResponseBody(response.body)}
            </pre>

            {/* Response headers (collapsible) */}
            <div>
              <button
                onClick={() => setShowResponseHeaders(!showResponseHeaders)}
                style={{
                  ...btnStyle,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 10,
                  color: "var(--vp-text-muted)",
                  padding: "2px 4px",
                }}
              >
                {showResponseHeaders ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                Response Headers ({Object.keys(response.headers).length})
              </button>
              {showResponseHeaders && (
                <div
                  style={{
                    padding: 8,
                    background: "var(--vp-bg-surface)",
                    borderRadius: "var(--vp-radius-md)",
                    marginTop: 4,
                    border: "1px solid var(--vp-border-light)",
                  }}
                >
                  {Object.entries(response.headers).map(([key, val]) => (
                    <div
                      key={key}
                      style={{
                        display: "flex",
                        gap: 8,
                        fontSize: 10,
                        fontFamily: "monospace",
                        lineHeight: 1.6,
                      }}
                    >
                      <span style={{ color: "var(--vp-text-muted)", fontWeight: 600, flexShrink: 0 }}>
                        {key}:
                      </span>
                      <span style={{ color: "var(--vp-text-dim)", wordBreak: "break-all" }}>{val}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* History sidebar */}
      {showHistory && (
        <div
          style={{
            width: 220,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            gap: 4,
            borderLeft: "1px solid var(--vp-border-light)",
            paddingLeft: 8,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 2,
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--vp-text-primary)" }}>
              History
            </span>
            <button
              onClick={() => setShowHistory(false)}
              style={{ ...btnStyle, color: "var(--vp-text-faint)" }}
            >
              <X size={12} />
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
            {history.length === 0 && (
              <div style={{ color: "var(--vp-text-faint)", fontSize: 10, textAlign: "center", padding: 12 }}>
                No requests yet
              </div>
            )}
            {history.map((entry) => (
              <div
                key={entry.id}
                onClick={() => loadFromHistory(entry)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "5px 6px",
                  borderRadius: "var(--vp-radius-sm)",
                  cursor: "pointer",
                  background: "var(--vp-bg-surface)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--vp-bg-surface-hover)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "var(--vp-bg-surface)";
                }}
              >
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: getMethodColor(entry.method),
                    flexShrink: 0,
                    width: 32,
                    textAlign: "center",
                  }}
                >
                  {entry.method}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--vp-text-secondary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {entry.url}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 600,
                    color: getStatusColor(entry.status),
                    flexShrink: 0,
                  }}
                >
                  {entry.status}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePin(entry.id);
                  }}
                  style={{
                    ...btnStyle,
                    padding: 2,
                    color: entry.pinned ? "var(--vp-accent-amber)" : "var(--vp-text-faint)",
                  }}
                  title={entry.pinned ? "Unpin" : "Pin"}
                >
                  <Pin size={9} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeHistory(entry.id);
                  }}
                  style={{ ...btnStyle, padding: 2, color: "var(--vp-text-faint)" }}
                  title="Remove"
                >
                  <Trash2 size={9} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Spinner animation */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
