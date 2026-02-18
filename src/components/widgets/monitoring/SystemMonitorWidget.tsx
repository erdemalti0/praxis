import { useEffect, useState, useRef, useMemo } from "react";
import { invoke } from "../../../lib/ipc";
import type { SystemMonitorConfig } from "../../../types/widget";
import { Settings, AlertTriangle } from "lucide-react";
import { useWidgetStore } from "../../../stores/widgetStore";

interface SystemStats {
  cpuUsage: number;
  memUsed: number;
  memTotal: number;
  diskUsed: number;
  diskTotal: number;
  netRx?: number;
  netTx?: number;
}

interface HistoryPoint {
  cpu: number;
  mem: number;
  disk: number;
  netRx: number;
  netTx: number;
}

function Sparkline({ data, color, height = 24 }: { data: number[]; color: string; height?: number }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const width = data.length * 3;
  const points = data.map((v, i) => {
    const x = i * 3;
    const y = height - (v / max) * (height - 4);
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Gauge({
  label,
  value,
  max,
  color,
  history,
  alertThreshold,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  history?: number[];
  alertThreshold?: number;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  const isAlert = alertThreshold !== undefined && pct >= alertThreshold;

  return (
    <div style={{ marginBottom: 12 }}>
      <div className="flex justify-between items-center" style={{ marginBottom: 4 }}>
        <div className="flex items-center gap-1">
          <span style={{ fontSize: 11, color: isAlert ? "var(--vp-accent-red-text)" : "var(--vp-text-muted)" }}>{label}</span>
          {isAlert && <AlertTriangle size={10} style={{ color: "var(--vp-accent-red-text)" }} />}
        </div>
        <span style={{ fontSize: 11, color: isAlert ? "var(--vp-accent-red-text)" : "var(--vp-text-secondary)", fontWeight: 500 }}>
          {pct.toFixed(1)}%
        </span>
      </div>
      <div style={{ height: 6, background: "var(--vp-bg-surface-hover)", borderRadius: "var(--vp-radius-xs)", marginBottom: 4 }}>
        <div
          style={{
            height: "100%",
            width: `${Math.min(pct, 100)}%`,
            background: isAlert ? "var(--vp-accent-red-text)" : color,
            borderRadius: "var(--vp-radius-xs)",
            transition: "width 0.5s, background 0.3s",
          }}
        />
      </div>
      {history && history.length > 1 && (
        <div style={{ opacity: 0.7 }}>
          <Sparkline data={history} color={color} height={20} />
        </div>
      )}
    </div>
  );
}

function NetworkGauge({ rx, tx }: { rx: number; tx: number }) {
  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B/s`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB/s`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB/s`;
  };

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: "var(--vp-text-muted)", marginBottom: 6 }}>Network I/O</div>
      <div className="flex justify-between" style={{ gap: 12 }}>
        <div style={{ flex: 1, background: "var(--vp-bg-surface)", borderRadius: "var(--vp-radius-md)", padding: "6px 8px" }}>
          <div style={{ fontSize: 9, color: "var(--vp-accent-green)", marginBottom: 2 }}>↓ RX</div>
          <div style={{ fontSize: 11, color: "var(--vp-text-secondary)", fontFamily: "monospace" }}>{formatBytes(rx)}</div>
        </div>
        <div style={{ flex: 1, background: "var(--vp-bg-surface)", borderRadius: "var(--vp-radius-md)", padding: "6px 8px" }}>
          <div style={{ fontSize: 9, color: "var(--vp-accent-blue)", marginBottom: 2 }}>↑ TX</div>
          <div style={{ fontSize: 11, color: "var(--vp-text-secondary)", fontFamily: "monospace" }}>{formatBytes(tx)}</div>
        </div>
      </div>
    </div>
  );
}

function SettingsPanel({
  config,
  onConfigChange,
  onClose,
}: {
  config: SystemMonitorConfig;
  onConfigChange: (cfg: Partial<SystemMonitorConfig>) => void;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: 36,
        right: 8,
        background: "var(--vp-bg-secondary)",
        border: "1px solid var(--vp-border-light)",
        borderRadius: "var(--vp-radius-lg)",
        padding: 12,
        width: 200,
        zIndex: 10,
      }}
    >
      <div className="flex justify-between items-center" style={{ marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--vp-text-primary)" }}>Settings</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--vp-text-dim)", cursor: "pointer", padding: 2 }}>
          ✕
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label className="flex items-center gap-2" style={{ fontSize: 11, color: "var(--vp-text-secondary)", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={config.showNetworkIO ?? true}
            onChange={(e) => onConfigChange({ showNetworkIO: e.target.checked })}
            style={{ accentColor: "var(--vp-accent-blue)" }}
          />
          Show Network I/O
        </label>
        <label className="flex items-center gap-2" style={{ fontSize: 11, color: "var(--vp-text-secondary)", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={config.showDisk ?? true}
            onChange={(e) => onConfigChange({ showDisk: e.target.checked })}
            style={{ accentColor: "var(--vp-accent-blue)" }}
          />
          Show Disk Usage
        </label>
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 10, color: "var(--vp-text-dim)", marginBottom: 4 }}>Alert Thresholds (%)</div>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 10, color: "var(--vp-text-muted)" }}>CPU</label>
              <input
                type="number"
                value={config.alertThresholds?.cpu ?? 80}
                onChange={(e) =>
                  onConfigChange({
                    alertThresholds: { ...config.alertThresholds, cpu: parseInt(e.target.value) || 80 },
                  })
                }
                min={0}
                max={100}
                style={{
                  width: "100%",
                  background: "var(--vp-bg-surface-hover)",
                  border: "1px solid var(--vp-border-light)",
                  borderRadius: "var(--vp-radius-sm)",
                  padding: "4px 6px",
                  fontSize: 11,
                  color: "var(--vp-text-primary)",
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 10, color: "var(--vp-text-muted)" }}>Memory</label>
              <input
                type="number"
                value={config.alertThresholds?.mem ?? 85}
                onChange={(e) =>
                  onConfigChange({
                    alertThresholds: { ...config.alertThresholds, mem: parseInt(e.target.value) || 85 },
                  })
                }
                min={0}
                max={100}
                style={{
                  width: "100%",
                  background: "var(--vp-bg-surface-hover)",
                  border: "1px solid var(--vp-border-light)",
                  borderRadius: "var(--vp-radius-sm)",
                  padding: "4px 6px",
                  fontSize: 11,
                  color: "var(--vp-text-primary)",
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SystemMonitorWidget({
  widgetId,
  workspaceId,
  config = {},
}: {
  widgetId: string;
  workspaceId: string;
  config?: SystemMonitorConfig;
}) {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const historyRef = useRef<HistoryPoint[]>([]);
  const historyLength = config.historyLength ?? 60;

  const [showNetworkIO, setShowNetworkIO] = useState(config.showNetworkIO ?? true);
  const [showDisk, setShowDisk] = useState(config.showDisk ?? true);
  const [alertThresholds, setAlertThresholds] = useState(config.alertThresholds ?? { cpu: 80, mem: 85 });

  // Persist user preferences
  useEffect(() => {
    useWidgetStore.getState().updateWidgetConfig(workspaceId, widgetId, { showNetworkIO });
  }, [showNetworkIO, workspaceId, widgetId]);

  useEffect(() => {
    useWidgetStore.getState().updateWidgetConfig(workspaceId, widgetId, { showDisk });
  }, [showDisk, workspaceId, widgetId]);

  useEffect(() => {
    useWidgetStore.getState().updateWidgetConfig(workspaceId, widgetId, { alertThresholds });
  }, [alertThresholds, workspaceId, widgetId]);

  const cpuHistory = useMemo(() => historyRef.current.map((h) => h.cpu), [historyRef.current.length]);
  const memHistory = useMemo(() => historyRef.current.map((h) => h.mem), [historyRef.current.length]);
  const diskHistory = useMemo(() => historyRef.current.map((h) => h.disk), [historyRef.current.length]);

  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      try {
        const data = await invoke<SystemStats>("get_system_stats");
        if (mounted) {
          setStats(data);
          historyRef.current = [
            ...historyRef.current.slice(-(historyLength - 1)),
            {
              cpu: data.cpuUsage,
              mem: data.memTotal > 0 ? (data.memUsed / data.memTotal) * 100 : 0,
              disk: data.diskTotal > 0 ? (data.diskUsed / data.diskTotal) * 100 : 0,
              netRx: data.netRx ?? 0,
              netTx: data.netTx ?? 0,
            },
          ];
        }
      } catch {}
    };
    poll();
    const interval = setInterval(poll, config.refreshInterval ?? 3000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [config.refreshInterval, historyLength]);

  if (!stats)
    return (
      <div className="h-full flex items-center justify-center" style={{ color: "var(--vp-text-faint)", fontSize: 12 }}>
        Loading...
      </div>
    );

  return (
    <div className="h-full overflow-auto" style={{ position: "relative" }}>
      <div className="flex justify-end" style={{ padding: "4px 8px" }}>
        <button
          onClick={() => setShowSettings(!showSettings)}
          style={{
            background: showSettings ? "var(--vp-border-light)" : "none",
            border: "none",
            color: showSettings ? "var(--vp-text-primary)" : "var(--vp-text-dim)",
            cursor: "pointer",
            padding: 4,
            borderRadius: "var(--vp-radius-sm)",
          }}
          title="Settings"
        >
          <Settings size={14} />
        </button>
      </div>

      {showSettings && (
        <SettingsPanel
          config={{ ...config, showNetworkIO, showDisk, alertThresholds }}
          onConfigChange={(cfg) => {
            if (cfg.showNetworkIO !== undefined) setShowNetworkIO(cfg.showNetworkIO);
            if (cfg.showDisk !== undefined) setShowDisk(cfg.showDisk);
            if (cfg.alertThresholds !== undefined) setAlertThresholds(cfg.alertThresholds);
          }}
          onClose={() => setShowSettings(false)}
        />
      )}

      <div style={{ padding: "0 12px 12px" }}>
        <Gauge
          label="CPU"
          value={stats.cpuUsage}
          max={100}
          color="var(--vp-accent-blue)"
          history={cpuHistory}
          alertThreshold={alertThresholds.cpu}
        />
        <Gauge
          label="Memory"
          value={stats.memUsed}
          max={stats.memTotal}
          color="#a78bfa"
          history={memHistory}
          alertThreshold={alertThresholds.mem}
        />
        {showDisk && (
          <Gauge
            label="Disk"
            value={stats.diskUsed}
            max={stats.diskTotal}
            color="var(--vp-accent-green)"
            history={diskHistory}
          />
        )}
        {showNetworkIO && <NetworkGauge rx={stats.netRx ?? 0} tx={stats.netTx ?? 0} />}
      </div>
    </div>
  );
}
