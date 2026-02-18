import { useEffect, useState, useCallback, useRef } from "react";
import { invoke } from "../../../lib/ipc";
import { useUIStore } from "../../../stores/uiStore";
import type { DependencyDashboardConfig } from "../../../types/widget";
import {
  Package,
  RefreshCw,
  AlertTriangle,
  Search,
  Shield,
  ArrowUpCircle,
} from "lucide-react";

type OutdatedEntry = {
  current: string;
  wanted: string;
  latest: string;
  type: string;
};

type VulnEntry = {
  severity: string;
  name: string;
  title?: string;
  url?: string;
};

type TabId = "all" | "outdated" | "vulnerabilities";

export default function DependencyDashboardWidget({
  widgetId: _widgetId,
  config: _config = {},
}: {
  widgetId: string;
  config?: DependencyDashboardConfig;
}) {
  const projectPath = useUIStore((s) => s.selectedProject?.path) || "";

  const [deps, setDeps] = useState<Record<string, string>>({});
  const [devDeps, setDevDeps] = useState<Record<string, string>>({});
  const [outdated, setOutdated] = useState<Record<string, OutdatedEntry>>({});
  const [audit, setAudit] = useState<Record<string, VulnEntry>>({});
  const [activeTab, setActiveTab] = useState<TabId>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [slowLoading, setSlowLoading] = useState(false);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadPackageJson = useCallback(async () => {
    if (!projectPath) return;
    try {
      const raw = await invoke<string>("read_file", {
        filePath: projectPath + "/package.json",
      });
      const pkg = JSON.parse(raw);
      if (mountedRef.current) {
        setDeps(pkg.dependencies || {});
        setDevDeps(pkg.devDependencies || {});
      }
    } catch (e) {
      console.error("Failed to read package.json", e);
      if (mountedRef.current) {
        setDeps({});
        setDevDeps({});
      }
    }
  }, [projectPath]);

  const loadSlowData = useCallback(async () => {
    if (!projectPath) return;
    setSlowLoading(true);
    try {
      const [outdatedRes, auditRes] = await Promise.allSettled([
        invoke<{ outdated: Record<string, OutdatedEntry> }>(
          "check_outdated_packages",
          { projectPath }
        ),
        invoke<{ audit: { vulnerabilities?: Record<string, VulnEntry> } }>(
          "check_npm_audit",
          { projectPath }
        ),
      ]);

      if (!mountedRef.current) return;

      if (outdatedRes.status === "fulfilled") {
        setOutdated(outdatedRes.value.outdated || {});
      } else {
        console.error("check_outdated_packages failed", outdatedRes.reason);
        setOutdated({});
      }

      if (auditRes.status === "fulfilled") {
        const vulns = auditRes.value.audit?.vulnerabilities || {};
        setAudit(vulns);
      } else {
        console.error("check_npm_audit failed", auditRes.reason);
        setAudit({});
      }
    } finally {
      if (mountedRef.current) setSlowLoading(false);
    }
  }, [projectPath]);

  const refresh = useCallback(async () => {
    if (!projectPath) return;
    setLoading(true);
    await loadPackageJson();
    if (mountedRef.current) setLoading(false);
    loadSlowData();
  }, [projectPath, loadPackageJson, loadSlowData]);

  // On mount + polling
  useEffect(() => {
    if (!projectPath) return;
    refresh();
    const interval = setInterval(refresh, 60000);
    return () => clearInterval(interval);
  }, [projectPath, refresh]);

  // --- Derived data ---
  const allDeps = { ...deps, ...devDeps };
  const allDepNames = Object.keys(allDeps).filter((name) =>
    name.toLowerCase().includes(search.toLowerCase())
  );

  const outdatedNames = Object.keys(outdated).filter((name) =>
    name.toLowerCase().includes(search.toLowerCase())
  );

  const vulnEntries = Object.values(audit).filter((v) =>
    v.name.toLowerCase().includes(search.toLowerCase())
  );

  const totalDeps = Object.keys(allDeps).length;
  const totalOutdated = Object.keys(outdated).length;
  const totalVulns = Object.keys(audit).length;

  // --- Helpers ---
  function getVersionBadge(name: string): {
    color: string;
    bg: string;
    label: string;
  } {
    const entry = outdated[name];
    if (!entry) {
      return {
        color: "var(--vp-accent-green)",
        bg: "rgba(74, 222, 128, 0.1)",
        label: "up to date",
      };
    }
    const currentMajor = entry.current.split(".")[0];
    const latestMajor = entry.latest.split(".")[0];
    if (currentMajor !== latestMajor) {
      return {
        color: "var(--vp-accent-red-text)",
        bg: "rgba(248, 113, 113, 0.1)",
        label: "major",
      };
    }
    return {
      color: "var(--vp-accent-amber)",
      bg: "rgba(251, 191, 36, 0.1)",
      label: "minor",
    };
  }

  function severityColor(severity: string): {
    color: string;
    bg: string;
  } {
    switch (severity) {
      case "critical":
      case "high":
        return {
          color: "var(--vp-accent-red-text)",
          bg: "rgba(248, 113, 113, 0.1)",
        };
      case "moderate":
        return {
          color: "var(--vp-accent-amber)",
          bg: "rgba(251, 191, 36, 0.1)",
        };
      case "low":
      default:
        return {
          color: "var(--vp-accent-blue)",
          bg: "rgba(96, 165, 250, 0.1)",
        };
    }
  }

  // --- No project state ---
  if (!projectPath) {
    return (
      <div
        className="h-full flex flex-col items-center justify-center gap-2"
        style={{ color: "var(--vp-text-dim)" }}
      >
        <Package size={20} />
        <span style={{ fontSize: 12 }}>No project selected</span>
      </div>
    );
  }

  // --- Loading skeleton ---
  if (loading && totalDeps === 0) {
    return (
      <div
        className="h-full flex flex-col items-center justify-center gap-3"
        style={{ padding: 16 }}
      >
        {[80, 60, 70, 50].map((w, i) => (
          <div
            key={i}
            style={{
              width: `${w}%`,
              height: 10,
              borderRadius: "var(--vp-radius-md)",
              background: "var(--vp-bg-surface-hover)",
              animation: "pulse 1.5s ease-in-out infinite",
              animationDelay: `${i * 0.2}s`,
            }}
          />
        ))}
        <style>{`@keyframes pulse { 0%,100% { opacity: 0.3; } 50% { opacity: 0.7; } }`}</style>
      </div>
    );
  }

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: "all", label: "All", count: totalDeps },
    { id: "outdated", label: "Outdated", count: totalOutdated },
    { id: "vulnerabilities", label: "Vulnerabilities", count: totalVulns },
  ];

  return (
    <div className="h-full flex flex-col" style={{ overflow: "hidden" }}>
      {/* Tab bar */}
      <div
        style={{
          padding: "6px 8px",
          borderBottom: "1px solid var(--vp-bg-surface-hover)",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "3px 8px",
              fontSize: 10,
              fontWeight: activeTab === tab.id ? 600 : 400,
              borderRadius: "var(--vp-radius-sm)",
              border: "none",
              background:
                activeTab === tab.id
                  ? "var(--vp-bg-surface-hover)"
                  : "transparent",
              color:
                activeTab === tab.id
                  ? "var(--vp-text-primary)"
                  : "var(--vp-text-muted)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                style={{
                  fontSize: 9,
                  background:
                    activeTab === tab.id
                      ? "var(--vp-bg-surface)"
                      : "var(--vp-bg-surface-hover)",
                  borderRadius: "var(--vp-radius-lg)",
                  padding: "1px 5px",
                  color: "var(--vp-text-faint)",
                }}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}

        <div style={{ flex: 1 }} />

        {/* Search input */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            background: "var(--vp-bg-surface)",
            borderRadius: "var(--vp-radius-sm)",
            padding: "2px 6px",
            border: "1px solid var(--vp-border-light)",
          }}
        >
          <Search
            size={10}
            style={{ color: "var(--vp-text-faint)", marginRight: 4 }}
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter..."
            style={{
              border: "none",
              background: "transparent",
              outline: "none",
              color: "var(--vp-text-primary)",
              fontSize: 10,
              width: 70,
            }}
          />
        </div>

        {/* Refresh button */}
        <button
          onClick={refresh}
          disabled={loading || slowLoading}
          style={{
            background: "none",
            border: "none",
            color: "var(--vp-text-faint)",
            cursor: "pointer",
            padding: 2,
          }}
          title="Refresh"
        >
          <RefreshCw
            size={12}
            className={loading || slowLoading ? "animate-spin" : ""}
          />
        </button>
      </div>

      {/* Slow-loading indicator */}
      {slowLoading && (
        <div
          style={{
            padding: "4px 10px",
            fontSize: 9,
            color: "var(--vp-text-faint)",
            background: "var(--vp-bg-surface)",
            borderBottom: "1px solid var(--vp-bg-surface-hover)",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <RefreshCw size={9} className="animate-spin" />
          Checking outdated packages and vulnerabilities...
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 overflow-auto" style={{ padding: "6px 10px" }}>
        {/* All tab */}
        {activeTab === "all" && (
          <div>
            {allDepNames.length === 0 ? (
              <div
                style={{
                  color: "var(--vp-text-faint)",
                  fontSize: 11,
                  textAlign: "center",
                  marginTop: 20,
                }}
              >
                No dependencies found
              </div>
            ) : (
              allDepNames.sort().map((name) => {
                const badge = getVersionBadge(name);
                const isDevDep = name in devDeps;
                const currentVersion = allDeps[name];
                const outdatedEntry = outdated[name];

                return (
                  <div
                    key={name}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "4px 0",
                      borderBottom: "1px solid var(--vp-bg-surface)",
                      fontSize: 11,
                    }}
                  >
                    <Package
                      size={10}
                      style={{ color: "var(--vp-text-faint)", flexShrink: 0 }}
                    />
                    <span
                      style={{
                        color: "var(--vp-text-primary)",
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={name}
                    >
                      {name}
                    </span>
                    {isDevDep && (
                      <span
                        style={{
                          fontSize: 8,
                          padding: "1px 4px",
                          borderRadius: "var(--vp-radius-xs)",
                          background: "var(--vp-bg-surface-hover)",
                          color: "var(--vp-text-faint)",
                          flexShrink: 0,
                        }}
                      >
                        dev
                      </span>
                    )}
                    <span
                      style={{
                        fontSize: 10,
                        color: "var(--vp-text-secondary)",
                        flexShrink: 0,
                      }}
                    >
                      {currentVersion}
                    </span>
                    {outdatedEntry && (
                      <>
                        <ArrowUpCircle
                          size={10}
                          style={{ color: badge.color, flexShrink: 0 }}
                        />
                        <span
                          style={{
                            fontSize: 10,
                            color: badge.color,
                            flexShrink: 0,
                          }}
                        >
                          {outdatedEntry.latest}
                        </span>
                      </>
                    )}
                    <span
                      style={{
                        fontSize: 8,
                        padding: "1px 5px",
                        borderRadius: "var(--vp-radius-lg)",
                        background: badge.bg,
                        color: badge.color,
                        flexShrink: 0,
                      }}
                    >
                      {badge.label}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Outdated tab */}
        {activeTab === "outdated" && (
          <div>
            {outdatedNames.length === 0 ? (
              <div
                style={{
                  color: "var(--vp-text-faint)",
                  fontSize: 11,
                  textAlign: "center",
                  marginTop: 20,
                }}
              >
                {slowLoading ? (
                  "Checking..."
                ) : (
                  <>
                    <ArrowUpCircle
                      size={16}
                      style={{
                        marginBottom: 4,
                        opacity: 0.5,
                        color: "var(--vp-accent-green)",
                      }}
                    />
                    <div>All packages are up to date</div>
                  </>
                )}
              </div>
            ) : (
              outdatedNames.sort().map((name) => {
                const entry = outdated[name];
                const badge = getVersionBadge(name);

                return (
                  <div
                    key={name}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "5px 0",
                      borderBottom: "1px solid var(--vp-bg-surface)",
                      fontSize: 11,
                    }}
                  >
                    <ArrowUpCircle
                      size={12}
                      style={{ color: badge.color, flexShrink: 0 }}
                    />
                    <span
                      style={{
                        color: "var(--vp-text-primary)",
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={name}
                    >
                      {name}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        color: "var(--vp-text-muted)",
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        gap: 3,
                      }}
                    >
                      <span style={{ color: "var(--vp-text-dim)" }}>
                        {entry.current}
                      </span>
                      <span style={{ color: "var(--vp-text-faint)" }}>
                        {"\u2192"}
                      </span>
                      <span style={{ color: "var(--vp-accent-amber)" }}>
                        {entry.wanted}
                      </span>
                      <span style={{ color: "var(--vp-text-faint)" }}>
                        {"\u2192"}
                      </span>
                      <span style={{ color: badge.color, fontWeight: 600 }}>
                        {entry.latest}
                      </span>
                    </span>
                    <span
                      style={{
                        fontSize: 8,
                        padding: "1px 5px",
                        borderRadius: "var(--vp-radius-lg)",
                        background: badge.bg,
                        color: badge.color,
                        flexShrink: 0,
                      }}
                    >
                      {entry.type}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Vulnerabilities tab */}
        {activeTab === "vulnerabilities" && (
          <div>
            {vulnEntries.length === 0 ? (
              <div
                style={{
                  color: "var(--vp-text-faint)",
                  fontSize: 11,
                  textAlign: "center",
                  marginTop: 20,
                }}
              >
                {slowLoading ? (
                  "Running audit..."
                ) : (
                  <>
                    <Shield
                      size={16}
                      style={{
                        marginBottom: 4,
                        opacity: 0.5,
                        color: "var(--vp-accent-green)",
                      }}
                    />
                    <div>No vulnerabilities found</div>
                  </>
                )}
              </div>
            ) : (
              vulnEntries.map((vuln, i) => {
                const sev = severityColor(vuln.severity);

                return (
                  <div
                    key={`${vuln.name}-${i}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "5px 0",
                      borderBottom: "1px solid var(--vp-bg-surface)",
                      fontSize: 11,
                    }}
                  >
                    <AlertTriangle
                      size={11}
                      style={{ color: sev.color, flexShrink: 0 }}
                    />
                    <span
                      style={{
                        fontSize: 8,
                        padding: "1px 5px",
                        borderRadius: "var(--vp-radius-lg)",
                        background: sev.bg,
                        color: sev.color,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        flexShrink: 0,
                      }}
                    >
                      {vuln.severity}
                    </span>
                    <span
                      style={{
                        color: "var(--vp-text-primary)",
                        fontWeight: 500,
                        flexShrink: 0,
                      }}
                    >
                      {vuln.name}
                    </span>
                    {vuln.title && (
                      <span
                        style={{
                          color: "var(--vp-text-muted)",
                          fontSize: 10,
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={vuln.title}
                      >
                        {vuln.title}
                      </span>
                    )}
                    {vuln.url && (
                      <a
                        href={vuln.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: 9,
                          color: "var(--vp-accent-blue)",
                          flexShrink: 0,
                          textDecoration: "none",
                        }}
                      >
                        details
                      </a>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "5px 10px",
          borderTop: "1px solid var(--vp-bg-surface-hover)",
          fontSize: 9,
          color: "var(--vp-text-faint)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
          <Package size={9} />
          {totalDeps} deps
        </span>
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 3,
            color:
              totalOutdated > 0
                ? "var(--vp-accent-amber)"
                : "var(--vp-text-faint)",
          }}
        >
          <ArrowUpCircle size={9} />
          {totalOutdated} outdated
        </span>
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 3,
            color:
              totalVulns > 0
                ? "var(--vp-accent-red-text)"
                : "var(--vp-text-faint)",
          }}
        >
          <Shield size={9} />
          {totalVulns} vulnerabilities
        </span>
      </div>
    </div>
  );
}
