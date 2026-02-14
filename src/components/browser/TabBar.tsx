import { useRef, useState, Fragment } from "react";
import { Plus, X, Loader2, Pin, ChevronDown, ChevronRight } from "lucide-react";
import { useBrowserStore, type TabGroup } from "../../stores/browserStore";

interface TabBarProps {
  onContextMenu: (e: React.MouseEvent, tabId: string) => void;
}

export default function TabBar({ onContextMenu }: TabBarProps) {
  const tabs = useBrowserStore((s) => s.tabs);
  const tabGroups = useBrowserStore((s) => s.tabGroups);
  const activeBrowserTabId = useBrowserStore((s) => s.activeBrowserTabId);
  const setActiveBrowserTabId = useBrowserStore((s) => s.setActiveBrowserTabId);
  const removeTab = useBrowserStore((s) => s.removeTab);
  const createLandingTab = useBrowserStore((s) => s.createLandingTab);
  const reorderTabs = useBrowserStore((s) => s.reorderTabs);
  const toggleGroupCollapsed = useBrowserStore((s) => s.toggleGroupCollapsed);
  const deleteTabGroup = useBrowserStore((s) => s.deleteTabGroup);

  const draggedTabId = useRef<string | null>(null);
  const dragOverTabId = useRef<string | null>(null);

  const handleCloseTab = (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    removeTab(tabId);
  };

  const handleDragStart = (tabId: string) => {
    draggedTabId.current = tabId;
  };

  const handleDragOver = (e: React.DragEvent, tabId: string) => {
    e.preventDefault();
    dragOverTabId.current = tabId;
  };

  const handleDrop = (e: React.DragEvent, targetTabId: string) => {
    e.preventDefault();
    if (!draggedTabId.current || draggedTabId.current === targetTabId) return;

    const fromIndex = tabs.findIndex((t) => t.id === draggedTabId.current);
    const toIndex = tabs.findIndex((t) => t.id === targetTabId);

    if (fromIndex !== -1 && toIndex !== -1) {
      reorderTabs(fromIndex, toIndex);
    }

    draggedTabId.current = null;
    dragOverTabId.current = null;
  };

  const pinnedTabs = tabs.filter((t) => t.isPinned);
  const unpinnedTabs = tabs.filter((t) => !t.isPinned);
  const ungroupedTabs = unpinnedTabs.filter((t) => !t.groupId);
  const groupedTabs = unpinnedTabs.filter((t) => t.groupId);

  const renderTab = (tab: typeof tabs[0], isActive: boolean, isLoading: boolean) => {
    return (
      <div
        key={tab.id}
        draggable={!tab.isPinned}
        onDragStart={() => handleDragStart(tab.id)}
        onDragOver={(e) => handleDragOver(e, tab.id)}
        onDrop={(e) => handleDrop(e, tab.id)}
        onClick={() => setActiveBrowserTabId(tab.id)}
        onContextMenu={(e) => onContextMenu(e, tab.id)}
        className="flex items-center shrink-0"
        style={{
          height: 28,
          padding: tab.isPinned ? "0 8px" : "0 10px",
          background: isActive ? "var(--vp-border-light)" : "transparent",
          borderRadius: 7,
          cursor: "pointer",
          transition: "all 0.15s",
          maxWidth: tab.isPinned ? 40 : 180,
          gap: 6,
          minWidth: tab.isPinned ? 40 : 60,
          borderLeft: tab.groupId
            ? `2px solid ${tabGroups.find((g) => g.id === tab.groupId)?.color || "var(--vp-accent-blue)"}`
            : "none",
        }}
        onMouseEnter={(e) => {
          if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.05)";
        }}
        onMouseLeave={(e) => {
          if (!isActive) e.currentTarget.style.background = "transparent";
        }}
      >
        {tab.isPinned ? (
          <Pin size={12} style={{ color: isActive ? "#60a5fa" : "#666" }} />
        ) : (
          <>
            {isLoading ? (
              <Loader2 size={12} style={{ color: "#60a5fa" }} className="animate-spin" />
            ) : tab.favicon ? (
              <img
                src={tab.favicon}
                alt=""
                style={{ width: 12, height: 12, flexShrink: 0 }}
                draggable={false}
              />
            ) : (
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 3,
                  background: "rgba(255,255,255,0.1)",
                  flexShrink: 0,
                }}
              />
            )}

            <span
              style={{
                fontSize: 11,
                color: isActive ? "#e0e0e0" : "#888",
                fontWeight: isActive ? 500 : 400,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flex: 1,
                minWidth: 0,
              }}
            >
              {tab.showLanding ? "New Tab" : (tab.title || tab.label)}
            </span>

            {tabs.length > 1 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 16,
                  height: 16,
                  borderRadius: 4,
                  flexShrink: 0,
                  cursor: "pointer",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.stopPropagation();
                  e.currentTarget.style.background = "rgba(248,113,113,0.2)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
                onClick={(e) => handleCloseTab(tab.id, e)}
              >
                <X size={10} style={{ color: "#888" }} />
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  const renderGroupHeader = (group: TabGroup) => {
    const groupTabs = groupedTabs.filter((t) => t.groupId === group.id);
    if (groupTabs.length === 0) {
      return null;
    }

    return (
      <Fragment key={`group-${group.id}`}>
        <div
          className="flex items-center shrink-0"
          style={{
            padding: "0 8px",
            height: 28,
            background: `${group.color}10`,
            borderLeft: `3px solid ${group.color}`,
            borderRadius: "0 6px 6px 0",
            gap: 6,
            marginRight: 2,
            cursor: "pointer",
          }}
          onClick={() => toggleGroupCollapsed(group.id)}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = `${group.color}18`;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = `${group.color}10`;
          }}
        >
          {group.collapsed ? (
            <ChevronRight size={12} style={{ color: group.color }} />
          ) : (
            <ChevronDown size={12} style={{ color: group.color }} />
          )}
          <span
            style={{
              fontSize: 10,
              fontWeight: 500,
              color: group.color,
              maxWidth: 80,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {group.name}
          </span>
          <span style={{ fontSize: 9, color: "#666" }}>
            {groupTabs.length}
          </span>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 14,
              height: 14,
              borderRadius: 4,
              marginLeft: "auto",
            }}
            onClick={(e) => {
              e.stopPropagation();
              deleteTabGroup(group.id);
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(248,113,113,0.2)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            <X size={8} style={{ color: "#888" }} />
          </div>
        </div>
        {!group.collapsed && groupTabs.map((tab) => {
          const isActive = tab.id === activeBrowserTabId;
          const isLoading = !!(tab.isLoading && !tab.showLanding);
          return renderTab(tab, isActive, isLoading);
        })}
      </Fragment>
    );
  };

  return (
    <div
      className="flex items-center shrink-0"
      style={{
        height: 36,
        padding: "0 8px",
        background: "rgba(255,255,255,0.02)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        gap: 2,
        overflow: "hidden",
      }}
    >
      <div
        className="flex items-center flex-1 min-w-0"
        style={{ gap: 2, overflowX: "auto", overflowY: "hidden" }}
      >
        {pinnedTabs.map((tab) => {
          const isActive = tab.id === activeBrowserTabId;
          const isLoading = !!(tab.isLoading && !tab.showLanding);
          return renderTab(tab, isActive, isLoading);
        })}

        {pinnedTabs.length > 0 && ungroupedTabs.length > 0 && (
          <div
            style={{
              width: 1,
              height: 20,
              background: "rgba(255,255,255,0.08)",
              margin: "0 4px",
              flexShrink: 0,
            }}
          />
        )}

        {ungroupedTabs.map((tab) => {
          const isActive = tab.id === activeBrowserTabId;
          const isLoading = !!(tab.isLoading && !tab.showLanding);
          return renderTab(tab, isActive, isLoading);
        })}

        {tabGroups.map((group) => renderGroupHeader(group))}

        <button
          onClick={() => createLandingTab()}
          title="New Tab (⌘T)"
          className="shrink-0"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 26,
            height: 26,
            borderRadius: 7,
            border: "none",
            background: "transparent",
            cursor: "pointer",
            color: "#555",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.08)";
            e.currentTarget.style.color = "#e0e0e0";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "#555";
          }}
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}
