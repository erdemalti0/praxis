import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Cpu, FolderOpen, Search, GitBranch, Activity, PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react";
import AgentList from "../agents/AgentList";
import RunnerSidebarSection from "../runner/RunnerSidebarSection";
import FileExplorer from "../explorer/FileExplorer";
import SearchPanel from "../sidebar/SearchPanel";
import GitPanel from "../sidebar/GitPanel";
import ServicesPanel from "../sidebar/ServicesPanel";
import { useUIStore, type SidebarTab } from "../../stores/uiStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useShallow } from "zustand/shallow";

/** All available tab definitions (canonical order) */
const ALL_TABS: { id: SidebarTab; label: string; icon: typeof Cpu }[] = [
  { id: "agents", label: "Agents", icon: Cpu },
  { id: "explorer", label: "Explorer", icon: FolderOpen },
  { id: "search", label: "Search", icon: Search },
  { id: "git", label: "Git", icon: GitBranch },
  { id: "services", label: "Services", icon: Activity },
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

  const {
    sidebarTabOrder,
    hiddenSidebarTabs,
    setSidebarTabOrder,
    setHiddenSidebarTabs,
  } = useSettingsStore(
    useShallow((s) => ({
      sidebarTabOrder: s.sidebarTabOrder,
      hiddenSidebarTabs: s.hiddenSidebarTabs,
      setSidebarTabOrder: s.setSidebarTabOrder,
      setHiddenSidebarTabs: s.setHiddenSidebarTabs,
    }))
  );

  // Drag-and-drop state
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ tabId: string; x: number; y: number } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Hidden tabs restore dropdown
  const [showHiddenDropdown, setShowHiddenDropdown] = useState(false);
  const hiddenDropdownRef = useRef<HTMLDivElement>(null);

  // Sort tabs by saved order, filter out hidden
  const visibleTabs = useMemo(() => {
    const order = sidebarTabOrder.length > 0 ? sidebarTabOrder : ALL_TABS.map((t) => t.id);
    const hidden = new Set(hiddenSidebarTabs);
    return order
      .map((id) => ALL_TABS.find((t) => t.id === id))
      .filter((t): t is (typeof ALL_TABS)[number] => t != null && !hidden.has(t.id));
  }, [sidebarTabOrder, hiddenSidebarTabs]);

  const hiddenTabs = useMemo(() => {
    const hidden = new Set(hiddenSidebarTabs);
    return ALL_TABS.filter((t) => hidden.has(t.id));
  }, [hiddenSidebarTabs]);

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return;
    const onClick = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [contextMenu]);

  // Close hidden dropdown on click outside
  useEffect(() => {
    if (!showHiddenDropdown) return;
    const onClick = (e: MouseEvent) => {
      if (hiddenDropdownRef.current && !hiddenDropdownRef.current.contains(e.target as Node)) {
        setShowHiddenDropdown(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [showHiddenDropdown]);

  // If active tab is hidden, switch to first visible tab
  useEffect(() => {
    const hidden = new Set(hiddenSidebarTabs);
    if (hidden.has(activeTab) && visibleTabs.length > 0) {
      setActiveTab(visibleTabs[0].id);
    }
  }, [hiddenSidebarTabs, activeTab, visibleTabs, setActiveTab]);

  // Drag handlers
  const handleTabDragStart = useCallback((e: React.DragEvent, tabId: string) => {
    setDraggedTabId(tabId);
    e.dataTransfer.effectAllowed = "move";
    // Set minimal data to satisfy drag API
    e.dataTransfer.setData("text/plain", tabId);
  }, []);

  const handleTabDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleTabDrop = useCallback((e: React.DragEvent, targetTabId: string) => {
    e.preventDefault();
    if (!draggedTabId || draggedTabId === targetTabId) {
      setDraggedTabId(null);
      return;
    }

    const order = sidebarTabOrder.length > 0
      ? [...sidebarTabOrder]
      : ALL_TABS.map((t) => t.id);

    const fromIdx = order.indexOf(draggedTabId);
    const toIdx = order.indexOf(targetTabId);
    if (fromIdx === -1 || toIdx === -1) {
      setDraggedTabId(null);
      return;
    }

    // Remove dragged and insert at target position
    order.splice(fromIdx, 1);
    order.splice(toIdx, 0, draggedTabId);
    setSidebarTabOrder(order);
    setDraggedTabId(null);
  }, [draggedTabId, sidebarTabOrder, setSidebarTabOrder]);

  const handleTabDragEnd = useCallback(() => {
    setDraggedTabId(null);
  }, []);

  // Context menu: hide tab
  const handleContextMenu = useCallback((e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    setContextMenu({ tabId, x: e.clientX, y: e.clientY });
  }, []);

  const handleHideTab = useCallback((tabId: string) => {
    setHiddenSidebarTabs([...hiddenSidebarTabs, tabId]);
    setContextMenu(null);
  }, [hiddenSidebarTabs, setHiddenSidebarTabs]);

  const handleRestoreTab = useCallback((tabId: string) => {
    setHiddenSidebarTabs(hiddenSidebarTabs.filter((id) => id !== tabId));
    setShowHiddenDropdown(false);
  }, [hiddenSidebarTabs, setHiddenSidebarTabs]);

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
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              draggable
              onDragStart={(e) => handleTabDragStart(e, tab.id)}
              onDragOver={handleTabDragOver}
              onDrop={(e) => handleTabDrop(e, tab.id)}
              onDragEnd={handleTabDragEnd}
              onContextMenu={(e) => handleContextMenu(e, tab.id)}
              onClick={() => {
                setActiveTab(tab.id);
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
                opacity: draggedTabId === tab.id ? 0.4 : 1,
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

        {/* Restore hidden tabs button (collapsed) */}
        {hiddenTabs.length > 0 && (
          <div style={{ position: "relative", width: "100%" }}>
            <button
              onClick={() => setShowHiddenDropdown((v) => !v)}
              title="Show hidden tabs"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "10px 0",
                width: "100%",
                display: "flex",
                justifyContent: "center",
                color: "var(--vp-text-dim)",
                transition: "color 0.2s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--vp-text-primary)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--vp-text-dim)")}
            >
              <Plus size={14} />
            </button>
            {showHiddenDropdown && (
              <div
                ref={hiddenDropdownRef}
                style={{
                  position: "absolute",
                  left: "100%",
                  top: 0,
                  marginLeft: 4,
                  background: "var(--vp-bg-secondary)",
                  border: "1px solid var(--vp-border-medium)",
                  borderRadius: "var(--vp-radius-md)",
                  padding: "4px 0",
                  zIndex: 50,
                  minWidth: 120,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                }}
              >
                {hiddenTabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => handleRestoreTab(tab.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        width: "100%",
                        padding: "6px 12px",
                        border: "none",
                        background: "transparent",
                        color: "var(--vp-text-secondary)",
                        fontSize: 12,
                        cursor: "pointer",
                        transition: "background 0.15s, color 0.15s",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "var(--vp-bg-surface-hover)";
                        e.currentTarget.style.color = "var(--vp-text-primary)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.style.color = "var(--vp-text-secondary)";
                      }}
                    >
                      <Icon size={13} />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Context menu */}
        {contextMenu && (
          <div
            ref={contextMenuRef}
            style={{
              position: "fixed",
              left: contextMenu.x,
              top: contextMenu.y,
              background: "var(--vp-bg-secondary)",
              border: "1px solid var(--vp-border-medium)",
              borderRadius: "var(--vp-radius-md)",
              padding: "4px 0",
              zIndex: 100,
              minWidth: 140,
              boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            }}
          >
            <button
              onClick={() => handleHideTab(contextMenu.tabId)}
              style={{
                display: "flex",
                alignItems: "center",
                width: "100%",
                padding: "6px 12px",
                border: "none",
                background: "transparent",
                color: "var(--vp-text-secondary)",
                fontSize: 12,
                cursor: "pointer",
                transition: "background 0.15s, color 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--vp-bg-surface-hover)";
                e.currentTarget.style.color = "var(--vp-text-primary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--vp-text-secondary)";
              }}
            >
              Hide this tab
            </button>
          </div>
        )}
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
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              draggable
              onDragStart={(e) => handleTabDragStart(e, tab.id)}
              onDragOver={handleTabDragOver}
              onDrop={(e) => handleTabDrop(e, tab.id)}
              onDragEnd={handleTabDragEnd}
              onContextMenu={(e) => handleContextMenu(e, tab.id)}
              onClick={() => setActiveTab(tab.id)}
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
                opacity: draggedTabId === tab.id ? 0.4 : 1,
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

        {/* Restore hidden tabs button (expanded) */}
        {hiddenTabs.length > 0 && (
          <div style={{ position: "relative", flexShrink: 0 }}>
            <button
              onClick={() => setShowHiddenDropdown((v) => !v)}
              title="Show hidden tabs"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "8px 4px",
                color: "var(--vp-text-faint)",
                transition: "color 0.2s",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--vp-text-primary)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--vp-text-faint)")}
            >
              <Plus size={13} />
            </button>
            {showHiddenDropdown && (
              <div
                ref={hiddenDropdownRef}
                style={{
                  position: "absolute",
                  top: "100%",
                  right: 0,
                  marginTop: 4,
                  background: "var(--vp-bg-secondary)",
                  border: "1px solid var(--vp-border-medium)",
                  borderRadius: "var(--vp-radius-md)",
                  padding: "4px 0",
                  zIndex: 50,
                  minWidth: 140,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                }}
              >
                {hiddenTabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => handleRestoreTab(tab.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        width: "100%",
                        padding: "6px 12px",
                        border: "none",
                        background: "transparent",
                        color: "var(--vp-text-secondary)",
                        fontSize: 12,
                        cursor: "pointer",
                        transition: "background 0.15s, color 0.15s",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "var(--vp-bg-surface-hover)";
                        e.currentTarget.style.color = "var(--vp-text-primary)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.style.color = "var(--vp-text-secondary)";
                      }}
                    >
                      <Icon size={13} />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

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

      {/* Context menu (portal-like, fixed position) */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          style={{
            position: "fixed",
            left: contextMenu.x,
            top: contextMenu.y,
            background: "var(--vp-bg-secondary)",
            border: "1px solid var(--vp-border-medium)",
            borderRadius: "var(--vp-radius-md)",
            padding: "4px 0",
            zIndex: 100,
            minWidth: 140,
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          }}
        >
          <button
            onClick={() => handleHideTab(contextMenu.tabId)}
            style={{
              display: "flex",
              alignItems: "center",
              width: "100%",
              padding: "6px 12px",
              border: "none",
              background: "transparent",
              color: "var(--vp-text-secondary)",
              fontSize: 12,
              cursor: "pointer",
              transition: "background 0.15s, color 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--vp-bg-surface-hover)";
              e.currentTarget.style.color = "var(--vp-text-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--vp-text-secondary)";
            }}
          >
            Hide this tab
          </button>
        </div>
      )}
    </div>
  );
}
