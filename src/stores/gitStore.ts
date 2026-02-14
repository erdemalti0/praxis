import { create } from "zustand";
import { invoke } from "../lib/ipc";

interface GitStatus {
  branch: string;
  staged: string[];
  unstaged: string[];
  untracked: string[];
  ahead: number;
  behind: number;
}

interface GitState {
  status: GitStatus | null;
  branches: string[];
  commitMessage: string;
  loading: boolean;
  error: string | null;

  refresh: (projectPath: string) => Promise<void>;
  stage: (projectPath: string, file: string) => Promise<void>;
  unstage: (projectPath: string, file: string) => Promise<void>;
  commit: (projectPath: string, message: string) => Promise<void>;
  pull: (projectPath: string) => Promise<void>;
  push: (projectPath: string) => Promise<void>;
  switchBranch: (projectPath: string, branch: string) => Promise<void>;
  loadBranches: (projectPath: string) => Promise<void>;
  setCommitMessage: (msg: string) => void;
}

export const useGitStore = create<GitState>((set, get) => ({
  status: null,
  branches: [],
  commitMessage: "",
  loading: false,
  error: null,

  refresh: async (projectPath) => {
    set({ loading: true, error: null });
    try {
      await invoke("set_project_path", projectPath);
      const status = await invoke<GitStatus>("git_status", { projectPath });
      set({ status });
    } catch (e: any) {
      set({ status: null, error: e.message || "Not a git repository" });
    } finally {
      set({ loading: false });
    }
  },

  stage: async (projectPath, file) => {
    await invoke("set_project_path", projectPath);
    await invoke("run_quick_command", { command: `git add "${file}"`, projectPath });
    await get().refresh(projectPath);
  },

  unstage: async (projectPath, file) => {
    await invoke("set_project_path", projectPath);
    await invoke("run_quick_command", { command: `git restore --staged "${file}"`, projectPath });
    await get().refresh(projectPath);
  },

  commit: async (projectPath, message) => {
    await invoke("set_project_path", projectPath);
    await invoke("run_quick_command", { command: `git commit -m "${message.replace(/"/g, '\\"')}"`, projectPath });
    set({ commitMessage: "" });
    await get().refresh(projectPath);
  },

  pull: async (projectPath) => {
    await invoke("set_project_path", projectPath);
    await invoke("run_quick_command", { command: "git pull", projectPath });
    await get().refresh(projectPath);
  },

  push: async (projectPath) => {
    await invoke("set_project_path", projectPath);
    await invoke("run_quick_command", { command: "git push", projectPath });
    await get().refresh(projectPath);
  },

  switchBranch: async (projectPath, branch) => {
    await invoke("set_project_path", projectPath);
    await invoke("run_quick_command", { command: `git checkout "${branch}"`, projectPath });
    await get().refresh(projectPath);
  },

  loadBranches: async (projectPath) => {
    await invoke("set_project_path", projectPath);
    const output = await invoke<string>("run_quick_command", { command: "git branch --list", projectPath });
    const branches = output
      .split("\n")
      .map((b: string) => b.replace(/^\*?\s+/, "").trim())
      .filter(Boolean);
    set({ branches });
  },

  setCommitMessage: (commitMessage) => set({ commitMessage }),
}));
