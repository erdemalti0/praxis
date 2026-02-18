import { Cpu, FolderOpen, Search, GitBranch, Activity, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import AgentList from "../agents/AgentList";
import RunnerSidebarSection from "../runner/RunnerSidebarSection";
import FileExplorer from "../explorer/FileExplorer";
import SearchPanel from "../sidebar/SearchPanel";
import GitPanel from "../sidebar/GitPanel";
import ServicesPanel from "../sidebar/ServicesPanel";
import { useUIStore, type SidebarTab } from "../../stores/uiStore";
import { useShallow } from "zustand/shallow";

const tabs: { key: SidebarTab; label: string; icon: typeof Cpu }[] = [
  { key: "agents", label: "Agents", icon: Cpu },
  { key: "explorer", label: "Explorer", icon: FolderOpen },
  { key: "search", label: "Search", icon: Search },
  { key: "git", label: "Git", icon: GitBranch },
  { key: "services", label: "Services", icon: Activity },
];

export default function Sidebar() {
  const { activeTab, setActiveTab, collapsed, toggleSidebar } = useUIStore(
    useShallow((s) => ({
      activeTab: s.activeSidebarTab,
      setActiveTab: s.setActiveSidebarTab,
      collapsed: s.sidebarCollapsed,
      toggleSidebar: s.toggleSidebar,
    }))
  );

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
                  ? "2px solid var(--vp-accent-blue)"
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
                  ? "2px solid var(--vp-accent-blue)"
                  : "2px solid transparent",
                cursor: "pointer",
                transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
                minWidth: 0,
              }}
            >
              <Icon
                size={14}
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

      {/* Tab content — all panels stay mounted, hidden via CSS for instant switching */}
      <div className="flex-1 min-h-0 overflow-hidden" style={{ position: "relative" }}>
        <div className="h-full overflow-y-auto px-2 py-2" style={{ display: activeTab === "agents" ? undefined : "none" }}>
          <AgentList />
          <RunnerSidebarSection />
        </div>
        <div className="h-full" style={{ display: activeTab === "explorer" ? undefined : "none" }}>
          <FileExplorer />
        </div>
        <div className="h-full" style={{ display: activeTab === "search" ? undefined : "none" }}>
          <SearchPanel />
        </div>
        <div className="h-full" style={{ display: activeTab === "git" ? undefined : "none" }}>
          <GitPanel />
        </div>
        <div className="h-full" style={{ display: activeTab === "services" ? undefined : "none" }}>
          <ServicesPanel />
        </div>
      </div>
    </div>
  );
}
