import { create } from "zustand";
import type { WidgetInstance, WidgetLayoutItem } from "../types/widget";
import { WIDGET_REGISTRY } from "../components/widgets/registry";
import { loadJsonFile } from "../lib/persistence";
import type { WorkspaceTemplate } from "./settingsStore";

interface WidgetState {
  // Per-workspace widget instances and layouts
  workspaceWidgets: Record<string, WidgetInstance[]>;
  workspaceLayouts: Record<string, WidgetLayoutItem[]>;

  addWidget: (workspaceId: string, type: string, config?: Record<string, any>) => void;
  removeWidget: (workspaceId: string, widgetId: string) => void;
  updateWidgetConfig: (workspaceId: string, widgetId: string, config: Record<string, any>) => void;
  updateLayout: (workspaceId: string, layout: WidgetLayoutItem[]) => void;
  getWidgets: (workspaceId: string) => WidgetInstance[];
  getLayout: (workspaceId: string) => WidgetLayoutItem[];
  loadTemplate: (workspaceId: string, template: WorkspaceTemplate) => void;
  clearWidgets: (workspaceId: string) => void;
  loadWidgets: (projectPath: string) => void;
  renameWidget: (workspaceId: string, widgetId: string, name: string) => void;
  toggleWidgetLock: (workspaceId: string, widgetId: string) => void;
  duplicateWidget: (workspaceId: string, widgetId: string) => void;
  _widgetsLoaded: boolean;
}

const GRID_COLS = 12;

function findNextPosition(layout: WidgetLayoutItem[], w: number, h: number): { x: number; y: number } {
  if (layout.length === 0) return { x: 0, y: 0 };

  // Find the max y + h to place below existing widgets
  let maxBottom = 0;
  for (const item of layout) {
    maxBottom = Math.max(maxBottom, item.y + item.h);
  }

  // Try to fit in existing rows first
  for (let y = 0; y <= maxBottom; y++) {
    for (let x = 0; x <= GRID_COLS - w; x++) {
      const overlaps = layout.some(
        (item) => x < item.x + item.w && x + w > item.x && y < item.y + item.h && y + h > item.y
      );
      if (!overlaps) return { x, y };
    }
  }

  return { x: 0, y: maxBottom };
}


export const useWidgetStore = create<WidgetState>((set, get) => ({
  workspaceWidgets: {},
  workspaceLayouts: {},
  _widgetsLoaded: false,

  addWidget: (workspaceId, type, config) => {
    const def = WIDGET_REGISTRY.find((d) => d.type === type);
    if (!def) return;

    set((s) => {
      const widgets = s.workspaceWidgets[workspaceId] || [];
      const layout = s.workspaceLayouts[workspaceId] || [];

      // Check singleton
      if (def.singleton && widgets.some((w) => w.type === type)) return s;

      const id = `widget-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const pos = findNextPosition(layout, def.defaultSize.w, def.defaultSize.h);

      const newWidget: WidgetInstance = { id, type, config };
      const newLayoutItem: WidgetLayoutItem = {
        i: id,
        x: pos.x,
        y: pos.y,
        w: def.defaultSize.w,
        h: def.defaultSize.h,
      };

      return {
        workspaceWidgets: { ...s.workspaceWidgets, [workspaceId]: [...widgets, newWidget] },
        workspaceLayouts: { ...s.workspaceLayouts, [workspaceId]: [...layout, newLayoutItem] },
      };
    });
  },

  removeWidget: (workspaceId, widgetId) => {
    set((s) => ({
      workspaceWidgets: {
        ...s.workspaceWidgets,
        [workspaceId]: (s.workspaceWidgets[workspaceId] || []).filter((w) => w.id !== widgetId),
      },
      workspaceLayouts: {
        ...s.workspaceLayouts,
        [workspaceId]: (s.workspaceLayouts[workspaceId] || []).filter((l) => l.i !== widgetId),
      },
    }));
  },

  updateWidgetConfig: (workspaceId, widgetId, config) => {
    set((s) => ({
      workspaceWidgets: {
        ...s.workspaceWidgets,
        [workspaceId]: (s.workspaceWidgets[workspaceId] || []).map((w) =>
          w.id === widgetId ? { ...w, config: { ...w.config, ...config } } : w
        ),
      },
    }));
  },

  updateLayout: (workspaceId, layout) => {
    set((s) => ({
      workspaceLayouts: { ...s.workspaceLayouts, [workspaceId]: layout },
    }));
  },

  getWidgets: (workspaceId) => get().workspaceWidgets[workspaceId] || [],
  getLayout: (workspaceId) => get().workspaceLayouts[workspaceId] || [],

  loadTemplate: (workspaceId, template) => {
    if (template.mode !== "widget" || !template.widgets.length) return;

    const widgets: WidgetInstance[] = [];
    const layout: WidgetLayoutItem[] = [];

    for (const item of template.widgets) {
      const id = `widget-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      widgets.push({ id, type: item.type, config: item.config });
      layout.push({ i: id, x: item.x, y: item.y, w: item.w, h: item.h });
    }

    set((s) => ({
      workspaceWidgets: { ...s.workspaceWidgets, [workspaceId]: widgets },
      workspaceLayouts: { ...s.workspaceLayouts, [workspaceId]: layout },
    }));
  },

  clearWidgets: (workspaceId) => {
    set((s) => ({
      workspaceWidgets: { ...s.workspaceWidgets, [workspaceId]: [] },
      workspaceLayouts: { ...s.workspaceLayouts, [workspaceId]: [] },
    }));
  },

  loadWidgets: (projectPath) => {
    const path = `${projectPath}/widgets.json`;
    const data = loadJsonFile(path, {
      workspaceWidgets: {} as Record<string, WidgetInstance[]>,
      workspaceLayouts: {} as Record<string, WidgetLayoutItem[]>,
    });
    set({
      workspaceWidgets: data.workspaceWidgets,
      workspaceLayouts: data.workspaceLayouts,
      _widgetsLoaded: true,
    });
  },

  renameWidget: (workspaceId, widgetId, name) => {
    set((s) => ({
      workspaceWidgets: {
        ...s.workspaceWidgets,
        [workspaceId]: (s.workspaceWidgets[workspaceId] || []).map((w) =>
          w.id === widgetId ? { ...w, customName: name || undefined } : w
        ),
      },
    }));
  },

  toggleWidgetLock: (workspaceId, widgetId) => {
    set((s) => ({
      workspaceWidgets: {
        ...s.workspaceWidgets,
        [workspaceId]: (s.workspaceWidgets[workspaceId] || []).map((w) =>
          w.id === widgetId ? { ...w, locked: !w.locked } : w
        ),
      },
    }));
  },

  duplicateWidget: (workspaceId, widgetId) => {
    const s = get();
    const widgets = s.workspaceWidgets[workspaceId] || [];
    const layout = s.workspaceLayouts[workspaceId] || [];
    const widget = widgets.find((w) => w.id === widgetId);
    const layoutItem = layout.find((l) => l.i === widgetId);
    if (!widget || !layoutItem) return;

    const newId = `widget-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newWidget: WidgetInstance = {
      id: newId,
      type: widget.type,
      config: widget.config ? { ...widget.config } : undefined,
      customName: widget.customName ? `${widget.customName} (copy)` : undefined,
    };
    const pos = findNextPosition(layout, layoutItem.w, layoutItem.h);
    const newLayoutItem: WidgetLayoutItem = {
      i: newId,
      x: pos.x,
      y: pos.y,
      w: layoutItem.w,
      h: layoutItem.h,
    };

    set((s) => ({
      workspaceWidgets: {
        ...s.workspaceWidgets,
        [workspaceId]: [...(s.workspaceWidgets[workspaceId] || []), newWidget],
      },
      workspaceLayouts: {
        ...s.workspaceLayouts,
        [workspaceId]: [...(s.workspaceLayouts[workspaceId] || []), newLayoutItem],
      },
    }));
  },
}));
