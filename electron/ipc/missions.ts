import { ipcMain } from "electron";
import fs from "fs";
import path from "path";
import os from "os";
import { projectSlug } from "../utils/projectSlug";

interface Mission {
  id: string;
  title: string;
  description: string;
  steps: any[];
  createdAt: number;
  updatedAt: number;
}

function getProjectDataDir(projectPath: string): string {
  return path.join(os.homedir(), ".praxis", "projects", projectSlug(projectPath));
}

function missionsFilePath(projectPath: string): string {
  return path.join(getProjectDataDir(projectPath), "missions.json");
}

function oldMissionsFilePath(projectPath: string): string {
  return path.join(projectPath, ".praxis", "missions.json");
}

function tasksFilePath(projectPath: string): string {
  return path.join(projectPath, ".praxis", "tasks.json");
}

function ensureDir(projectPath: string): void {
  const dir = getProjectDataDir(projectPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function registerMissionsHandlers() {
  ipcMain.handle("load_missions", (_event, args: { projectPath: string }): Mission[] => {
    const file = missionsFilePath(args.projectPath);
    if (!fs.existsSync(file)) {
      // Auto-migrate from old project-local missions.json if it exists
      const oldMissions = oldMissionsFilePath(args.projectPath);
      if (fs.existsSync(oldMissions)) {
        try {
          const content = fs.readFileSync(oldMissions, "utf-8");
          const missions = JSON.parse(content);
          ensureDir(args.projectPath);
          fs.writeFileSync(file, JSON.stringify(missions, null, 2), "utf-8");
          return missions;
        } catch {}
      }
      // Auto-migrate from old tasks.json if it exists
      const oldFile = tasksFilePath(args.projectPath);
      if (fs.existsSync(oldFile)) {
        try {
          const content = fs.readFileSync(oldFile, "utf-8");
          const tasks = JSON.parse(content);
          if (Array.isArray(tasks) && tasks.length > 0) {
            const now = Math.floor(Date.now() / 1000);
            const mission: Mission = {
              id: `mission-${Date.now()}`,
              title: "Migrated Tasks",
              description: "Tasks migrated from the old task system",
              steps: tasks.map((t: any) => ({
                id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                missionId: "",
                title: t.title || "Untitled",
                description: t.description || "",
                prompt: t.prompt,
                status: t.status === "done" ? "done" : t.status === "in_progress" ? "in_progress" : "pending",
                parentId: null,
                children: [],
                position: { x: 0, y: 0 },
                createdAt: t.createdAt || now,
                updatedAt: t.updatedAt || now,
              })),
              createdAt: now,
              updatedAt: now,
            };
            // Set missionId on all steps
            for (const step of mission.steps) {
              step.missionId = mission.id;
            }
            const missions = [mission];
            ensureDir(args.projectPath);
            fs.writeFileSync(file, JSON.stringify(missions, null, 2), "utf-8");
            return missions;
          }
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

  ipcMain.handle("save_missions", (_event, args: { projectPath: string; missions: Mission[] }) => {
    ensureDir(args.projectPath);
    const file = missionsFilePath(args.projectPath);
    fs.writeFileSync(file, JSON.stringify(args.missions, null, 2), "utf-8");
  });
}
