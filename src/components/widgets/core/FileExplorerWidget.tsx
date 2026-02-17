import FileExplorer from "../../explorer/FileExplorer";
import type { FileExplorerConfig } from "../../../types/widget";
import { useState, useEffect } from "react";
import { FolderOpen, Eye, EyeOff, FileCode } from "lucide-react";

import { useUIStore } from "../../../stores/uiStore";
import { useWidgetStore } from "../../../stores/widgetStore";

export default function FileExplorerWidget({
  widgetId,
  workspaceId,
  config = {},
}: {
  widgetId: string;
  workspaceId: string;
  config?: FileExplorerConfig;
}) {
  const [showHidden, setShowHidden] = useState(config.showHidden ?? false);
  const [previewEnabled, setPreviewEnabled] = useState(config.previewEnabled ?? false);
  const [customRoot, setCustomRoot] = useState(config.rootPath ?? "");

  // Persist user preferences
  useEffect(() => {
    useWidgetStore.getState().updateWidgetConfig(workspaceId, widgetId, { showHidden });
  }, [showHidden, workspaceId, widgetId]);

  useEffect(() => {
    useWidgetStore.getState().updateWidgetConfig(workspaceId, widgetId, { rootPath: customRoot });
  }, [customRoot, workspaceId, widgetId]);
  const selectedProject = useUIStore((s) => s.selectedProject);
  const setSelectedProject = useUIStore((s) => s.setSelectedProject);

  useEffect(() => {
    if (customRoot && selectedProject) {
      setSelectedProject({
        ...selectedProject,
        path: customRoot,
        name: customRoot.split("/").pop() || customRoot,
      });
    }
  }, [customRoot]);

  const extensions = config.fileExtensions ?? [];

  return (
    <div className="h-full flex flex-col">
      <div
        className="flex items-center gap-2"
        style={{
          padding: "4px 8px",
          borderBottom: "1px solid var(--vp-bg-surface-hover)",
        }}
      >
        <button
          onClick={async () => {
            try {
              const path = await window.electron?.invoke("open_directory_dialog");
              if (path) setCustomRoot(path);
            } catch {}
          }}
          style={{
            background: "none",
            border: "none",
            color: "var(--vp-text-faint)",
            cursor: "pointer",
            padding: 4,
          }}
          title="Select folder"
        >
          <FolderOpen size={12} />
        </button>
        <span
          style={{
            flex: 1,
            fontSize: 10,
            color: "var(--vp-text-dim)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {customRoot || selectedProject?.path || "Select a folder"}
        </span>
        <button
          onClick={() => setShowHidden(!showHidden)}
          style={{
            background: showHidden ? "var(--vp-border-light)" : "none",
            border: "none",
            color: showHidden ? "var(--vp-text-primary)" : "var(--vp-text-faint)",
            cursor: "pointer",
            padding: 4,
            borderRadius: 4,
          }}
          title={showHidden ? "Hide hidden files" : "Show hidden files"}
        >
          {showHidden ? <Eye size={12} /> : <EyeOff size={12} />}
        </button>
        <button
          onClick={() => setPreviewEnabled(!previewEnabled)}
          style={{
            background: previewEnabled ? "var(--vp-accent-blue-bg-hover)" : "none",
            border: "none",
            color: previewEnabled ? "var(--vp-accent-blue)" : "var(--vp-text-faint)",
            cursor: "pointer",
            padding: 4,
            borderRadius: 4,
          }}
          title={previewEnabled ? "Preview enabled" : "Preview disabled"}
        >
          <FileCode size={12} />
        </button>
      </div>

      {extensions.length > 0 && (
        <div
          style={{
            padding: "4px 8px",
            borderBottom: "1px solid var(--vp-bg-surface)",
            fontSize: 9,
            color: "var(--vp-text-faint)",
          }}
        >
          Filter: {extensions.join(", ")}
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        <FileExplorer showHidden={showHidden} />
      </div>
    </div>
  );
}
