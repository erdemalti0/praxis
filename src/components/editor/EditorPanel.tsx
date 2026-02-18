import { useEditorStore } from "../../stores/editorStore";
import { useUIStore } from "../../stores/uiStore";
import { useConfirmStore } from "../../stores/confirmStore";
import { X, FileCode2 } from "lucide-react";
import CodeEditor from "./CodeEditor";

export default function EditorPanel() {
  const tabs = useEditorStore((s) => s.tabs);
  const activeFilePath = useEditorStore((s) => s.activeFilePath);
  const setActiveFile = useEditorStore((s) => s.setActiveFile);
  const closeFile = useEditorStore((s) => s.closeFile);
  const previousViewMode = useEditorStore((s) => s.previousViewMode);
  const setViewMode = useUIStore((s) => s.setViewMode);

  const activeTab = tabs.find((t) => t.filePath === activeFilePath);

  const doClose = (filePath: string) => {
    closeFile(filePath);
    const remaining = tabs.filter((t) => t.filePath !== filePath);
    if (remaining.length === 0) {
      setViewMode((previousViewMode as any) || "terminal");
    }
  };

  const handleClose = (filePath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const tab = tabs.find((t) => t.filePath === filePath);
    if (tab && tab.content !== tab.savedContent) {
      useConfirmStore.getState().showConfirm(
        "Unsaved Changes",
        `Save changes to ${tab.fileName}?`,
        () => {
          useEditorStore.getState().saveFile(filePath);
          doClose(filePath);
        },
        {
          confirmLabel: "Save",
          cancelLabel: "Discard",
          onCancel: () => doClose(filePath),
        }
      );
      return;
    }
    doClose(filePath);
  };

  if (tabs.length === 0) {
    return (
      <div
        style={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--vp-text-dim)",
          gap: 12,
        }}
      >
        <FileCode2 size={36} style={{ color: "var(--vp-text-faint)" }} />
        <div style={{ fontSize: 13 }}>Open a file from the explorer</div>
        <div style={{ fontSize: 11, color: "var(--vp-text-faint)" }}>Click any file in the sidebar to edit it</div>
      </div>
    );
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          background: "var(--vp-bg-secondary)",
          borderBottom: "1px solid var(--vp-border-subtle)",
          height: 36,
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", flex: 1, overflow: "auto hidden", gap: 0 }}>
          {tabs.map((tab) => {
            const isActive = tab.filePath === activeFilePath;
            const isDirty = tab.content !== tab.savedContent;
            return (
              <button
                key={tab.filePath}
                onClick={() => setActiveFile(tab.filePath)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "0 12px",
                  height: 36,
                  background: isActive ? "var(--vp-bg-tertiary)" : "transparent",
                  border: "none",
                  borderRight: "1px solid var(--vp-border-subtle)",
                  borderBottom: isActive ? "1px solid var(--vp-bg-primary)" : "1px solid transparent",
                  borderTop: isActive ? "1px solid var(--vp-accent-blue-glow)" : "1px solid transparent",
                  cursor: "pointer",
                  transition: "background 0.1s",
                  flexShrink: 0,
                  maxWidth: 180,
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = "var(--vp-bg-surface-hover)";
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = "transparent";
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: isActive ? 500 : 400,
                    color: isActive ? "var(--vp-text-primary)" : "var(--vp-text-dim)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {tab.fileName}
                </span>
                {isDirty && (
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "var(--vp-text-primary)",
                      flexShrink: 0,
                    }}
                  />
                )}
                <button
                  aria-label="Close tab"
                  onClick={(e) => handleClose(tab.filePath, e)}
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: "var(--vp-radius-sm)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    cursor: "pointer",
                    opacity: isActive ? 0.6 : 0,
                    transition: "opacity 0.1s, background 0.1s",
                    background: "transparent",
                    border: "none",
                    padding: 0,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = "1";
                    e.currentTarget.style.background = "var(--vp-border-subtle)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = isActive ? "0.6" : "0";
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <X size={10} style={{ color: "var(--vp-text-muted)" }} />
                </button>
              </button>
            );
          })}
        </div>
      </div>

      {/* Editor */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {activeTab && (
          <CodeEditor
            key={activeTab.filePath}
            filePath={activeTab.filePath}
            content={activeTab.content}
            language={activeTab.language}
          />
        )}
      </div>
    </div>
  );
}
