import { ipcMain } from "electron";
import { execSync } from "child_process";

// Global projectPath kept for backward compatibility with set_project_path.
// Each handler also accepts an optional projectPath arg to avoid race conditions.
let projectPath = "";

export function registerGitHandlers() {
  ipcMain.handle("set_project_path", (_event, path: string) => {
    projectPath = path;
  });

  ipcMain.handle("git_status", (_event, args?: { projectPath?: string }) => {
    const cwd = args?.projectPath || projectPath;
    if (!cwd) return null;
    try {
      const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd, encoding: "utf-8", timeout: 5000 }).trim();
      const statusOutput = execSync("git status --porcelain", { cwd, encoding: "utf-8", timeout: 5000 });

      const staged: string[] = [];
      const unstaged: string[] = [];
      const untracked: string[] = [];

      for (const line of statusOutput.split("\n").filter(Boolean)) {
        const x = line[0];
        const y = line[1];
        const file = line.slice(3);
        if (x === "?" && y === "?") untracked.push(file);
        else {
          if (x !== " " && x !== "?") staged.push(file);
          if (y !== " " && y !== "?") unstaged.push(file);
        }
      }

      let ahead = 0, behind = 0;
      try {
        const abOutput = execSync("git rev-list --left-right --count HEAD...@{upstream}", { cwd, encoding: "utf-8", timeout: 5000 }).trim();
        const [a, b] = abOutput.split(/\s+/);
        ahead = parseInt(a) || 0;
        behind = parseInt(b) || 0;
      } catch {}

      return { branch, staged, unstaged, untracked, ahead, behind };
    } catch {
      throw new Error("Not a git repository");
    }
  });

  ipcMain.handle("git_diff", (_event, args: { staged: boolean; projectPath?: string }) => {
    const cwd = args?.projectPath || projectPath;
    if (!cwd) return "";
    try {
      const flag = args.staged ? "--cached" : "";
      return execSync(`git diff ${flag}`, { cwd, encoding: "utf-8", timeout: 10000 });
    } catch {
      return "";
    }
  });

  ipcMain.handle("run_quick_command", (_event, args: { command: string; projectPath?: string }) => {
    const cwd = args?.projectPath || projectPath;
    if (!cwd) return "No project path set";
    try {
      return execSync(args.command, { cwd, encoding: "utf-8", timeout: 15000 });
    } catch (e: any) {
      return e.stderr || e.message || "Command failed";
    }
  });

  ipcMain.handle("read_env_file", (_event, args?: { projectPath?: string }) => {
    const cwd = args?.projectPath || projectPath;
    if (!cwd) return "";
    try {
      const fs = require("fs");
      const path = require("path");
      const envPath = path.join(cwd, ".env");
      return fs.readFileSync(envPath, "utf-8");
    } catch {
      return "";
    }
  });

  ipcMain.handle("list_images", (_event, args?: { projectPath?: string }) => {
    const cwd = args?.projectPath || projectPath;
    if (!cwd) return [];
    try {
      const fs = require("fs");
      const path = require("path");
      const exts = [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico"];
      const results: { name: string; path: string; size: number }[] = [];

      function scan(dir: string, depth: number) {
        if (depth > 3) return;
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) scan(full, depth + 1);
            else if (exts.some((e: string) => entry.name.toLowerCase().endsWith(e))) {
              const stat = fs.statSync(full);
              results.push({ name: entry.name, path: full, size: stat.size });
            }
          }
        } catch {}
      }
      scan(cwd, 0);
      return results.slice(0, 100);
    } catch {
      return [];
    }
  });
}
