import { useEffect } from "react";
import { Globe, Square, RefreshCw, Activity } from "lucide-react";
import { useServicesStore } from "../../stores/servicesStore";
import { useUIStore } from "../../stores/uiStore";
import { useBrowserStore } from "../../stores/browserStore";

export default function ServicesPanel() {
  const services = useServicesStore((s) => s.services);
  const loading = useServicesStore((s) => s.loading);
  const refresh = useServicesStore((s) => s.refresh);
  const stopService = useServicesStore((s) => s.stopService);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  const openInBrowser = (port: number) => {
    const url = `http://localhost:${port}`;
    const store = useBrowserStore.getState();
    const uiStore = useUIStore.getState();
    // Create a new browser tab and navigate to the URL
    store.createLandingTab();
    const activeTabId = useBrowserStore.getState().activeBrowserTabId;
    if (activeTabId) {
      store.navigateTab(activeTabId, url);
    }
    uiStore.setViewMode("browser");
  };

  return (
    <div className="h-full flex flex-col" style={{ overflow: "hidden" }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ borderBottom: "1px solid var(--vp-border-subtle)", flexShrink: 0 }}
      >
        <span style={{ fontSize: 10, fontWeight: 600, color: "var(--vp-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Running Services
        </span>
        <div className="flex items-center gap-1">
          {services.length > 0 && (
            <button
              onClick={() => services.forEach((svc) => openInBrowser(svc.port))}
              title="Open all in browser"
              style={{
                height: 20, borderRadius: "var(--vp-radius-sm)", padding: "0 6px",
                background: "var(--vp-bg-surface)", border: "1px solid var(--vp-border-subtle)",
                color: "var(--vp-text-muted)", cursor: "pointer", fontSize: 9,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 3,
              }}
            >
              <Globe size={9} />
              All
            </button>
          )}
          <button
            onClick={refresh}
            title="Refresh"
            style={{
              width: 20, height: 20, borderRadius: "var(--vp-radius-sm)",
              background: "var(--vp-bg-surface)", border: "1px solid var(--vp-border-subtle)",
              color: "var(--vp-text-muted)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <RefreshCw size={10} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Service list */}
      <div className="flex-1 overflow-y-auto" style={{ padding: "4px 0" }}>
        {services.length === 0 && (
          <div className="flex flex-col items-center justify-center" style={{ padding: "24px 12px", color: "var(--vp-text-subtle)", textAlign: "center", gap: 6 }}>
            <Activity size={18} style={{ color: "var(--vp-text-subtle)" }} />
            <span style={{ fontSize: 11 }}>No services running</span>
          </div>
        )}

        {services.map((svc) => (
          <div
            key={`${svc.port}-${svc.pid}`}
            className="flex items-center gap-2"
            style={{
              padding: "6px 10px",
              transition: "background 0.1s",
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = "var(--vp-bg-surface)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
          >
            {/* Port badge */}
            <span style={{
              fontSize: 10, fontWeight: 600, color: "var(--vp-accent-blue)",
              background: "var(--vp-accent-blue-bg)",
              border: "1px solid var(--vp-accent-blue-border)",
              borderRadius: "var(--vp-radius-sm)", padding: "1px 6px",
              fontFamily: "monospace", flexShrink: 0,
            }}>
              :{svc.port}
            </span>

            {/* Process info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, color: "var(--vp-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {svc.process}
              </div>
              <div style={{ fontSize: 9, color: "var(--vp-text-faint)" }}>
                PID {svc.pid} · {svc.protocol}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1" style={{ flexShrink: 0 }}>
              <button
                onClick={() => openInBrowser(svc.port)}
                title="Open in Browser"
                style={{
                  width: 20, height: 20, borderRadius: "var(--vp-radius-sm)",
                  background: "var(--vp-bg-surface)", border: "1px solid var(--vp-border-subtle)",
                  color: "var(--vp-text-muted)", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <Globe size={9} />
              </button>
              <button
                onClick={() => stopService(svc.pid)}
                title="Stop service"
                style={{
                  width: 20, height: 20, borderRadius: "var(--vp-radius-sm)",
                  background: "var(--vp-accent-red-bg)", border: "1px solid var(--vp-accent-red-border)",
                  color: "var(--vp-accent-red)", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <Square size={8} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
