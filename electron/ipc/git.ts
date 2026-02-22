import { ipcMain } from "electron";
import { exec, execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

// Git subcommands allowed via run_quick_command
const ALLOWED_GIT_SUBCOMMANDS = new Set([
  "add", "restore", "commit", "pull", "push", "checkout", "branch",
  "status", "diff", "log", "stash", "merge", "rebase", "fetch",
  "reset", "clean", "rm", "mv", "tag", "show", "rev-parse", "config",
]);

// Shell metacharacters that must not appear in unquoted git arguments
const SHELL_METACHARS = /[;&|`$(){}!<>]/;

/**
 * Parse a "git ..." command string into an array of arguments.
 * Handles double-quoted arguments. Rejects shell metacharacters in unquoted args.
 * Returns null if the command is invalid or contains dangerous characters.
 */
function parseGitCommand(cmd: string): string[] | null {
  if (!cmd.startsWith("git ")) return null;
  const rest = cmd.slice(4);

  const args: string[] = [];
  let i = 0;
  while (i < rest.length) {
    // Skip whitespace
    while (i < rest.length && rest[i] === " ") i++;
    if (i >= rest.length) break;

    if (rest[i] === '"') {
      // Quoted argument — content is taken literally
      i++; // skip opening quote
      let arg = "";
      while (i < rest.length && rest[i] !== '"') {
        if (rest[i] === "\\" && i + 1 < rest.length && rest[i + 1] === '"') {
          arg += '"';
          i += 2;
        } else {
          arg += rest[i];
          i++;
        }
      }
      if (i >= rest.length) return null; // unclosed quote
      i++; // skip closing quote
      args.push(arg);
    } else if (rest[i] === "'") {
      // Single-quoted argument — content is taken literally
      i++; // skip opening quote
      let arg = "";
      while (i < rest.length && rest[i] !== "'") {
        arg += rest[i];
        i++;
      }
      if (i >= rest.length) return null; // unclosed quote
      i++; // skip closing quote
      args.push(arg);
    } else {
      // Unquoted argument
      let arg = "";
      while (i < rest.length && rest[i] !== " ") {
        arg += rest[i];
        i++;
      }
      // Reject shell metacharacters in unquoted args
      if (SHELL_METACHARS.test(arg)) {
        console.warn(`[git] Rejected command with shell metachar: ${arg}`);
        return null;
      }
      args.push(arg);
    }
  }

  return args.length > 0 ? args : null;
}

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

    const cmd = args.command.trim();
    if (!cmd.startsWith("git ")) {
      return "Only git commands are allowed";
    }

    // Parse command into safe args array — rejects shell metacharacters
    const gitArgs = parseGitCommand(cmd);
    if (!gitArgs) {
      return "Invalid git command format";
    }

    // Validate the subcommand against allowlist
    const subcommand = gitArgs[0];
    if (!ALLOWED_GIT_SUBCOMMANDS.has(subcommand)) {
      return `Git subcommand not allowed: ${subcommand}`;
    }

    try {
      const result = await execFileAsync("git", gitArgs, {
        cwd,
        encoding: "utf-8",
        timeout: 15000,
      });
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
      await execFileAsync("git", ["clone", repoUrl], {
        cwd: targetDir,
        encoding: "utf-8",
        timeout: 120000,
      });
    } catch (e: any) {
      // git clone writes progress to stderr even on success;
      // only treat it as failure if exit code is non-zero
      if (e.code && e.code !== 0) {
        throw new Error(e.stderr || e.message || "Clone failed");
      }
    }

    // Extract the cloned directory name from the repo URL
    const repoName = repoUrl
      .replace(/\.git$/, "")
      .split("/")
      .pop()!
      .replace(/[^\w.\-]/g, "");
    const clonedPath = path.join(targetDir, repoName);

    // Verify the directory exists
    try {
      await fs.promises.access(clonedPath);
    } catch {
      throw new Error(`Clone completed but directory not found at ${clonedPath}`);
    }
    return clonedPath;
  });

  ipcMain.handle("git_branches", async (_event, args: { cwd: string }) => {
    const cwd = args.cwd || projectPath;
    if (!cwd) return { branches: [] };
    try {
      const result = await execAsync("git branch --format=%(refname:short) -a", {
        cwd,
        encoding: "utf-8",
        timeout: 5000,
      });
      const branches = result.stdout
        .split("\n")
        .map((b) => b.trim())
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

  ipcMain.handle("git_last_commit", async (_event, args?: { projectPath?: string }) => {
    const cwd = args?.projectPath || projectPath;
    if (!cwd) return null;
    try {
      const result = await execAsync('git log -1 --format="%H|%cd|%s" --date=iso', {
        cwd,
        encoding: "utf-8",
        timeout: 5000,
      });
      const output = result.stdout.trim();
      if (!output) return null;
      const [hash, date, ...subjectParts] = output.split("|");
      return { hash, date, subject: subjectParts.join("|") };
    } catch {
      return null;
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
