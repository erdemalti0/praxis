import { useEffect, useRef, useState } from "react";
import {
  RotateCw,
  Copy,
  Pin,
  PinOff,
  Volume2,
  VolumeX,
  Copy as Duplicate,
  X,
  XCircle,
  ArrowRightToLine,
  FolderPlus,
  Trash2,
} from "lucide-react";
import { useBrowserStore, type BrowserTab } from "../../stores/browserStore";

interface ContextMenuPosition {
  x: number;
  y: number;
}

interface TabContextMenuProps {
  isOpen: boolean;
  position: ContextMenuPosition;
  tabId: string | null;
  onClose: () => void;
}

interface MenuItem {
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  onClick: () => void;
  divider?: boolean;
  danger?: boolean;
  disabled?: boolean;
}

export default function TabContextMenu({ isOpen, position, tabId, onClose }: TabContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const tabs = useBrowserStore((s) => s.tabs);
  const tabGroups = useBrowserStore((s) => s.tabGroups);
  const pinTab = useBrowserStore((s) => s.pinTab);
  const unpinTab = useBrowserStore((s) => s.unpinTab);
  const muteTab = useBrowserStore((s) => s.muteTab);
  const unmuteTab = useBrowserStore((s) => s.unmuteTab);
  const duplicateTab = useBrowserStore((s) => s.duplicateTab);
  const removeTab = useBrowserStore((s) => s.removeTab);
  const closeOtherTabs = useBrowserStore((s) => s.closeOtherTabs);
  const closeTabsToRight = useBrowserStore((s) => s.closeTabsToRight);
  const addTabToGroup = useBrowserStore((s) => s.addTabToGroup);
  const removeTabFromGroup = useBrowserStore((s) => s.removeTabFromGroup);
  const createTabGroup = useBrowserStore((s) => s.createTabGroup);
  const setActiveBrowserTabId = useBrowserStore((s) => s.setActiveBrowserTabId);
  const navigateTab = useBrowserStore((s) => s.navigateTab);

  const tab = tabs.find((t) => t.id === tabId);

  const [adjustedPosition, setAdjustedPosition] = useState(position);

  useEffect(() => {
    if (isOpen && menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let x = position.x;
      let y = position.y;

      if (x + rect.width > viewportWidth - 10) {
        x = viewportWidth - rect.width - 10;
      }
      if (y + rect.height > viewportHeight - 10) {
        y = viewportHeight - rect.height - 10;
      }

      setAdjustedPosition({ x, y });
    }
  }, [isOpen, position]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !tab) return null;

  const handleReload = () => {
    onClose();
    const webview = document.querySelector(`webview[data-tab-id="${tabId}"]`) as Electron.WebviewTag;
    if (webview) {
      webview.reload();
    }
  };

  const handleCopyUrl = () => {
    onClose();
    if (tab.url) {
      navigator.clipboard.writeText(tab.url);
    }
  };

  const handleTogglePin = () => {
    onClose();
    if (tab.isPinned) {
      unpinTab(tab.id);
    } else {
      pinTab(tab.id);
    }
  };

  const handleToggleMute = () => {
    onClose();
    if (tab.isMuted) {
      unmuteTab(tab.id);
    } else {
      muteTab(tab.id);
    }
  };

  const handleDuplicate = () => {
    onClose();
    duplicateTab(tab.id);
  };

  const handleClose = () => {
    onClose();
    removeTab(tab.id);
  };

  const handleCloseOthers = () => {
    onClose();
    closeOtherTabs(tab.id);
  };

  const handleCloseToRight = () => {
    onClose();
    closeTabsToRight(tab.id);
  };

  const handleAddToGroup = (groupId: string) => {
    onClose();
    addTabToGroup(tab.id, groupId);
  };

  const handleRemoveFromGroup = () => {
    onClose();
    removeTabFromGroup(tab.id);
  };

  const handleCreateGroup = () => {
    onClose();
    const groupId = createTabGroup("New Group", "#3b82f6");
    addTabToGroup(tab.id, groupId);
  };

  const menuItems: MenuItem[] = [
    {
      label: "Reload",
      icon: <RotateCw size={14} />,
      shortcut: "⌘R",
      onClick: handleReload,
      disabled: tab.showLanding,
    },
    {
      label: "Duplicate",
      icon: <Duplicate size={14} />,
      onClick: handleDuplicate,
    },
    {
      label: "Copy URL",
      icon: <Copy size={14} />,
      onClick: handleCopyUrl,
      disabled: !tab.url,
    },
    {
      label: tab.isPinned ? "Unpin Tab" : "Pin Tab",
      icon: tab.isPinned ? <PinOff size={14} /> : <Pin size={14} />,
      onClick: handleTogglePin,
    },
    {
      label: tab.isMuted ? "Unmute Tab" : "Mute Tab",
      icon: tab.isMuted ? <Volume2 size={14} /> : <VolumeX size={14} />,
      onClick: handleToggleMute,
      divider: true,
    },
    {
      label: "Add to Group",
      icon: <FolderPlus size={14} />,
      onClick: () => {},
      disabled: true,
    },
    ...tabGroups.map((group) => ({
      label: `  ${group.name}`,
      onClick: () => handleAddToGroup(group.id),
      divider: false,
      disabled: false,
    })),
    ...(tab.groupId
      ? [
          {
            label: "Remove from Group",
            icon: <Trash2 size={14} />,
            onClick: handleRemoveFromGroup,
            divider: false,
            disabled: false,
          },
        ]
      : []),
    {
      label: "Create New Group",
      onClick: handleCreateGroup,
      divider: true,
    },
    {
      label: "Close",
      icon: <X size={14} />,
      shortcut: "⌘W",
      onClick: handleClose,
      danger: true,
    },
    {
      label: "Close Other Tabs",
      icon: <XCircle size={14} />,
      onClick: handleCloseOthers,
      danger: true,
    },
    {
      label: "Close Tabs to Right",
      icon: <ArrowRightToLine size={14} />,
      onClick: handleCloseToRight,
      danger: true,
    },
  ];

  return (
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        left: adjustedPosition.x,
        top: adjustedPosition.y,
        background: "var(--vp-bg-secondary)",
        border: "1px solid var(--vp-border-light)",
        borderRadius: 10,
        padding: "6px 0",
        minWidth: 180,
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        zIndex: 9999,
      }}
    >
      {menuItems.map((item, index) => (
        <div key={index}>
          {item.divider && index > 0 && (
            <div
              style={{
                height: 1,
                background: "var(--vp-bg-surface-hover)",
                margin: "4px 0",
              }}
            />
          )}
          <button
            onClick={item.onClick}
            disabled={item.disabled}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              width: "100%",
              padding: "7px 14px",
              background: "transparent",
              border: "none",
              cursor: item.disabled ? "not-allowed" : "pointer",
              color: item.disabled
                ? "var(--vp-text-subtle)"
                : item.danger
                  ? "var(--vp-accent-red-text)"
                  : "var(--vp-text-secondary)",
              fontSize: 12,
              fontWeight: 400,
              textAlign: "left",
              transition: "background 0.1s",
            }}
            onMouseEnter={(e) => {
              if (!item.disabled) {
                e.currentTarget.style.background = "var(--vp-bg-surface-hover)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            {item.icon && <span style={{ opacity: 0.7 }}>{item.icon}</span>}
            <span style={{ flex: 1 }}>{item.label}</span>
            {item.shortcut && (
              <span style={{ color: "var(--vp-text-subtle)", fontSize: 11 }}>{item.shortcut}</span>
            )}
          </button>
        </div>
      ))}
    </div>
  );
}
