import { create } from "zustand";
import { invoke } from "../lib/ipc";
import type { PraxisTask, TaskStatus } from "../types/session";

interface TaskState {
  tasks: PraxisTask[];
  loading: boolean;

  loadTasks: (projectPath: string) => Promise<void>;
  addTask: (
    projectPath: string,
    title: string,
    description: string,
    prompt: string,
    tags: string[]
  ) => Promise<void>;
  updateTask: (
    projectPath: string,
    id: string,
    updates: Partial<Pick<PraxisTask, "title" | "description" | "prompt" | "status" | "tags">>
  ) => Promise<void>;
  deleteTask: (projectPath: string, id: string) => Promise<void>;
  moveTask: (projectPath: string, id: string, status: TaskStatus) => Promise<void>;
}

function now() {
  return Math.floor(Date.now() / 1000);
}

function genId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function persist(projectPath: string, tasks: PraxisTask[]) {
  await invoke("save_tasks", { projectPath, tasks });
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  loading: false,

  loadTasks: async (projectPath) => {
    set({ loading: true });
    try {
      const tasks = await invoke<PraxisTask[]>("load_tasks", { projectPath });
      set({ tasks });
    } catch {
      set({ tasks: [] });
    } finally {
      set({ loading: false });
    }
  },

  addTask: async (projectPath, title, description, prompt, tags) => {
    const task: PraxisTask = {
      id: genId(),
      title,
      description,
      prompt,
      status: "todo",
      tags,
      createdAt: now(),
      updatedAt: now(),
    };
    const tasks = [...get().tasks, task];
    set({ tasks });
    await persist(projectPath, tasks);
  },

  updateTask: async (projectPath, id, updates) => {
    const tasks = get().tasks.map((t) =>
      t.id === id ? { ...t, ...updates, updatedAt: now() } : t
    );
    set({ tasks });
    await persist(projectPath, tasks);
  },

  deleteTask: async (projectPath, id) => {
    const tasks = get().tasks.filter((t) => t.id !== id);
    set({ tasks });
    await persist(projectPath, tasks);
  },

  moveTask: async (projectPath, id, status) => {
    const tasks = get().tasks.map((t) =>
      t.id === id ? { ...t, status, updatedAt: now() } : t
    );
    set({ tasks });
    await persist(projectPath, tasks);
  },
}));
