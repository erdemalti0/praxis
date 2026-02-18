import { ipcMain } from "electron";
import { exec, execSync } from "child_process";
import { promisify } from "util";
import fs from "fs";

const execAsync = promisify(exec);

const isWin = process.platform === "win32";
const isMac = process.platform === "darwin";

// Cache system stats with TTL to avoid excessive subprocess calls
let cachedStats: { cpuUsage: number; memUsed: number; memTotal: number; diskUsed: number; diskTotal: number } | null = null;
let statsCacheTime = 0;
const STATS_CACHE_TTL = 2000; // 2 seconds

export function registerPortsHandlers() {
  ipcMain.handle("scan_ports", async () => {
    try {
      if (isWin) {
        return await scanPortsWindows();
      }
      return await scanPortsUnix();
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

  ipcMain.handle("get_system_stats", async () => {
    // Return cached stats if fresh enough
    const now = Date.now();
    if (cachedStats && now - statsCacheTime < STATS_CACHE_TTL) {
      return cachedStats;
    }
    try {
      let result;
      if (isWin) result = await getSystemStatsWindows();
      else if (isMac) result = await getSystemStatsMac();
      else result = await getSystemStatsLinux();
      cachedStats = result;
      statsCacheTime = now;
      return result;
    } catch {
      return { cpuUsage: 0, memUsed: 0, memTotal: 0, diskUsed: 0, diskTotal: 0 };
    }
  });
}

/* ── Port scanning (async) ── */

async function scanPortsUnix(): Promise<{ port: number; pid: number; process: string; protocol: string }[]> {
  const { stdout } = await execAsync("lsof -i -P -n -sTCP:LISTEN 2>/dev/null | tail -n +2", { encoding: "utf-8", timeout: 5000 });
  const lines = stdout.trim().split("\n").filter(Boolean);
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

async function scanPortsWindows(): Promise<{ port: number; pid: number; process: string; protocol: string }[]> {
  const { stdout } = await execAsync("netstat -ano | findstr LISTENING", { encoding: "utf-8", timeout: 5000 });
  const lines = stdout.trim().split("\n").filter(Boolean);
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

/* ── System stats (async) ── */

async function getSystemStatsMac() {
  // Run all commands in parallel
  const [cpuResult, vmResult, dfResult] = await Promise.all([
    execAsync("top -l 1 -n 0 | grep 'CPU usage'", { encoding: "utf-8", timeout: 5000 }),
    execAsync("vm_stat", { encoding: "utf-8", timeout: 5000 }),
    execAsync("df -k / | tail -1", { encoding: "utf-8", timeout: 5000 }),
  ]);

  const cpuMatch = cpuResult.stdout.match(/([\d.]+)% user/);
  const cpuUsage = cpuMatch ? parseFloat(cpuMatch[1]) : 0;

  const vmOutput = vmResult.stdout;
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

  const dfParts = dfResult.stdout.trim().split(/\s+/);
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

async function getSystemStatsLinux() {
  // Read /proc files async and df in parallel
  const [statContent, meminfoContent, dfResult] = await Promise.all([
    fs.promises.readFile("/proc/stat", "utf-8").catch(() => ""),
    fs.promises.readFile("/proc/meminfo", "utf-8").catch(() => ""),
    execAsync("df -k / | tail -1", { encoding: "utf-8", timeout: 5000 }).catch(() => ({ stdout: "" })),
  ]);

  // CPU
  let cpuUsage = 0;
  const cpuLine = statContent.split("\n").find((l) => l.startsWith("cpu "));
  if (cpuLine) {
    const vals = cpuLine.split(/\s+/).slice(1).map(Number);
    const idle = vals[3] || 0;
    const total = vals.reduce((a, b) => a + b, 0);
    cpuUsage = total > 0 ? ((total - idle) / total) * 100 : 0;
  }

  // Memory
  let memTotal = 0, memUsed = 0;
  const totalMatch = meminfoContent.match(/MemTotal:\s+(\d+)/);
  const availMatch = meminfoContent.match(/MemAvailable:\s+(\d+)/);
  const totalKB = parseInt(totalMatch?.[1] || "0");
  const availKB = parseInt(availMatch?.[1] || "0");
  memTotal = totalKB * 1024;
  memUsed = (totalKB - availKB) * 1024;

  // Disk
  let diskTotal = 0, diskUsed = 0;
  const dfParts = dfResult.stdout.trim().split(/\s+/);
  diskTotal = parseInt(dfParts[1] || "0") * 1024;
  diskUsed = parseInt(dfParts[2] || "0") * 1024;

  return {
    cpuUsage,
    memUsed: memUsed / (1024 ** 3),
    memTotal: memTotal / (1024 ** 3),
    diskUsed: diskUsed / (1024 ** 3),
    diskTotal: diskTotal / (1024 ** 3),
  };
}

async function getSystemStatsWindows() {
  // Run wmic commands in parallel
  // Use PowerShell Get-CimInstance instead of deprecated wmic
  const [cpuResult, memResult, diskResult] = await Promise.all([
    execAsync(
      'powershell -NoProfile -Command "Get-CimInstance Win32_Processor | Select-Object -ExpandProperty LoadPercentage"',
      { encoding: "utf-8", timeout: 5000 }
    ).catch(() => ({ stdout: "" })),
    execAsync(
      'powershell -NoProfile -Command "Get-CimInstance Win32_OperatingSystem | ForEach-Object { \\"FreePhysicalMemory=$($_.FreePhysicalMemory)`nTotalVisibleMemorySize=$($_.TotalVisibleMemorySize)\\" }"',
      { encoding: "utf-8", timeout: 5000 }
    ).catch(() => ({ stdout: "" })),
    execAsync(
      'powershell -NoProfile -Command "Get-CimInstance Win32_LogicalDisk -Filter \\"DeviceID=\'C:\'\\" | ForEach-Object { \\"FreeSpace=$($_.FreeSpace)`nSize=$($_.Size)\\" }"',
      { encoding: "utf-8", timeout: 5000 }
    ).catch(() => ({ stdout: "" })),
  ]);

  const cpuUsage = parseInt(cpuResult.stdout.trim()) || 0;

  const freeMemMatch = memResult.stdout.match(/FreePhysicalMemory=(\d+)/);
  const totalMemMatch = memResult.stdout.match(/TotalVisibleMemorySize=(\d+)/);
  const freeKB = parseInt(freeMemMatch?.[1] || "0");
  const totalKB = parseInt(totalMemMatch?.[1] || "0");
  const memTotal = totalKB * 1024;
  const memUsed = (totalKB - freeKB) * 1024;

  const freeDiskMatch = diskResult.stdout.match(/FreeSpace=(\d+)/);
  const sizeDiskMatch = diskResult.stdout.match(/Size=(\d+)/);
  const freeDisk = parseInt(freeDiskMatch?.[1] || "0");
  const totalDisk = parseInt(sizeDiskMatch?.[1] || "0");

  return {
    cpuUsage,
    memUsed: memUsed / (1024 ** 3),
    memTotal: memTotal / (1024 ** 3),
    diskUsed: (totalDisk - freeDisk) / (1024 ** 3),
    diskTotal: totalDisk / (1024 ** 3),
  };
}
