import { useState } from "react";
import { ChevronDown, ChevronRight, X, Plus } from "lucide-react";
import { useBrowserStore, type TabGroup as TabGroupType } from "../../stores/browserStore";

interface TabGroupIndicatorProps {
  group: TabGroupType;
  tabCount: number;
}

export function TabGroupIndicator({ group, tabCount }: TabGroupIndicatorProps) {
  const toggleGroupCollapsed = useBrowserStore((s) => s.toggleGroupCollapsed);
  const deleteTabGroup = useBrowserStore((s) => s.deleteTabGroup);
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="flex items-center shrink-0"
      style={{
        padding: "0 6px",
        height: 26,
        borderRadius: 6,
        background: `${group.color}15`,
        borderLeft: `3px solid ${group.color}`,
        gap: 4,
        marginRight: 2,
        cursor: "pointer",
      }}
      onClick={() => toggleGroupCollapsed(group.id)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
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
      <span style={{ fontSize: 9, color: "var(--vp-text-dim)" }}>
        {tabCount}
      </span>
      {isHovered && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 14,
            height: 14,
            borderRadius: 4,
            background: "var(--vp-accent-red-bg)",
          }}
          onClick={(e) => {
            e.stopPropagation();
            deleteTabGroup(group.id);
          }}
        >
          <X size={8} style={{ color: "var(--vp-accent-red-text)" }} />
        </div>
      )}
    </div>
  );
}

interface CreateGroupDialogProps {
  onClose: () => void;
  onCreate: (name: string, color: string) => void;
  tabId?: string;
}

export function CreateGroupDialog({ onClose, onCreate, tabId }: CreateGroupDialogProps) {
  const [name, setName] = useState("New Group");
  const [color, setColor] = useState("#3b82f6");

  const colors = [
    "#3b82f6",
    "#10b981",
    "#f59e0b",
    "#ef4444",
    "#8b5cf6",
    "#ec4899",
    "#06b6d4",
    "#84cc16",
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        background: "var(--vp-bg-overlay)",
        backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 320,
          background: "var(--vp-bg-secondary)",
          border: "1px solid var(--vp-border-light)",
          borderRadius: 14,
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: "1px solid var(--vp-border-subtle)" }}
        >
          <span style={{ color: "var(--vp-text-primary)", fontSize: 13, fontWeight: 600 }}>
            Create Tab Group
          </span>
          <button
            onClick={onClose}
            style={{
              color: "var(--vp-text-faint)",
              padding: 4,
              borderRadius: 6,
              background: "transparent",
              border: "none",
              cursor: "pointer",
            }}
          >
            <X size={14} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label
              className="text-xs block mb-1.5"
              style={{ color: "var(--vp-text-dim)" }}
            >
              Group Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Group name..."
              autoFocus
              style={{
                width: "100%",
                background: "var(--vp-bg-primary)",
                border: "1px solid var(--vp-border-light)",
                color: "var(--vp-text-primary)",
                outline: "none",
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 13,
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) {
                  onCreate(name.trim(), color);
                  onClose();
                }
              }}
            />
          </div>

          <div>
            <label
              className="text-xs block mb-2"
              style={{ color: "var(--vp-text-dim)" }}
            >
              Color
            </label>
            <div className="flex gap-2 flex-wrap">
              {colors.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    background: c,
                    border: color === c ? "2px solid #fff" : "2px solid transparent",
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                />
              ))}
            </div>
          </div>

          <button
            onClick={() => {
              if (name.trim()) {
                onCreate(name.trim(), color);
                onClose();
              }
            }}
            disabled={!name.trim()}
            style={{
              width: "100%",
              padding: "10px 0",
              background: "var(--vp-button-primary-bg)",
              color: "var(--vp-button-primary-text)",
              borderRadius: 8,
              border: "none",
              fontSize: 13,
              fontWeight: 500,
              cursor: name.trim() ? "pointer" : "not-allowed",
              opacity: name.trim() ? 1 : 0.5,
              transition: "opacity 0.2s",
            }}
          >
            Create Group
          </button>
        </div>
      </div>
    </div>
  );
}

export function AddToGroupButton({ tabId }: { tabId: string }) {
  const tabGroups = useBrowserStore((s) => s.tabGroups);
  const addTabToGroup = useBrowserStore((s) => s.addTabToGroup);
  const [isOpen, setIsOpen] = useState(false);

  if (tabGroups.length === 0) return null;

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 22,
          height: 22,
          borderRadius: 5,
          border: "none",
          background: "transparent",
          cursor: "pointer",
          color: "var(--vp-text-faint)",
        }}
      >
        <Plus size={12} />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0"
            onClick={() => setIsOpen(false)}
          />
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              marginTop: 4,
              background: "var(--vp-bg-secondary)",
              border: "1px solid var(--vp-border-light)",
              borderRadius: 8,
              padding: "4px 0",
              minWidth: 140,
              boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
              zIndex: 100,
            }}
          >
            {tabGroups.map((group) => (
              <button
                key={group.id}
                onClick={() => {
                  addTabToGroup(tabId, group.id);
                  setIsOpen(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "6px 10px",
                  background: "transparent",
                  border: "none",
                  color: "var(--vp-text-secondary)",
                  fontSize: 12,
                  cursor: "pointer",
                  textAlign: "left",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--vp-bg-surface-hover)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 3,
                    background: group.color,
                  }}
                />
                {group.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
