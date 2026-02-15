import { ipcMain } from "electron";
import fs from "fs";
import path from "path";
import os from "os";

interface ProjectInfo {
  name: string;
  path: string;
  lastModified: number;
}

export function registerSessionsHandlers() {
  ipcMain.handle("get_home_dir", () => {
    return os.homedir();
  });

  ipcMain.handle("read_history", () => {
    const historyPath = path.join(os.homedir(), ".claude", "history.jsonl");
    if (!fs.existsSync(historyPath)) return "";
    return fs.readFileSync(historyPath, "utf-8");
  });

  ipcMain.handle("list_recent_projects", (): ProjectInfo[] => {
    const projectsDir = path.join(os.homedir(), ".claude", "projects");
    if (!fs.existsSync(projectsDir)) return [];

    const projects: ProjectInfo[] = [];
    const entries = fs.readdirSync(projectsDir);

    for (const dirName of entries) {
      const fullPath = path.join(projectsDir, dirName);
      try {
        const stat = fs.statSync(fullPath);
        if (!stat.isDirectory()) continue;

        // Decode slug back to path: "-home-user-projects-myapp" -> "/home/user/projects/myapp"
        const decodedPath = "/" + dirName.replace(/^-/, "").replace(/-/g, "/");
        const name = decodedPath.split("/").filter(Boolean).pop() || dirName;
        const lastModified = Math.floor(stat.mtimeMs / 1000);

        projects.push({ name, path: decodedPath, lastModified });
      } catch {
        continue;
      }
    }

    projects.sort((a, b) => b.lastModified - a.lastModified);
    return projects;
  });
}
