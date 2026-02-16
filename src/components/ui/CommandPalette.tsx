import { useState, useEffect, useRef, useMemo } from "react";
import {
  Search, Plus, Monitor, Globe, FileCode, Target, LayoutGrid,
  Settings, FolderOpen,
} from "lucide-react";
import { useUIStore } from "../../stores/uiStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useToastStore } from "../../stores/toastStore";
import { modKey } from "../../lib/platform";

interface Action {
  id: string;
  label: string;
  icon: React.ElementType;
  category: string;
  shortcut?: string;
  execute: () => void;
}

export default function CommandPalette() {
  const open = useUIStore((s) => s.commandPaletteOpen);
  const setOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const actions: Action[] = useMemo(() => [
    {
      id: "new-agent",
      label: "New Agent...",
      icon: Plus,
      category: "Terminal",
      execute: () => { useUIStore.getState().setShowSpawnDialog(true); setOpen(false); },
    },
    {
      id: "new-workspace",
      label: "New Workspace",
      icon: Plus,
      category: "Workspace",
      execute: () => {
        const id = `ws-${Date.now()}`;
        useUIStore.getState().addWorkspace({ id, name: `Workspace ${useUIStore.getState().workspaces.length + 1}` });
        setOpen(false);
      },
    },
    {
      id: "view-terminal",
      label: "Terminal View",
      icon: Monitor,
      category: "View",
      execute: () => { useUIStore.getState().setViewMode("terminal"); setOpen(false); },
    },
    {
      id: "view-browser",
      label: "Browser",
      icon: Globe,
      category: "View",
      execute: () => { useUIStore.getState().setViewMode("browser"); setOpen(false); },
    },
    {
      id: "view-editor",
      label: "Editor",
      icon: FileCode,
      category: "View",
      execute: () => { useUIStore.getState().setViewMode("editor"); setOpen(false); },
    },
    {
      id: "view-missions",
      label: "Missions",
      icon: Target,
      category: "View",
      execute: () => { useUIStore.getState().setViewMode("missions"); setOpen(false); },
    },
    {
      id: "view-widget",
      label: "Customize Widgets",
      icon: LayoutGrid,
      category: "View",
      execute: () => {
        const wsId = useUIStore.getState().activeWorkspaceId;
        if (wsId) {
          const state = useUIStore.getState();
          state.setShowCustomizePanel(!state.showCustomizePanel);
          useToastStore.getState().addToast(
            state.showCustomizePanel ? "Customize panel closed" : "Customize panel opened",
            "info"
          );
        } else {
          useToastStore.getState().addToast("No active workspace", "warning");
        }
        setOpen(false);
      },
    },
    {
      id: "settings",
      label: "Open Settings",
      icon: Settings,
      category: "Settings",
      shortcut: `${modKey()}+,`,
      execute: () => { useSettingsStore.getState().setShowSettingsPanel(true); setOpen(false); },
    },
    {
      id: "switch-project",
      label: "Switch Project",
      icon: FolderOpen,
      category: "Settings",
      execute: () => { useUIStore.getState().setSelectedProject(null); setOpen(false); },
    },
  ], [setOpen]);

  const filtered = useMemo(() => {
    if (!query.trim()) return actions;
    const q = query.toLowerCase();
    return actions.filter((a) => a.label.toLowerCase().includes(q) || a.category.toLowerCase().includes(q));
  }, [query, actions]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          filtered[selectedIndex].execute();
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, filtered, selectedIndex, setOpen]);

  if (!open) return null;

  // Group by category
  const categories: string[] = [];
  const grouped: Record<string, Action[]> = {};
  for (const a of filtered) {
    if (!grouped[a.category]) {
      grouped[a.category] = [];
      categories.push(a.category);
    }
    grouped[a.category].push(a);
  }

  let flatIndex = 0;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        zIndex: 9997,
        display: "flex",
        justifyContent: "center",
        paddingTop: "20%",
      }}
      onClick={() => setOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 500,
          width: "90%",
          background: "var(--vp-bg-surface)",
          borderRadius: 12,
          border: "1px solid var(--vp-border-panel)",
          overflow: "hidden",
          maxHeight: 400,
          display: "flex",
          flexDirection: "column",
          alignSelf: "flex-start",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", padding: "10px 12px", gap: 8, borderBottom: "1px solid var(--vp-border-panel)" }}>
          <Search size={16} style={{ color: "var(--vp-text-muted)", flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command..."
            style={{
              flex: 1,
              background: "none",
              border: "none",
              outline: "none",
              color: "var(--vp-text-primary)",
              fontSize: 13,
            }}
          />
        </div>
        <div style={{ overflowY: "auto", flex: 1 }}>
          {categories.map((cat) => (
            <div key={cat}>
              <div style={{ padding: "8px 12px 4px", fontSize: 10, fontWeight: 600, color: "var(--vp-text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
                {cat}
              </div>
              {grouped[cat].map((action) => {
                const idx = flatIndex++;
                const Icon = action.icon;
                return (
                  <div
                    key={action.id}
                    onClick={() => action.execute()}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      padding: "8px 12px",
                      gap: 10,
                      cursor: "pointer",
                      fontSize: 12,
                      color: "var(--vp-text-primary)",
                      background: idx === selectedIndex ? "var(--vp-bg-surface-hover)" : "transparent",
                    }}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <Icon size={15} style={{ color: "var(--vp-text-muted)", flexShrink: 0 }} />
                    <span style={{ flex: 1 }}>{action.label}</span>
                    {action.shortcut && (
                      <span style={{
                        fontSize: 10,
                        color: "var(--vp-text-muted)",
                        background: "var(--vp-bg-surface-hover)",
                        padding: "2px 6px",
                        borderRadius: 4,
                        fontFamily: "monospace",
                      }}>
                        {action.shortcut}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: 20, textAlign: "center", fontSize: 12, color: "var(--vp-text-muted)" }}>
              No matching commands
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
