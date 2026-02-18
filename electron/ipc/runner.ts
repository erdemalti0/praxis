import { ipcMain } from "electron";
import fs from "fs";
import path from "path";
import os from "os";
import { exec } from "child_process";
import { promisify } from "util";
import { projectSlug } from "../utils/projectSlug";

const execAsync = promisify(exec);

function getProjectDataDir(projectPath: string): string {
  return path.join(os.homedir(), ".praxis", "projects", projectSlug(projectPath));
}

function configsFilePath(projectPath: string): string {
  return path.join(getProjectDataDir(projectPath), "run-configs.json");
}

function ensureDir(projectPath: string): void {
  const dir = getProjectDataDir(projectPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function registerRunnerHandlers() {
  ipcMain.handle("load_run_configs", (_event, args: { projectPath: string }) => {
    const file = configsFilePath(args.projectPath);
    if (!fs.existsSync(file)) return [];
    try {
      return JSON.parse(fs.readFileSync(file, "utf-8"));
    } catch {
      return [];
    }
  });

  ipcMain.handle("save_run_configs", async (_event, args: { projectPath: string; configs: any[] }) => {
    ensureDir(args.projectPath);
    const file = configsFilePath(args.projectPath);
    await fs.promises.writeFile(file, JSON.stringify(args.configs, null, 2), "utf-8");
  });

  ipcMain.handle("get_child_pids", async (_event, args: { pid: number }): Promise<number[]> => {
    if (process.platform === "win32") {
      try {
        const { stdout } = await execAsync(
          `wmic process where (ParentProcessId=${args.pid}) get ProcessId`,
          { encoding: "utf-8", timeout: 3000 }
        );
        return stdout
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => /^\d+$/.test(l))
          .map(Number);
      } catch {
        return [];
      }
    }
    try {
      const { stdout } = await execAsync(`pgrep -P ${args.pid}`, {
        encoding: "utf-8",
        timeout: 3000,
      });
      return stdout
        .trim()
        .split("\n")
        .filter(Boolean)
        .map(Number);
    } catch {
      return [];
    }
  });

  ipcMain.handle("detect_emulators", async (): Promise<{
    android: { id: string; name: string; status: string }[];
    ios: { id: string; name: string; status: string }[];
  }> => {
    const result = { android: [] as any[], ios: [] as any[] };

    // Android: adb devices
    try {
      const { stdout } = await execAsync("adb devices -l", {
        encoding: "utf-8",
        timeout: 3000,
      });
      const lines = stdout.split("\n").slice(1); // skip header
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === "") continue;
        const parts = trimmed.split(/\s+/);
        if (parts.length < 2) continue;
        const id = parts[0];
        const status = parts[1]; // "device", "offline", "unauthorized"
        const modelMatch = trimmed.match(/model:(\S+)/);
        const name = modelMatch ? modelMatch[1] : id;
        result.android.push({ id, name, status });
      }
    } catch {
      // adb not found or no devices
    }

    // iOS: xcrun simctl (macOS only)
    if (process.platform === "darwin") {
      try {
        const { stdout } = await execAsync("xcrun simctl list devices booted -j", {
          encoding: "utf-8",
          timeout: 3000,
        });
        const data = JSON.parse(stdout);
        const devices = data.devices || {};
        for (const runtime of Object.keys(devices)) {
          for (const device of devices[runtime]) {
            if (device.state === "Booted") {
              result.ios.push({
                id: device.udid,
                name: device.name,
                status: "Booted",
              });
            }
          }
        }
      } catch {
        // xcrun not found or no simulators
      }
    }

    return result;
  });
}
