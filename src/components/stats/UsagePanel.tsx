import { useEffect, useState, useRef } from "react";
import { RefreshCw } from "lucide-react";
import { invoke } from "../../lib/ipc";
import { UsageResponse, ProviderUsage } from "../../types/usage";
import claudeLogo from "../../assets/logos/claude.png";
import geminiLogo from "../../assets/logos/gemini.svg";
import ampLogo from "../../assets/logos/amp.svg";

interface UsagePanelProps {
  onClose: () => void;
}

const PROVIDER_TABS = [
  { id: "claude", name: "Claude Code", logo: claudeLogo },
  { id: "gemini", name: "Gemini", logo: geminiLogo },
  { id: "amp", name: "AMP", logo: ampLogo },
];

export function UsagePanel({ onClose }: UsagePanelProps) {
  const [data, setData] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number>(0);
  const [selectedTab, setSelectedTab] = useState<string>("claude");
  const panelRef = useRef<HTMLDivElement>(null);

  const fetchUsage = async () => {
    setLoading(true);
    try {
      const response = await invoke<UsageResponse>("fetch_usage");
      setData(response);
      setLastUpdated(Date.now());
    } catch (err) {
      console.error("[UsagePanel] Failed to fetch usage:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsage();

    // Auto-refresh every 60s
    const interval = setInterval(fetchUsage, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const formatTime = (ms: number) => {
    if (!ms) return "";
    const seconds = Math.floor((Date.now() - ms) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  // Filter providers by selected tab
  const selectedProviders = data?.providers.filter((p) => {
    if (selectedTab === "claude") {
      return p.id.startsWith("claude-");
    } else if (selectedTab === "gemini") {
      return p.id === "gemini";
    } else if (selectedTab === "amp") {
      return p.id === "amp";
    }
    return false;
  }) || [];

  return (
    <div
      ref={panelRef}
      style={{
        position: "absolute",
        top: "calc(100% + 8px)",
        right: 0,
        width: 360,
        maxHeight: 520,
        background: "var(--vp-bg-secondary)",
        border: "1px solid var(--vp-border-light)",
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: "0 8px 32px var(--vp-bg-overlay)",
        zIndex: 1000,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--vp-bg-surface-hover)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--vp-text-primary)" }}>AI Usage</div>
          {lastUpdated > 0 && (
            <div style={{ fontSize: 10, color: "var(--vp-text-dim)", marginTop: 2 }}>
              {formatTime(lastUpdated)}
            </div>
          )}
        </div>
        <button
          onClick={fetchUsage}
          disabled={loading}
          style={{
            background: "transparent",
            border: "1px solid var(--vp-border-light)",
            borderRadius: 6,
            padding: 6,
            cursor: loading ? "default" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: loading ? 0.5 : 1,
          }}
        >
          <RefreshCw
            size={12}
            style={{
              color: "var(--vp-text-muted)",
              animation: loading ? "spin 1s linear infinite" : "none",
            }}
          />
        </button>
      </div>

      {/* Provider Tabs */}
      <div
        style={{
          display: "flex",
          gap: 8,
          padding: "12px 16px",
          borderBottom: "1px solid var(--vp-bg-surface-hover)",
          background: "rgba(0,0,0,0.2)",
        }}
      >
        {PROVIDER_TABS.map((tab) => {
          const isActive = selectedTab === tab.id;
          const hasData = data?.providers.some((p) =>
            tab.id === "claude" ? p.id.startsWith("claude-") : p.id === tab.id
          );

          return (
            <button
              key={tab.id}
              onClick={() => setSelectedTab(tab.id)}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                padding: "10px 8px",
                background: isActive
                  ? "var(--vp-accent-blue-bg-hover)"
                  : "var(--vp-bg-surface)",
                border: `1px solid ${
                  isActive ? "var(--vp-accent-blue-border)" : "var(--vp-bg-surface-hover)"
                }`,
                borderRadius: 8,
                cursor: "pointer",
                transition: "all 0.2s",
                position: "relative",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = "var(--vp-bg-surface-hover)";
                  e.currentTarget.style.borderColor = "var(--vp-border-medium)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = "var(--vp-bg-surface)";
                  e.currentTarget.style.borderColor = "var(--vp-bg-surface-hover)";
                }
              }}
            >
              <img
                src={tab.logo}
                alt={tab.name}
                style={{
                  width: 24,
                  height: 24,
                  opacity: isActive ? 1 : 0.6,
                }}
              />
              <span
                style={{
                  fontSize: 11,
                  fontWeight: isActive ? 500 : 400,
                  color: isActive ? "var(--vp-accent-blue)" : "var(--vp-text-muted)",
                }}
              >
                {tab.name}
              </span>
              {hasData && !isActive && (
                <div
                  style={{
                    position: "absolute",
                    top: 8,
                    right: 8,
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "var(--vp-accent-green-bright)",
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div style={{ maxHeight: 360, overflowY: "auto", padding: "8px 0" }}>
        {loading && !data ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--vp-text-dim)", fontSize: 12 }}>
            Loading usage data...
          </div>
        ) : selectedProviders.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {selectedProviders.map((provider) => (
              <ProviderCard key={provider.id} provider={provider} />
            ))}
          </div>
        ) : (
          <div style={{ padding: 40, textAlign: "center", color: "var(--vp-text-dim)", fontSize: 12 }}>
            No usage data available for {PROVIDER_TABS.find(t => t.id === selectedTab)?.name}
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "8px 16px",
          borderTop: "1px solid var(--vp-bg-surface-hover)",
          fontSize: 10,
          color: "var(--vp-text-faint)",
          textAlign: "center",
        }}
      >
        Powered by CodexBar
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

function ProviderCard({ provider }: { provider: ProviderUsage }) {
  const [expanded, setExpanded] = useState(false);

  if (provider.error) {
    return (
      <div
        style={{
          margin: "0 8px",
          padding: 12,
          background: "var(--vp-accent-red-bg)",
          border: "1px solid var(--vp-accent-red-border)",
          borderRadius: 8,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 500, color: "var(--vp-accent-red)" }}>
          {provider.name}
        </div>
        <div style={{ fontSize: 10, color: "var(--vp-text-dim)", marginTop: 4 }}>
          {provider.error}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        margin: "0 8px",
        padding: 12,
        background: "var(--vp-bg-surface)",
        border: "1px solid var(--vp-bg-surface-hover)",
        borderRadius: 8,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 500, color: "var(--vp-text-primary)", marginBottom: 8 }}>
        {provider.name}
      </div>

      {/* Rate limits */}
      {provider.rateLimits?.windows.map((window, idx) => {
        const colors = getUtilizationColor(window.utilization);
        const percent = Math.round(window.utilization * 100);

        return (
          <div key={idx} style={{ marginBottom: 8 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 4,
              }}
            >
              <span style={{ fontSize: 10, color: "var(--vp-text-muted)" }}>{window.name}</span>
              <span style={{ fontSize: 10, color: colors.text, fontWeight: 500 }}>
                {percent}%
              </span>
            </div>
            <div
              style={{
                height: 6,
                background: colors.bg,
                borderRadius: 3,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${percent}%`,
                  height: "100%",
                  background: colors.bar,
                  transition: "width 0.3s",
                }}
              />
            </div>
            {window.resetsAt && (
              <div style={{ fontSize: 9, color: "var(--vp-text-dim)", marginTop: 2 }}>
                {formatResetTime(window.resetsAt)}
              </div>
            )}
          </div>
        );
      })}

      {/* Cost */}
      {provider.cost && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, color: "var(--vp-accent-green-bright)", fontWeight: 600 }}>
            ${provider.cost.total.toFixed(2)}
          </div>
          <div style={{ fontSize: 9, color: "var(--vp-text-dim)" }}>{provider.cost.period}</div>

          {provider.cost.breakdown && provider.cost.breakdown.length > 0 && (
            <>
              <button
                onClick={() => setExpanded(!expanded)}
                style={{
                  marginTop: 6,
                  fontSize: 9,
                  color: "var(--vp-accent-blue)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                {expanded ? "Hide" : "Show"} breakdown
              </button>
              {expanded && (
                <div
                  style={{
                    marginTop: 6,
                    paddingTop: 6,
                    borderTop: "1px solid var(--vp-bg-surface-hover)",
                  }}
                >
                  {provider.cost.breakdown.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: 9,
                        color: "var(--vp-text-muted)",
                        marginBottom: 2,
                      }}
                    >
                      <span>{item.model}</span>
                      <span>${item.cost.toFixed(4)}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Quota */}
      {provider.quota && (
        <div style={{ marginTop: 8 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 4,
            }}
          >
            <span style={{ fontSize: 10, color: "var(--vp-text-muted)" }}>{provider.quota.period}</span>
            <span style={{ fontSize: 10, color: "var(--vp-accent-blue)", fontWeight: 500 }}>
              {provider.quota.used} / {provider.quota.limit}
            </span>
          </div>
          <div
            style={{
              height: 6,
              background: "var(--vp-accent-blue-bg-hover)",
              borderRadius: 3,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${Math.min(100, (provider.quota.used / provider.quota.limit) * 100)}%`,
                height: "100%",
                background: "var(--vp-accent-blue)",
                transition: "width 0.3s",
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function getUtilizationColor(utilization: number) {
  if (utilization < 0.5) return { bg: "rgba(34,197,94,0.15)", bar: "var(--vp-accent-green-bright)", text: "var(--vp-accent-green-bright)" };
  if (utilization < 0.75) return { bg: "rgba(234,179,8,0.15)", bar: "#eab308", text: "#eab308" };
  if (utilization < 0.9) return { bg: "rgba(249,115,22,0.15)", bar: "var(--vp-accent-orange)", text: "var(--vp-accent-orange)" };
  return { bg: "rgba(239,68,68,0.15)", bar: "var(--vp-accent-red)", text: "var(--vp-accent-red)" };
}

function formatResetTime(isoString?: string) {
  if (!isoString) return "";
  const target = new Date(isoString).getTime();
  const now = Date.now();
  const diff = target - now;

  if (diff <= 0) return "Resetting soon";

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;

  if (days > 0) {
    return `Resets in ${days}d ${remainingHours}h`;
  }
  if (hours > 0) {
    return `Resets in ${hours}h ${minutes}m`;
  }
  return `Resets in ${minutes}m`;
}
