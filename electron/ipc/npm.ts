import { ipcMain } from "electron";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export function registerNpmHandlers() {
  ipcMain.handle(
    "check_outdated_packages",
    async (_event, args: { projectPath: string }) => {
      const { projectPath } = args;
      if (!projectPath) return { outdated: {} };
      try {
        const result = await execAsync("npm outdated --json", {
          cwd: projectPath,
          encoding: "utf-8",
          timeout: 30000,
        });
        return { outdated: JSON.parse(result.stdout || "{}") };
      } catch (e: any) {
        // npm outdated exits with code 1 when packages are outdated — parse stdout
        if (e.stdout) {
          try {
            return { outdated: JSON.parse(e.stdout) };
          } catch {
            return { outdated: {} };
          }
        }
        return { outdated: {} };
      }
    }
  );

  ipcMain.handle(
    "check_npm_audit",
    async (_event, args: { projectPath: string }) => {
      const { projectPath } = args;
      if (!projectPath) return { audit: {} };
      try {
        const result = await execAsync("npm audit --json", {
          cwd: projectPath,
          encoding: "utf-8",
          timeout: 30000,
        });
        return { audit: JSON.parse(result.stdout || "{}") };
      } catch (e: any) {
        // npm audit exits with non-zero when vulnerabilities exist — parse stdout
        if (e.stdout) {
          try {
            return { audit: JSON.parse(e.stdout) };
          } catch {
            return { audit: {} };
          }
        }
        return { audit: {} };
      }
    }
  );
}
