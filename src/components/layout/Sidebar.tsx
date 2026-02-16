import { lazy, Suspense } from "react";
import { Cpu, FolderOpen, Search, GitBranch, Activity, PanelLeftClose, PanelLeftOpen } from "lucide-react";

const AgentList = lazy(() => import("../agents/AgentList"));
const FileExplorer = lazy(() => import("../explorer/FileExplorer"));
const SearchPanel = lazy(() => import("../sidebar/SearchPanel"));
const GitPanel = lazy(() => import("../sidebar/GitPanel"));
const ServicesPanel = lazy(() => import("../sidebar/ServicesPanel"));
import { useUIStore, type SidebarTab } from "../../stores/uiStore";

const tabs: { key: SidebarTab; label: string; icon: typeof Cpu }[] = [
  { key: "agents", label: "Agents", icon: Cpu },
  { key: "explorer", label: "Explorer", icon: FolderOpen },
  { key: "search", label: "Search", icon: Search },
  { key: "git", label: "Git", icon: GitBranch },
  { key: "services", label: "Services", icon: Activity },
];

export default function Sidebar() {
  const activeTab = useUIStore((s) => s.activeSidebarTab);
  const setActiveTab = useUIStore((s) => s.setActiveSidebarTab);
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  // Collapsed: thin icon rail
  if (collapsed) {
    return (
      <div
        className="h-full flex flex-col items-center overflow-hidden"
        style={{ background: "transparent" }}
      >
        {/* Expand button */}
        <button
          onClick={toggleSidebar}
          title="Expand sidebar"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "12px 0 8px",
            color: "var(--vp-text-dim)",
            transition: "color 0.2s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--vp-text-primary)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--vp-text-dim)")}
        >
          <PanelLeftOpen size={16} />
        </button>

        <div
          style={{
            width: 20,
            height: 1,
            background: "var(--vp-border-light)",
            margin: "4px 0",
          }}
        />

        {/* Tab icons */}
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key);
                toggleSidebar(); // expand on icon click
              }}
              title={tab.label}
              style={{
                background: isActive
                  ? "var(--vp-bg-surface-hover)"
                  : "transparent",
                border: "none",
                cursor: "pointer",
                padding: "10px 0",
                width: "100%",
                display: "flex",
                justifyContent: "center",
                color: isActive ? "var(--vp-text-primary)" : "var(--vp-text-dim)",
                transition: "all 0.2s",
                borderLeft: isActive
                  ? "2px solid var(--vp-border-panel)"
                  : "2px solid transparent",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--vp-text-primary)";
                e.currentTarget.style.background = "var(--vp-bg-surface-hover)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = isActive ? "var(--vp-text-primary)" : "var(--vp-text-dim)";
                e.currentTarget.style.background = isActive
                  ? "var(--vp-bg-surface-hover)"
                  : "transparent";
              }}
            >
              <Icon size={15} />
            </button>
          );
        })}
      </div>
    );
  }

  // Expanded: full sidebar
  return (
    <div
      className="h-full flex flex-col overflow-hidden"
      style={{ background: "transparent" }}
    >
      {/* Tab bar */}
      <div
        className="flex flex-shrink-0 items-center"
        style={{ borderBottom: "1px solid var(--vp-border-strong)" }}
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="flex-1 flex items-center justify-center gap-1 px-2 py-3"
              title={tab.label}
              style={{
                background: isActive
                  ? "var(--vp-bg-surface-hover)"
                  : "transparent",
                border: "none",
                borderBottom: isActive
                  ? "2px solid var(--vp-border-panel)"
                  : "2px solid transparent",
                cursor: "pointer",
                transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
                minWidth: 0,
              }}
            >
              <Icon
                size={13}
                style={{
                  color: isActive ? "var(--vp-text-primary)" : "var(--vp-text-dim)",
                  transition: "color 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
                  flexShrink: 0,
                }}
              />
            </button>
          );
        })}

        {/* Collapse button */}
        <button
          onClick={toggleSidebar}
          title="Collapse sidebar"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "8px 6px",
            color: "var(--vp-text-faint)",
            transition: "color 0.2s",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--vp-text-primary)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--vp-text-faint)")}
        >
          <PanelLeftClose size={14} />
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <Suspense fallback={<div style={{ padding: 12, color: "var(--vp-text-dim)", fontSize: 12 }}>Loading...</div>}>
          {activeTab === "agents" && (
            <div className="h-full overflow-y-auto px-2 py-2">
              <AgentList />
            </div>
          )}
          {activeTab === "explorer" && <FileExplorer />}
          {activeTab === "search" && <SearchPanel />}
          {activeTab === "git" && <GitPanel />}
          {activeTab === "services" && <ServicesPanel />}
        </Suspense>
      </div>
    </div>
  );
}
