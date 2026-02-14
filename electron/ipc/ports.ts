import { ipcMain } from "electron";
import { execSync } from "child_process";

export function registerPortsHandlers() {
  ipcMain.handle("scan_ports", () => {
    try {
      const output = execSync("lsof -i -P -n -sTCP:LISTEN 2>/dev/null | tail -n +2", { encoding: "utf-8", timeout: 5000 });
      const lines = output.trim().split("\n").filter(Boolean);
      const ports: { port: number; pid: number; process: string; protocol: string }[] = [];

      for (const line of lines) {
        const parts = line.split(/\s+/);
        if (parts.length < 9) continue;
        const process = parts[0];
        const pid = parseInt(parts[1], 10);
        const nameField = parts[8] || "";
        const portMatch = nameField.match(/:(\d+)$/);
        if (!portMatch) continue;
        const port = parseInt(portMatch[1], 10);
        ports.push({ port, pid, process, protocol: "TCP" });
      }

      // Deduplicate by port
      const seen = new Set<number>();
      return ports.filter((p) => { if (seen.has(p.port)) return false; seen.add(p.port); return true; });
    } catch {
      return [];
    }
  });

  ipcMain.handle("kill_process", (_event, args: { pid: number }) => {
    try {
      process.kill(args.pid, "SIGTERM");
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle("kill_port", (_event, args: { pid: number }) => {
    try {
      process.kill(args.pid, "SIGTERM");
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle("get_system_stats", () => {
    try {
      // CPU usage
      const cpuOutput = execSync("top -l 1 -n 0 | grep 'CPU usage'", { encoding: "utf-8", timeout: 5000 });
      const cpuMatch = cpuOutput.match(/([\d.]+)% user/);
      const cpuUsage = cpuMatch ? parseFloat(cpuMatch[1]) : 0;

      // Memory
      const vmOutput = execSync("vm_stat", { encoding: "utf-8", timeout: 5000 });
      const pageSize = 16384;
      const freeMatch = vmOutput.match(/Pages free:\s+(\d+)/);
      const activeMatch = vmOutput.match(/Pages active:\s+(\d+)/);
      const inactiveMatch = vmOutput.match(/Pages inactive:\s+(\d+)/);
      const wiredMatch = vmOutput.match(/Pages wired down:\s+(\d+)/);
      const free = parseInt(freeMatch?.[1] || "0") * pageSize;
      const active = parseInt(activeMatch?.[1] || "0") * pageSize;
      const inactive = parseInt(inactiveMatch?.[1] || "0") * pageSize;
      const wired = parseInt(wiredMatch?.[1] || "0") * pageSize;
      const memTotal = free + active + inactive + wired;
      const memUsed = active + wired;

      // Disk
      const dfOutput = execSync("df -k / | tail -1", { encoding: "utf-8", timeout: 5000 });
      const dfParts = dfOutput.trim().split(/\s+/);
      const diskTotal = parseInt(dfParts[1] || "0") * 1024;
      const diskUsed = parseInt(dfParts[2] || "0") * 1024;

      return {
        cpuUsage,
        memUsed: memUsed / (1024 * 1024 * 1024),
        memTotal: memTotal / (1024 * 1024 * 1024),
        diskUsed: diskUsed / (1024 * 1024 * 1024),
        diskTotal: diskTotal / (1024 * 1024 * 1024),
      };
    } catch {
      return { cpuUsage: 0, memUsed: 0, memTotal: 0, diskUsed: 0, diskTotal: 0 };
    }
  });
}
