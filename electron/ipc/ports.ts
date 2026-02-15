import { ipcMain } from "electron";
import { execSync } from "child_process";
import fs from "fs";

const isWin = process.platform === "win32";
const isMac = process.platform === "darwin";

export function registerPortsHandlers() {
  ipcMain.handle("scan_ports", () => {
    try {
      if (isWin) {
        return scanPortsWindows();
      }
      return scanPortsUnix();
    } catch {
      return [];
    }
  });

  ipcMain.handle("kill_process", (_event, args: { pid: number }) => {
    const pid = Number(args.pid);
    if (!Number.isInteger(pid) || pid <= 0) return false;
    try {
      if (isWin) {
        execSync(`taskkill /PID ${pid} /F`, { timeout: 5000 });
      } else {
        process.kill(pid, "SIGTERM");
      }
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle("kill_port", (_event, args: { pid: number }) => {
    const pid = Number(args.pid);
    if (!Number.isInteger(pid) || pid <= 0) return false;
    try {
      if (isWin) {
        execSync(`taskkill /PID ${pid} /F`, { timeout: 5000 });
      } else {
        process.kill(pid, "SIGTERM");
      }
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle("get_system_stats", () => {
    try {
      if (isWin) return getSystemStatsWindows();
      if (isMac) return getSystemStatsMac();
      return getSystemStatsLinux();
    } catch {
      return { cpuUsage: 0, memUsed: 0, memTotal: 0, diskUsed: 0, diskTotal: 0 };
    }
  });
}

/* ── Port scanning ── */

function scanPortsUnix(): { port: number; pid: number; process: string; protocol: string }[] {
  const output = execSync("lsof -i -P -n -sTCP:LISTEN 2>/dev/null | tail -n +2", { encoding: "utf-8", timeout: 5000 });
  const lines = output.trim().split("\n").filter(Boolean);
  const ports: { port: number; pid: number; process: string; protocol: string }[] = [];

  for (const line of lines) {
    const parts = line.split(/\s+/);
    if (parts.length < 9) continue;
    const proc = parts[0];
    const pid = parseInt(parts[1], 10);
    const nameField = parts[8] || "";
    const portMatch = nameField.match(/:(\d+)$/);
    if (!portMatch) continue;
    const port = parseInt(portMatch[1], 10);
    ports.push({ port, pid, process: proc, protocol: "TCP" });
  }

  const seen = new Set<number>();
  return ports.filter((p) => { if (seen.has(p.port)) return false; seen.add(p.port); return true; });
}

function scanPortsWindows(): { port: number; pid: number; process: string; protocol: string }[] {
  const output = execSync("netstat -ano | findstr LISTENING", { encoding: "utf-8", timeout: 5000 });
  const lines = output.trim().split("\n").filter(Boolean);
  const ports: { port: number; pid: number; process: string; protocol: string }[] = [];

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5) continue;
    const localAddr = parts[1] || "";
    const portMatch = localAddr.match(/:(\d+)$/);
    if (!portMatch) continue;
    const port = parseInt(portMatch[1], 10);
    const pid = parseInt(parts[4], 10);
    ports.push({ port, pid, process: `PID:${pid}`, protocol: "TCP" });
  }

  const seen = new Set<number>();
  return ports.filter((p) => { if (seen.has(p.port)) return false; seen.add(p.port); return true; });
}

/* ── System stats ── */

function getSystemStatsMac() {
  const cpuOutput = execSync("top -l 1 -n 0 | grep 'CPU usage'", { encoding: "utf-8", timeout: 5000 });
  const cpuMatch = cpuOutput.match(/([\d.]+)% user/);
  const cpuUsage = cpuMatch ? parseFloat(cpuMatch[1]) : 0;

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

  const dfOutput = execSync("df -k / | tail -1", { encoding: "utf-8", timeout: 5000 });
  const dfParts = dfOutput.trim().split(/\s+/);
  const diskTotal = parseInt(dfParts[1] || "0") * 1024;
  const diskUsed = parseInt(dfParts[2] || "0") * 1024;

  return {
    cpuUsage,
    memUsed: memUsed / (1024 ** 3),
    memTotal: memTotal / (1024 ** 3),
    diskUsed: diskUsed / (1024 ** 3),
    diskTotal: diskTotal / (1024 ** 3),
  };
}

function getSystemStatsLinux() {
  // CPU from /proc/stat (instantaneous idle percentage)
  let cpuUsage = 0;
  try {
    const stat = fs.readFileSync("/proc/stat", "utf-8");
    const cpuLine = stat.split("\n").find((l) => l.startsWith("cpu "));
    if (cpuLine) {
      const vals = cpuLine.split(/\s+/).slice(1).map(Number);
      const idle = vals[3] || 0;
      const total = vals.reduce((a, b) => a + b, 0);
      cpuUsage = total > 0 ? ((total - idle) / total) * 100 : 0;
    }
  } catch {}

  // Memory from /proc/meminfo
  let memTotal = 0, memUsed = 0;
  try {
    const meminfo = fs.readFileSync("/proc/meminfo", "utf-8");
    const totalMatch = meminfo.match(/MemTotal:\s+(\d+)/);
    const availMatch = meminfo.match(/MemAvailable:\s+(\d+)/);
    const totalKB = parseInt(totalMatch?.[1] || "0");
    const availKB = parseInt(availMatch?.[1] || "0");
    memTotal = totalKB * 1024;
    memUsed = (totalKB - availKB) * 1024;
  } catch {}

  // Disk
  let diskTotal = 0, diskUsed = 0;
  try {
    const dfOutput = execSync("df -k / | tail -1", { encoding: "utf-8", timeout: 5000 });
    const dfParts = dfOutput.trim().split(/\s+/);
    diskTotal = parseInt(dfParts[1] || "0") * 1024;
    diskUsed = parseInt(dfParts[2] || "0") * 1024;
  } catch {}

  return {
    cpuUsage,
    memUsed: memUsed / (1024 ** 3),
    memTotal: memTotal / (1024 ** 3),
    diskUsed: diskUsed / (1024 ** 3),
    diskTotal: diskTotal / (1024 ** 3),
  };
}

function getSystemStatsWindows() {
  let cpuUsage = 0;
  try {
    const cpuOutput = execSync("wmic cpu get loadpercentage /value", { encoding: "utf-8", timeout: 5000 });
    const match = cpuOutput.match(/LoadPercentage=(\d+)/);
    cpuUsage = match ? parseInt(match[1]) : 0;
  } catch {}

  let memTotal = 0, memUsed = 0;
  try {
    const memOutput = execSync("wmic OS get FreePhysicalMemory,TotalVisibleMemorySize /value", { encoding: "utf-8", timeout: 5000 });
    const freeMatch = memOutput.match(/FreePhysicalMemory=(\d+)/);
    const totalMatch = memOutput.match(/TotalVisibleMemorySize=(\d+)/);
    const freeKB = parseInt(freeMatch?.[1] || "0");
    const totalKB = parseInt(totalMatch?.[1] || "0");
    memTotal = totalKB * 1024;
    memUsed = (totalKB - freeKB) * 1024;
  } catch {}

  let diskTotal = 0, diskUsed = 0;
  try {
    const diskOutput = execSync("wmic logicaldisk where \"DeviceID='C:'\" get Size,FreeSpace /value", { encoding: "utf-8", timeout: 5000 });
    const freeMatch = diskOutput.match(/FreeSpace=(\d+)/);
    const sizeMatch = diskOutput.match(/Size=(\d+)/);
    const free = parseInt(freeMatch?.[1] || "0");
    const total = parseInt(sizeMatch?.[1] || "0");
    diskTotal = total;
    diskUsed = total - free;
  } catch {}

  return {
    cpuUsage,
    memUsed: memUsed / (1024 ** 3),
    memTotal: memTotal / (1024 ** 3),
    diskUsed: diskUsed / (1024 ** 3),
    diskTotal: diskTotal / (1024 ** 3),
  };
}
