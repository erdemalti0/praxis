import { ipcMain } from "electron";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

const execAsync = promisify(exec);

// Global projectPath kept for backward compatibility with set_project_path.
// Each handler also accepts an optional projectPath arg to avoid race conditions.
let projectPath = "";

export function registerGitHandlers() {
  ipcMain.handle("set_project_path", (_event, path: string) => {
    projectPath = path;
  });

  ipcMain.handle("git_status", async (_event, args?: { projectPath?: string }) => {
    const cwd = args?.projectPath || projectPath;
    if (!cwd) return null;
    try {
      // Run branch and status in parallel
      const [branchResult, statusResult] = await Promise.all([
        execAsync("git rev-parse --abbrev-ref HEAD", { cwd, encoding: "utf-8", timeout: 5000 }),
        execAsync("git status --porcelain", { cwd, encoding: "utf-8", timeout: 5000 }),
      ]);

      const branch = branchResult.stdout.trim();
      const statusOutput = statusResult.stdout;

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
        const abResult = await execAsync("git rev-list --left-right --count HEAD...@{upstream}", { cwd, encoding: "utf-8", timeout: 5000 });
        const [a, b] = abResult.stdout.trim().split(/\s+/);
        ahead = parseInt(a) || 0;
        behind = parseInt(b) || 0;
      } catch {}

      return { branch, staged, unstaged, untracked, ahead, behind };
    } catch {
      throw new Error("Not a git repository");
    }
  });

  ipcMain.handle("git_diff", async (_event, args: { staged: boolean; projectPath?: string }) => {
    const cwd = args?.projectPath || projectPath;
    if (!cwd) return "";
    try {
      const flag = args.staged ? "--cached" : "";
      const result = await execAsync(`git diff ${flag}`, { cwd, encoding: "utf-8", timeout: 10000 });
      return result.stdout;
    } catch {
      return "";
    }
  });

  ipcMain.handle("run_quick_command", async (_event, args: { command: string; projectPath?: string }) => {
    const cwd = args?.projectPath || projectPath;
    if (!cwd) return "No project path set";

    // Whitelist: only allow git commands to prevent command injection
    const cmd = args.command.trim();
    if (!cmd.startsWith("git ")) {
      return "Only git commands are allowed";
    }

    try {
      const result = await execAsync(cmd, { cwd, encoding: "utf-8", timeout: 15000 });
      return result.stdout;
    } catch (e: any) {
      return e.stderr || e.message || "Command failed";
    }
  });

  ipcMain.handle("git_clone_repo", async (_event, args: { repoUrl: string; targetDir: string }) => {
    const { repoUrl, targetDir } = args;
    if (!repoUrl || !targetDir) throw new Error("Missing repoUrl or targetDir");

    // Basic URL validation to prevent command injection
    if (!/^(https?:\/\/|git@)[\w.\-\/:@]+$/i.test(repoUrl)) {
      throw new Error("Invalid repository URL");
    }

    try {
      const { stdout } = await execAsync(`git clone "${repoUrl}"`, {
        cwd: targetDir,
        encoding: "utf-8",
        timeout: 120000,
      });

      // Extract the cloned directory name from the repo URL
      const repoName = repoUrl
        .replace(/\.git$/, "")
        .split("/")
        .pop()!
        .replace(/[^\w.\-]/g, "");
      const clonedPath = path.join(targetDir, repoName);

      // Verify the directory exists
      await fs.promises.access(clonedPath);
      return clonedPath;
    } catch (e: any) {
      throw new Error(e.stderr || e.message || "Clone failed");
    }
  });

  ipcMain.handle("git_branches", async (_event, args: { cwd: string }) => {
    const cwd = args.cwd || projectPath;
    if (!cwd) return { branches: [] };
    try {
      const result = await execAsync("git branch --format='%(refname:short)' -a", {
        cwd,
        encoding: "utf-8",
        timeout: 5000,
      });
      const branches = result.stdout
        .split("\n")
        .map((b) => b.trim().replace(/^'|'$/g, ""))
        .filter(Boolean)
        .map((b) => b.replace(/^remotes\/origin\//, ""))
        .filter((v, i, arr) => arr.indexOf(v) === i); // deduplicate
      return { branches };
    } catch {
      return { branches: [] };
    }
  });

  ipcMain.handle("read_package_scripts", async (_event, args: { cwd: string }) => {
    const cwd = args.cwd || projectPath;
    if (!cwd) return { scripts: {} };
    try {
      const pkgPath = path.join(cwd, "package.json");
      const content = await fs.promises.readFile(pkgPath, "utf-8");
      const pkg = JSON.parse(content);
      return { scripts: pkg.scripts || {} };
    } catch {
      return { scripts: {} };
    }
  });

  ipcMain.handle("read_env_file", async (_event, args?: { projectPath?: string }) => {
    const cwd = args?.projectPath || projectPath;
    if (!cwd) return "";
    try {
      const envPath = path.join(cwd, ".env");
      return await fs.promises.readFile(envPath, "utf-8");
    } catch {
      return "";
    }
  });

  ipcMain.handle("list_images", async (_event, args?: { projectPath?: string }) => {
    const cwd = args?.projectPath || projectPath;
    if (!cwd) return [];
    try {
      const exts = new Set([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico"]);
      const results: { name: string; path: string; size: number }[] = [];

      async function scan(dir: string, depth: number) {
        if (depth > 3 || results.length >= 100) return;
        try {
          const entries = await fs.promises.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (results.length >= 100) return;
            if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              await scan(full, depth + 1);
            } else if (exts.has(path.extname(entry.name).toLowerCase())) {
              const stat = await fs.promises.stat(full);
              results.push({ name: entry.name, path: full, size: stat.size });
            }
          }
        } catch {}
      }
      await scan(cwd, 0);
      return results;
    } catch {
      return [];
    }
  });
}
