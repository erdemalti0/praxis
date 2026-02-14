import { create } from "zustand";
import { invoke } from "../lib/ipc";

const EXT_LANG: Record<string, string> = {
  ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
  html: "xml", htm: "xml", css: "css", scss: "scss", less: "less",
  json: "json", md: "markdown", py: "python", rs: "rust", go: "go",
  java: "java", kt: "kotlin", swift: "swift", rb: "ruby", sh: "bash",
  bash: "bash", zsh: "bash", yml: "yaml", yaml: "yaml", toml: "ini",
  xml: "xml", svg: "xml", sql: "sql", graphql: "graphql", vue: "xml",
  c: "c", cpp: "cpp", h: "c", hpp: "cpp", cs: "csharp",
  php: "php", lua: "lua", r: "r", dart: "dart",
};

function detectLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  return EXT_LANG[ext] || "plaintext";
}

// Use preload's direct fs if available, otherwise fall back to run_quick_command IPC
async function readFileContent(filePath: string): Promise<string> {
  // Try direct preload API first (available after proper restart)
  if (typeof window.electronAPI.readFileSync === "function") {
    return window.electronAPI.readFileSync(filePath);
  }
  // Fallback: use run_quick_command via shell cat
  // Ensure project path is set first
  const project = (await import("./uiStore")).useUIStore.getState().selectedProject;
  if (project?.path) {
    await invoke("set_project_path", project.path);
  }
  const escaped = filePath.replace(/'/g, "'\\''");
  const result = await invoke<string>("run_quick_command", { command: `cat '${escaped}'` });
  if (result === "No project path set") {
    throw new Error("No project path set");
  }
  return result;
}

async function writeFileContent(filePath: string, content: string): Promise<void> {
  // Try direct preload API first
  if (typeof window.electronAPI.writeFileSync === "function") {
    window.electronAPI.writeFileSync(filePath, content);
    return;
  }
  // Fallback: use run_quick_command via shell tee
  const project = (await import("./uiStore")).useUIStore.getState().selectedProject;
  if (project?.path) {
    await invoke("set_project_path", project.path);
  }
  // Use base64 to safely pass content with special characters
  const b64 = btoa(unescape(encodeURIComponent(content)));
  const escaped = filePath.replace(/'/g, "'\\''");
  await invoke<string>("run_quick_command", { command: `echo '${b64}' | base64 -d > '${escaped}'` });
}

export interface EditorTab {
  filePath: string;
  fileName: string;
  content: string;
  savedContent: string;
  language: string;
}

interface EditorState {
  tabs: EditorTab[];
  activeFilePath: string | null;
  previousViewMode: string | null;

  openFile: (filePath: string) => void;
  closeFile: (filePath: string) => void;
  setActiveFile: (filePath: string) => void;
  updateContent: (filePath: string, content: string) => void;
  saveFile: (filePath: string) => void;
  saveActiveFile: () => void;
  createFile: (dirPath: string, fileName: string) => void;
  setPreviousViewMode: (mode: string) => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  tabs: [],
  activeFilePath: null,
  previousViewMode: null,

  openFile: (filePath: string) => {
    const existing = get().tabs.find((t) => t.filePath === filePath);
    if (existing) {
      set({ activeFilePath: filePath });
      // Re-read from disk if content hasn't been modified by user
      if (existing.content === existing.savedContent) {
        readFileContent(filePath).then((content) => {
          set((s) => ({
            tabs: s.tabs.map((t) =>
              t.filePath === filePath ? { ...t, content, savedContent: content } : t
            ),
          }));
        }).catch(() => {});
      }
      return;
    }
    const fileName = filePath.split("/").pop() || filePath;
    // Create tab immediately with loading state
    const tab: EditorTab = {
      filePath,
      fileName,
      content: "Loading...",
      savedContent: "",
      language: detectLanguage(filePath),
    };
    set((s) => ({
      tabs: [...s.tabs, tab],
      activeFilePath: filePath,
    }));
    // Load content async
    readFileContent(filePath).then((content) => {
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.filePath === filePath ? { ...t, content, savedContent: content } : t
        ),
      }));
    }).catch((err) => {
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.filePath === filePath
            ? { ...t, content: `// Error: ${String(err)}`, savedContent: "" }
            : t
        ),
      }));
    });
  },

  closeFile: (filePath: string) => {
    set((s) => {
      const tabs = s.tabs.filter((t) => t.filePath !== filePath);
      let activeFilePath = s.activeFilePath;
      if (activeFilePath === filePath) {
        activeFilePath = tabs.length > 0 ? tabs[tabs.length - 1].filePath : null;
      }
      return { tabs, activeFilePath };
    });
  },

  setActiveFile: (filePath: string) => set({ activeFilePath: filePath }),

  updateContent: (filePath: string, content: string) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.filePath === filePath ? { ...t, content } : t
      ),
    }));
  },

  saveFile: (filePath: string) => {
    const tab = get().tabs.find((t) => t.filePath === filePath);
    if (!tab) return;
    writeFileContent(filePath, tab.content).then(() => {
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.filePath === filePath ? { ...t, savedContent: tab.content } : t
        ),
      }));
    }).catch((err) => {
      console.error("Failed to save file:", err);
    });
  },

  saveActiveFile: () => {
    const active = get().activeFilePath;
    if (active) get().saveFile(active);
  },

  createFile: (dirPath: string, fileName: string) => {
    const filePath = dirPath.endsWith("/") ? dirPath + fileName : dirPath + "/" + fileName;
    writeFileContent(filePath, "").then(() => {
      get().openFile(filePath);
    }).catch((err) => {
      console.error("Failed to create file:", filePath, err);
    });
  },

  setPreviousViewMode: (mode: string) => set({ previousViewMode: mode }),
}));
