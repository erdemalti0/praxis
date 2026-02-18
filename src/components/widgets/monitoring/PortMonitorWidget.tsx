import { useEffect, useRef, useState } from "react";
import { invoke } from "../../../lib/ipc";
import type { PortMonitorConfig } from "../../../types/widget";
import { RefreshCw, Filter, XCircle } from "lucide-react";
import { useWidgetStore } from "../../../stores/widgetStore";

interface PortEntry {
  port: number;
  pid: number;
  process: string;
  protocol: string;
  state?: string;
  localAddress?: string;
}


export default function PortMonitorWidget({
  widgetId,
  workspaceId,
  config = {},
}: {
  widgetId: string;
  workspaceId: string;
  config?: PortMonitorConfig;
}) {
  const [ports, setPorts] = useState<PortEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterProtocol, setFilterProtocol] = useState<"all" | "tcp" | "udp">(
    config.filterProtocol ?? "all"
  );
  const [showFilters, setShowFilters] = useState(false);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [killing, setKilling] = useState<number | null>(null);

  // Persist user preferences
  useEffect(() => {
    useWidgetStore.getState().updateWidgetConfig(workspaceId, widgetId, { filterProtocol });
  }, [filterProtocol, workspaceId, widgetId]);

  const mountedRef = useRef(true);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  const fetchPorts = async () => {
    setLoading(true);
    try {
      const data = await invoke<PortEntry[]>("scan_ports");
      if (mountedRef.current) setPorts(data);
    } catch {}
    if (mountedRef.current) setLoading(false);
  };

  useEffect(() => {
    fetchPorts();
    const interval = setInterval(fetchPorts, config.refreshInterval ?? 5000);
    return () => clearInterval(interval);
  }, [config.refreshInterval]);

  const killPort = async (port: number) => {
    setKilling(port);
    try {
      await invoke("kill_port", { port });
      await fetchPorts();
    } catch (e) {
      console.error("Failed to kill port:", e);
    }
    setKilling(null);
  };

  const filteredPorts = ports.filter((p) => {
    if (filterProtocol !== "all" && !p.protocol.toLowerCase().includes(filterProtocol)) {
      return false;
    }
    if (!config.showSystemPorts && p.pid === 0) {
      return false;
    }
    return true;
  });

  const getProcessColor = (process: string) => {
    const proc = process.toLowerCase();
    if (proc.includes("node") || proc.includes("npm") || proc.includes("vite")) return "var(--vp-accent-green)";
    if (proc.includes("python")) return "var(--vp-accent-blue)";
    if (proc.includes("java")) return "var(--vp-accent-red-text)";
    if (proc.includes("nginx") || proc.includes("apache")) return "#a78bfa";
    return "var(--vp-text-muted)";
  };

  if (filteredPorts.length === 0 && !loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2" style={{ color: "var(--vp-text-faint)" }}>
        <span style={{ fontSize: 12 }}>No active ports</span>
        <button
          onClick={fetchPorts}
          style={{
            background: "var(--vp-bg-surface-hover)",
            border: "none",
            borderRadius: "var(--vp-radius-sm)",
            padding: "4px 8px",
            color: "var(--vp-text-muted)",
            cursor: "pointer",
            fontSize: 11,
          }}
        >
          Refresh
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div
        className="flex items-center gap-2"
        style={{ padding: "6px 8px", borderBottom: "1px solid var(--vp-bg-surface-hover)" }}
      >
        <button
          onClick={fetchPorts}
          disabled={loading}
          style={{
            background: "none",
            border: "none",
            color: loading ? "var(--vp-text-subtle)" : "var(--vp-text-muted)",
            cursor: loading ? "wait" : "pointer",
            padding: 4,
            display: "flex",
            alignItems: "center",
          }}
          title="Refresh"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
        </button>
        <button
          onClick={() => setShowFilters(!showFilters)}
          style={{
            background: showFilters || filterProtocol !== "all" ? "var(--vp-accent-blue-bg-hover)" : "none",
            border: "none",
            color: showFilters || filterProtocol !== "all" ? "var(--vp-accent-blue)" : "var(--vp-text-muted)",
            cursor: "pointer",
            padding: 4,
            display: "flex",
            alignItems: "center",
            borderRadius: "var(--vp-radius-sm)",
          }}
          title="Filter"
        >
          <Filter size={12} />
        </button>
        {filterProtocol !== "all" && (
          <span
            style={{
              fontSize: 10,
              color: "var(--vp-accent-blue)",
              background: "var(--vp-accent-blue-bg)",
              padding: "2px 6px",
              borderRadius: "var(--vp-radius-xs)",
            }}
          >
            {filterProtocol.toUpperCase()}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: "var(--vp-text-faint)" }}>{filteredPorts.length} ports</span>
      </div>

      {showFilters && (
        <div
          style={{
            padding: "6px 8px",
            borderBottom: "1px solid var(--vp-bg-surface-hover)",
            display: "flex",
            gap: 4,
          }}
        >
          {(["all", "tcp", "udp"] as const).map((proto) => (
            <button
              key={proto}
              onClick={() => setFilterProtocol(proto)}
              style={{
                padding: "3px 8px",
                fontSize: 10,
                borderRadius: "var(--vp-radius-sm)",
                background: filterProtocol === proto ? "var(--vp-border-light)" : "transparent",
                border: "1px solid var(--vp-border-subtle)",
                color: filterProtocol === proto ? "var(--vp-text-primary)" : "var(--vp-text-dim)",
                cursor: "pointer",
              }}
            >
              {proto.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-auto">
        <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ color: "var(--vp-text-dim)", borderBottom: "1px solid var(--vp-border-subtle)" }}>
              <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 500 }}>Port</th>
              <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 500 }}>PID</th>
              <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 500 }}>Process</th>
              <th style={{ textAlign: "center", padding: "6px 4px", fontWeight: 500, width: 24 }} />
            </tr>
          </thead>
          <tbody>
            {filteredPorts.map((p, i) => (
              <tr
                key={`${p.port}-${p.pid}-${i}`}
                style={{
                  borderBottom: "1px solid var(--vp-bg-surface)",
                  cursor: "pointer",
                  background: expandedRow === i ? "var(--vp-bg-surface)" : "transparent",
                }}
                onClick={() => setExpandedRow(expandedRow === i ? null : i)}
                onMouseEnter={(e) => {
                  if (expandedRow !== i) e.currentTarget.style.background = "var(--vp-bg-surface)";
                }}
                onMouseLeave={(e) => {
                  if (expandedRow !== i) e.currentTarget.style.background = "transparent";
                }}
              >
                <td style={{ padding: "5px 8px" }}>
                  <span
                    style={{ color: "var(--vp-accent-blue)", fontFamily: "monospace", cursor: "pointer" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(String(p.port));
                    }}
                    title="Click to copy"
                  >
                    {p.port}
                  </span>
                </td>
                <td style={{ padding: "5px 8px", color: "var(--vp-text-muted)", fontFamily: "monospace" }}>{p.pid}</td>
                <td style={{ padding: "5px 8px" }}>
                  <span style={{ color: getProcessColor(p.process) }}>{p.process}</span>
                </td>
                <td style={{ padding: "4px" }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      killPort(p.port);
                    }}
                    disabled={killing === p.port}
                    style={{
                      background: "none",
                      border: "none",
                      color: killing === p.port ? "var(--vp-text-subtle)" : "var(--vp-text-faint)",
                      cursor: killing === p.port ? "wait" : "pointer",
                      padding: 2,
                      display: "flex",
                      alignItems: "center",
                      borderRadius: "var(--vp-radius-sm)",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "var(--vp-accent-red-text)")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "var(--vp-text-faint)")}
                    title="Kill process"
                  >
                    <XCircle size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
