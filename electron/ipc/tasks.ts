import { ipcMain } from "electron";
import fs from "fs";
import path from "path";
import os from "os";
import { projectSlug } from "../utils/projectSlug";

interface PraxisTask {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

function getProjectDataDir(projectPath: string): string {
  return path.join(os.homedir(), ".praxis", "projects", projectSlug(projectPath));
}

function tasksFilePath(projectPath: string): string {
  return path.join(getProjectDataDir(projectPath), "tasks.json");
}

function oldTasksFilePath(projectPath: string): string {
  return path.join(projectPath, ".praxis", "tasks.json");
}

function ensureDir(projectPath: string): void {
  const dir = getProjectDataDir(projectPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function registerTasksHandlers() {
  ipcMain.handle("load_tasks", (_event, args: { projectPath: string }): PraxisTask[] => {
    const file = tasksFilePath(args.projectPath);
    if (!fs.existsSync(file)) {
      // Auto-migrate from old project-local tasks.json
      const oldFile = oldTasksFilePath(args.projectPath);
      if (fs.existsSync(oldFile)) {
        try {
          const content = fs.readFileSync(oldFile, "utf-8");
          const tasks = JSON.parse(content);
          ensureDir(args.projectPath);
          fs.writeFileSync(file, JSON.stringify(tasks, null, 2), "utf-8");
          return tasks;
        } catch {}
      }
      return [];
    }
    try {
      const content = fs.readFileSync(file, "utf-8");
      return JSON.parse(content);
    } catch {
      return [];
    }
  });

  ipcMain.handle("save_tasks", (_event, args: { projectPath: string; tasks: PraxisTask[] }) => {
    ensureDir(args.projectPath);
    const file = tasksFilePath(args.projectPath);
    fs.writeFileSync(file, JSON.stringify(args.tasks, null, 2), "utf-8");
  });
}
