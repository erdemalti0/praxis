// Auto-refresh test
import { useEffect, useState } from "react";
import AppShell from "./components/layout/AppShell";
import ProjectSelect from "./components/project/ProjectSelect";
import ToastContainer from "./components/ui/Toast";
import { useUIStore } from "./stores/uiStore";
import ConfirmDialog from "./components/ui/ConfirmDialog";
import CommandPalette from "./components/ui/CommandPalette";
import { useSettingsStore } from "./stores/settingsStore";
import { parseHistoryJsonl, parseIncrementalLine } from "./lib/parsers/historyParser";
import { parseStatsCache } from "./lib/parsers/statsParser";
import { invoke, listen } from "./lib/ipc";
import { useMenuEvents } from "./hooks/useMenuEvents";
import { useGlobalShortcuts } from "./hooks/useGlobalShortcuts";
import { usePersistence } from "./hooks/usePersistence";
import { useAgentDetection } from "./hooks/useAgentDetection";

function getProjectFromURL(): { name: string; path: string } | null {
  const params = new URLSearchParams(window.location.search);
  const name = params.get("projectName");
  const path = params.get("projectPath");
  if (name && path) return { name, path };
  return null;
}

function App() {
  useMenuEvents();
  useGlobalShortcuts();
  usePersistence();
  useAgentDetection();

  // Prevent Electron's default file-drop behavior (navigating to the file)
  useEffect(() => {
    const prevent = (e: DragEvent) => { e.preventDefault(); };
    document.addEventListener("dragover", prevent);
    document.addEventListener("drop", prevent);
    return () => {
      document.removeEventListener("dragover", prevent);
      document.removeEventListener("drop", prevent);
    };
  }, []);

  const setHistoryEntries = useUIStore((s) => s.setHistoryEntries);
  const addHistoryEntry = useUIStore((s) => s.addHistoryEntry);
  const setTodayStats = useUIStore((s) => s.setTodayStats);
  const selectedProject = useUIStore((s) => s.selectedProject);
  const setSelectedProject = useUIStore((s) => s.setSelectedProject);
  const [error, setError] = useState<string | null>(null);

  // On mount, check if this window was opened with project params
  // or auto-open last project based on startup behavior setting
  useEffect(() => {
    const projectFromURL = getProjectFromURL();
    if (projectFromURL && !selectedProject) {
      const project = {
        name: projectFromURL.name,
        path: projectFromURL.path,
        lastModified: Date.now() / 1000,
      };
      setSelectedProject(project);
      useSettingsStore.getState().addRecentProject(project);
    } else if (!selectedProject) {
      // Auto-open last project if startup behavior is set to 'last-project'
      const settings = useSettingsStore.getState();
      if (settings.startupBehavior === "last-project" && settings.recentProjects.length > 0) {
        setSelectedProject(settings.recentProjects[0]);
      }
    }
  }, []);

  // Listen for open-project events from main process (second-instance / CLI)
  useEffect(() => {
    const unlisten = listen("open-project", (data: { name: string; path: string }) => {
      const project = {
        name: data.name,
        path: data.path,
        lastModified: Date.now() / 1000,
      };
      setSelectedProject(project);
      useSettingsStore.getState().addRecentProject(project);
    });
    return () => unlisten();
  }, [setSelectedProject]);

  // Notify main process when selected project changes (for duplicate window detection)
  useEffect(() => {
    if (selectedProject?.path) {
      invoke("set_window_project", selectedProject.path);
    }
  }, [selectedProject?.path]);

  useEffect(() => {
    if (!selectedProject) return;

    let unlistenHistory: (() => void) | undefined;
    let unlistenStats: (() => void) | undefined;

    async function init() {
      try {
        // Load initial data
        const [historyContent, statsContent] = await Promise.allSettled([
          invoke<string>("read_history"),
          invoke<string>("read_stats"),
        ]);

        if (historyContent.status === "fulfilled" && historyContent.value) {
          setHistoryEntries(parseHistoryJsonl(historyContent.value));
        }
        if (statsContent.status === "fulfilled" && statsContent.value) {
          setTodayStats(parseStatsCache(statsContent.value));
        }

        // File watcher events
        unlistenHistory = listen("history-updated", (payload: string) => {
          const entry = parseIncrementalLine(payload);
          if (entry) addHistoryEntry(entry);
        });

        unlistenStats = listen("stats-updated", (payload: string) => {
          const stats = parseStatsCache(payload);
          if (stats) setTodayStats(stats);
        });
      } catch (err) {
        console.error("Init error:", err);
        setError(String(err));
      }
    }

    init();

    return () => {
      unlistenHistory?.();
      unlistenStats?.();
    };
  }, [selectedProject, setHistoryEntries, addHistoryEntry, setTodayStats]);

  if (error) {
    return (
      <div style={{ background: "var(--vp-bg-primary)", color: "var(--vp-accent-red-text)", padding: 20, fontFamily: "monospace", height: "100vh" }}>
        <h1>Error</h1>
        <pre>{error}</pre>
      </div>
    );
  }

  const content = !selectedProject ? <ProjectSelect /> : <AppShell />;

  return (
    <>
      {content}
      <ToastContainer />
      <ConfirmDialog />
      <CommandPalette />
    </>
  );
}

export default App;
