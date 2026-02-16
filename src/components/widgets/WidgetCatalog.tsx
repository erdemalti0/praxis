import { useState } from "react";
import {
  X, Search, Box, GripVertical, Save, Trash2, Edit3,
  FolderOpen, Cpu, Terminal, Target,
  Activity, Network, FileText,
  GitBranch, GitPullRequest, FileCode, BookOpen,
  StickyNote, Zap, Timer, Bookmark, Layout,
} from "lucide-react";
import { WIDGET_REGISTRY } from "./registry";
import { useWidgetStore } from "../../stores/widgetStore";
import { useUIStore } from "../../stores/uiStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useConfirmStore } from "../../stores/confirmStore";
import type { WidgetDefinition } from "../../types/widget";
import type { ComponentType } from "react";

interface WidgetCatalogProps {
  workspaceId: string;
  onClose: () => void;
}

const CATEGORIES = [
  { key: "all", label: "All" },
  { key: "core", label: "Core" },
  { key: "monitoring", label: "Monitoring" },
  { key: "development", label: "Dev" },
  { key: "productivity", label: "Productivity" },
] as const;

const CATEGORY_COLORS: Record<string, string> = {
  core: "#60a5fa",
  monitoring: "#34d399",
  development: "#a78bfa",
  productivity: "#facc15",
};

const ICON_MAP: Record<string, ComponentType<any>> = {
  FolderOpen, Cpu, Terminal, Target,
  Activity, Network, FileText,
  GitBranch, GitPullRequest, FileCode, BookOpen,
  StickyNote, Zap, Timer, Bookmark, Box,
};

function getIcon(iconName: string) {
  return ICON_MAP[iconName] || Box;
}

export default function WidgetCatalog({ workspaceId, onClose }: WidgetCatalogProps) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const addWidget = useWidgetStore((s) => s.addWidget);
  const loadTemplate = useWidgetStore((s) => s.loadTemplate);
  const clearWidgets = useWidgetStore((s) => s.clearWidgets);
  const showMissionPanel = useUIStore((s) => s.showMissionPanel);
  const templates = useSettingsStore((s) => s.workspaceTemplates);
  const addTemplate = useSettingsStore((s) => s.addTemplate);
  const deleteTemplate = useSettingsStore((s) => s.deleteTemplate);
  const renameTemplate = useSettingsStore((s) => s.renameTemplate);

  const filtered = WIDGET_REGISTRY.filter((w) => {
    if (category !== "all" && w.category !== category) return false;
    if (search && !w.name.toLowerCase().includes(search.toLowerCase()) && !w.description.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleAddWidget = (def: WidgetDefinition) => {
    if (def.panelWidget) {
      useUIStore.getState().toggleMissionPanel();
      return;
    }
    addWidget(workspaceId, def.type);
  };

  const handleReset = () => {
    useConfirmStore.getState().showConfirm("Reset Widgets", "Remove all widgets from this workspace?", () => {
      clearWidgets(workspaceId);
    }, { danger: true });
  };

  const handleSaveTemplate = () => {
    if (!templateName.trim()) return;

    const widgetState = useWidgetStore.getState();
    const currentWidgets = widgetState.workspaceWidgets[workspaceId] || [];
    const hasWidgetsNow = currentWidgets.length > 0;

    const template: import("../../stores/settingsStore").WorkspaceTemplate = {
      id: `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: templateName.trim(),
      createdAt: Date.now(),
      mode: hasWidgetsNow ? "widget" : "terminal",
      widgets: [],
    };

    if (hasWidgetsNow) {
      const widgets = currentWidgets;
      const layout = widgetState.workspaceLayouts[workspaceId] || [];
      template.widgets = widgets.map((w) => {
        const li = layout.find((l) => l.i === w.id);
        return {
          type: w.type,
          x: li?.x ?? 0, y: li?.y ?? 0,
          w: li?.w ?? 4, h: li?.h ?? 4,
          config: w.config,
        };
      });
    } else {
      const ui = useUIStore.getState();
      const activeGroup = ui.activeTerminalGroup[workspaceId];
      if (activeGroup && ui.workspaceLayouts[activeGroup]) {
        template.terminalLayout = ui.workspaceLayouts[activeGroup];
      }
      template.terminalGroupCount = (ui.terminalGroups[workspaceId] || []).length;
    }

    addTemplate(template);
    setTemplateName("");
    setSavingTemplate(false);
  };

  const handleDragStart = (e: React.DragEvent, def: WidgetDefinition) => {
    e.dataTransfer.setData("application/widget-type", def.type);
    e.dataTransfer.effectAllowed = "copy";

    const ghost = document.createElement("div");
    ghost.textContent = def.name;
    ghost.style.cssText = `
      position: fixed; top: -100px; left: -100px;
      background: var(--vp-bg-tertiary, #1a1a1a); color: var(--vp-text-primary, #e0e0e0); padding: 8px 16px;
      border-radius: 10px; font-size: 12px; font-weight: 500;
      border: 1px solid var(--vp-border-medium, rgba(255,255,255,0.2));
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
      font-family: -apple-system, BlinkMacSystemFont, "Inter", sans-serif;
      white-space: nowrap;
    `;
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 60, 20);
    requestAnimationFrame(() => document.body.removeChild(ghost));
  };

  return (
    <div
      style={{
        width: 260,
        minWidth: 260,
        height: "100%",
        background: "var(--vp-bg-surface)",
        borderLeft: "1px solid var(--vp-border-subtle)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3"
        style={{ height: 40, borderBottom: "1px solid var(--vp-border-subtle)", flexShrink: 0 }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--vp-text-primary)" }}>Widgets</span>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--vp-text-faint)", padding: 2, borderRadius: 4 }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--vp-text-primary)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--vp-text-faint)"; }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2" style={{ borderBottom: "1px solid var(--vp-border-subtle)" }}>
        <div
          className="flex items-center gap-1.5"
          style={{
            background: "var(--vp-bg-surface-hover)",
            borderRadius: 7,
            padding: "5px 8px",
            border: "1px solid var(--vp-border-subtle)",
          }}
        >
          <Search size={12} style={{ color: "var(--vp-text-subtle)", flexShrink: 0 }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            style={{
              background: "none",
              border: "none",
              outline: "none",
              color: "var(--vp-text-primary)",
              fontSize: 11,
              flex: 1,
              width: "100%",
            }}
          />
        </div>
      </div>

      {/* Category tabs */}
      <div
        className="flex gap-1 px-3 py-2"
        style={{ borderBottom: "1px solid var(--vp-border-subtle)", flexWrap: "wrap" }}
      >
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setCategory(cat.key)}
            style={{
              fontSize: 10,
              padding: "3px 8px",
              borderRadius: 5,
              background: category === cat.key ? "var(--vp-border-light)" : "transparent",
              border: "1px solid " + (category === cat.key ? "var(--vp-border-medium)" : "transparent"),
              color: category === cat.key ? "var(--vp-text-primary)" : "var(--vp-text-faint)",
              cursor: "pointer",
            }}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Templates */}
      {category === "all" && !search && (
        <div className="px-3 py-2" style={{ borderBottom: "1px solid var(--vp-border-subtle)" }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 5 }}>
            <div style={{ fontSize: 9, color: "var(--vp-text-faint)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Templates
            </div>
            <button
              onClick={() => setSavingTemplate(!savingTemplate)}
              title="Save current layout as template"
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: savingTemplate ? "var(--vp-accent-blue)" : "var(--vp-text-faint)",
                padding: 2, borderRadius: 4, display: "flex", alignItems: "center", gap: 3,
                fontSize: 9,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--vp-accent-blue)"; }}
              onMouseLeave={(e) => { if (!savingTemplate) e.currentTarget.style.color = "var(--vp-text-faint)"; }}
            >
              <Save size={10} />
              Save
            </button>
          </div>

          {/* Save template form */}
          {savingTemplate && (
            <div className="flex gap-1" style={{ marginBottom: 6 }}>
              <input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Template name..."
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") handleSaveTemplate(); if (e.key === "Escape") setSavingTemplate(false); }}
                style={{
                  flex: 1, fontSize: 10, padding: "4px 8px", borderRadius: 5,
                  background: "var(--vp-bg-surface-hover)", border: "1px solid var(--vp-border-subtle)",
                  color: "var(--vp-text-primary)", outline: "none",
                }}
              />
              <button
                onClick={handleSaveTemplate}
                style={{
                  fontSize: 10, padding: "4px 8px", borderRadius: 5,
                  background: "var(--vp-accent-blue-bg)", border: "1px solid var(--vp-accent-blue-border)",
                  color: "var(--vp-accent-blue)", cursor: "pointer",
                }}
              >
                Save
              </button>
            </div>
          )}

          {/* Template list */}
          {templates.length === 0 && !savingTemplate && (
            <div style={{ fontSize: 10, color: "var(--vp-text-subtle)", padding: "4px 0" }}>
              No templates yet. Save your current layout to create one.
            </div>
          )}
          <div className="flex flex-col gap-1">
            {templates.map((tpl) => (
              <div
                key={tpl.id}
                className="flex items-center gap-1.5"
                style={{
                  padding: "4px 6px", borderRadius: 5,
                  background: "var(--vp-bg-surface)", border: "1px solid var(--vp-border-subtle)",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--vp-border-subtle)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "var(--vp-bg-surface)"; }}
              >
                <Layout size={10} style={{ color: "var(--vp-accent-blue)", flexShrink: 0 }} />
                {renamingId === tpl.id ? (
                  <input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { renameTemplate(tpl.id, renameValue.trim() || tpl.name); setRenamingId(null); }
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    onBlur={() => { renameTemplate(tpl.id, renameValue.trim() || tpl.name); setRenamingId(null); }}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      flex: 1, fontSize: 10, padding: "1px 4px", borderRadius: 3,
                      background: "var(--vp-bg-surface-hover)", border: "1px solid var(--vp-border-medium)",
                      color: "var(--vp-text-primary)", outline: "none", minWidth: 0,
                    }}
                  />
                ) : (
                  <span
                    onClick={() => {
                      clearWidgets(workspaceId);
                      loadTemplate(workspaceId, tpl);
                    }}
                    style={{ flex: 1, fontSize: 10, color: "var(--vp-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {tpl.name}
                  </span>
                )}
                <span style={{ fontSize: 8, color: "var(--vp-text-subtle)", flexShrink: 0 }}>
                  {tpl.mode === "widget" ? `${tpl.widgets.length}w` : "term"}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); setRenamingId(tpl.id); setRenameValue(tpl.name); }}
                  title="Rename"
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--vp-text-subtle)", padding: 1 }}
                >
                  <Edit3 size={9} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    useConfirmStore.getState().showConfirm("Delete Template", `Delete "${tpl.name}"?`, () => deleteTemplate(tpl.id), { danger: true });
                  }}
                  title="Delete"
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--vp-text-subtle)", padding: 1 }}
                >
                  <Trash2 size={9} />
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={handleReset}
            style={{
              marginTop: 6,
              fontSize: 10,
              padding: "3px 8px",
              borderRadius: 5,
              background: "var(--vp-accent-red-bg)",
              border: "1px solid var(--vp-accent-red-border)",
              color: "var(--vp-accent-red-text)",
              cursor: "pointer",
              width: "100%",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--vp-accent-red-border)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--vp-accent-red-bg)";
            }}
          >
            Reset All Widgets
          </button>
        </div>
      )}

      {/* Widget list — draggable items */}
      <div className="flex-1 overflow-auto px-2 py-2" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {filtered.map((def) => {
          const Icon = getIcon(def.icon);
          const catColor = CATEGORY_COLORS[def.category] || "#888";
          const isPanelActive = def.panelWidget && showMissionPanel;
          return (
            <div
              key={def.type}
              draggable={!def.panelWidget}
              onDragStart={def.panelWidget ? undefined : (e) => handleDragStart(e, def)}
              onClick={() => handleAddWidget(def)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 8px",
                background: isPanelActive ? "var(--vp-accent-blue-bg)" : "var(--vp-bg-surface)",
                border: `1px solid ${isPanelActive ? "var(--vp-accent-blue-border)" : "var(--vp-bg-surface-hover)"}`,
                borderRadius: 8,
                cursor: def.panelWidget ? "pointer" : "grab",
                userSelect: "none",
              }}
              onMouseEnter={(e) => {
                if (!isPanelActive) {
                  e.currentTarget.style.background = "var(--vp-bg-surface-hover)";
                  e.currentTarget.style.borderColor = "var(--vp-border-light)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isPanelActive) {
                  e.currentTarget.style.background = "var(--vp-bg-surface)";
                  e.currentTarget.style.borderColor = "var(--vp-bg-surface-hover)";
                }
              }}
            >
              {/* Drag grip */}
              <GripVertical size={10} style={{ color: "var(--vp-text-subtle)", flexShrink: 0 }} />
              {/* Icon */}
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 6,
                  background: `${catColor}15`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Icon size={13} style={{ color: catColor }} />
              </div>
              {/* Info */}
              <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: "var(--vp-text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {def.name}
                </div>
                <div style={{ fontSize: 9, color: "var(--vp-text-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {def.description}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
