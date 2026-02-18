import { create } from "zustand";
import { invoke, listen } from "../lib/ipc";
import { useTerminalStore } from "./terminalStore";
import { getOrCreateTerminal } from "../lib/terminal/terminalCache";
import { setupPtyConnection } from "../lib/terminal/ptyConnection";
// getOrCreateTerminal is needed to create the xterm instance before spawning
// setupPtyConnection wires up the PTY ↔ xterm output/input flow
import type { RunConfig, RunnerInstance, RunnerStatus, EmulatorInfo } from "../types/runner";

interface RunnerState {
  configs: RunConfig[];
  instances: RunnerInstance[];
  selectedConfigId: string | null;
  emulators: { android: EmulatorInfo[]; ios: EmulatorInfo[] };
  loading: boolean;
  _loaded: boolean;

  // Config CRUD
  loadConfigs: (projectPath: string) => Promise<void>;
  addConfig: (projectPath: string, config: Omit<RunConfig, "id" | "createdAt" | "updatedAt">) => Promise<string>;
  updateConfig: (projectPath: string, id: string, updates: Partial<RunConfig>) => Promise<void>;
  deleteConfig: (projectPath: string, id: string) => Promise<void>;
  setSelectedConfig: (id: string | null) => void;

  // Instance lifecycle
  startRunner: (configId: string, workspaceId: string) => Promise<void>;
  stopRunner: (configId: string) => Promise<void>;
  restartRunner: (configId: string, workspaceId: string) => Promise<void>;
  removeInstance: (configId: string) => void;

  // Port correlation
  updatePorts: (pidPorts: Map<number, number[]>) => void;
  markExited: (sessionId: string, exitCode: number) => void;

  // Emulators
  refreshEmulators: () => Promise<void>;
}

// Track exit listeners and PTY connection cleanups to avoid leaks
const exitCleanups = new Map<string, () => void>();
const ptyCleanups = new Map<string, () => void>();

// --- Persistent output buffers (survive component unmounts) ---
const MAX_OUTPUT_LINES = 200;
const outputBuffers = new Map<string, string[]>();
const outputCleanups = new Map<string, () => void>();
// Subscribers notified when buffer changes (sessionId -> Set of callbacks)
const outputSubscribers = new Map<string, Set<() => void>>();

function stripAnsi(str: string): string {
  return str.replace(/\x1B\[[0-9;]*[A-Za-z]/g, "").replace(/\x1B\][^\x07]*\x07/g, "");
}

function startOutputCapture(sessionId: string) {
  // Don't double-listen
  if (outputCleanups.has(sessionId)) return;
  outputBuffers.set(sessionId, []);

  const unlisten = listen(`pty-output-${sessionId}`, (data: string) => {
    const cleaned = stripAnsi(data);
    const newLines = cleaned.split("\n");
    const buf = outputBuffers.get(sessionId) || [];
    buf.push(...newLines);
    // Trim to max
    if (buf.length > MAX_OUTPUT_LINES) {
      buf.splice(0, buf.length - MAX_OUTPUT_LINES);
    }
    outputBuffers.set(sessionId, buf);
    // Notify subscribers
    const subs = outputSubscribers.get(sessionId);
    if (subs) subs.forEach((cb) => cb());
  });

  outputCleanups.set(sessionId, unlisten);
}

function stopOutputCapture(sessionId: string) {
  const cleanup = outputCleanups.get(sessionId);
  if (cleanup) {
    cleanup();
    outputCleanups.delete(sessionId);
  }
  // Keep buffer around so user can still see logs after stop
}

function clearOutputBuffer(sessionId: string) {
  outputBuffers.delete(sessionId);
  outputSubscribers.delete(sessionId);
}

/** Get the current output lines for a runner session */
export function getRunnerOutput(sessionId: string): string[] {
  return outputBuffers.get(sessionId) || [];
}

/** Subscribe to output changes — returns unsubscribe function */
export function subscribeRunnerOutput(sessionId: string, callback: () => void): () => void {
  let subs = outputSubscribers.get(sessionId);
  if (!subs) {
    subs = new Set();
    outputSubscribers.set(sessionId, subs);
  }
  subs.add(callback);
  return () => {
    subs!.delete(callback);
    if (subs!.size === 0) outputSubscribers.delete(sessionId);
  };
}

function saveConfigs(projectPath: string, configs: RunConfig[]) {
  return invoke("save_run_configs", { projectPath, configs });
}

export const useRunnerStore = create<RunnerState>((set, get) => ({
  configs: [],
  instances: [],
  selectedConfigId: null,
  emulators: { android: [], ios: [] },
  loading: false,
  _loaded: false,

  loadConfigs: async (projectPath) => {
    if (get()._loaded) return;
    set({ loading: true });
    try {
      const configs = await invoke<RunConfig[]>("load_run_configs", { projectPath });
      set({ configs, _loaded: true });
    } catch {
      set({ configs: [], _loaded: true });
    } finally {
      set({ loading: false });
    }
  },

  addConfig: async (projectPath, partial) => {
    const id = `rc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    const config: RunConfig = { ...partial, id, createdAt: now, updatedAt: now };
    const configs = [...get().configs, config];
    set({ configs, selectedConfigId: id });
    await saveConfigs(projectPath, configs);
    return id;
  },

  updateConfig: async (projectPath, id, updates) => {
    const configs = get().configs.map((c) =>
      c.id === id ? { ...c, ...updates, updatedAt: Date.now() } : c
    );
    set({ configs });
    await saveConfigs(projectPath, configs);
  },

  deleteConfig: async (projectPath, id) => {
    // Stop if running
    const instance = get().instances.find((i) => i.configId === id);
    if (instance && instance.status === "running") {
      await get().stopRunner(id);
    }
    const configs = get().configs.filter((c) => c.id !== id);
    const selected = get().selectedConfigId === id ? null : get().selectedConfigId;
    set({ configs, selectedConfigId: selected });
    await saveConfigs(projectPath, configs);
  },

  setSelectedConfig: (id) => set({ selectedConfigId: id }),

  startRunner: async (configId, workspaceId) => {
    const config = get().configs.find((c) => c.id === configId);
    if (!config) return;

    // Don't start if already running
    const existing = get().instances.find(
      (i) => i.configId === configId && i.status === "running"
    );
    if (existing) return;

    const sessionId = `runner-${configId}-${Date.now()}`;

    // Build command and args
    const cmd = config.command;
    const args = config.args;

    try {
      // Create xterm instance and wire up PTY connection BEFORE spawning
      // (so no output is lost)
      const { terminal } = getOrCreateTerminal(sessionId);
      const cleanupPty = setupPtyConnection({
        sessionId,
        terminal,
        fallbackCwd: config.cwd,
      });

      const result = await invoke<{ id: string; cwd: string; pid: number }>(
        "spawn_pty",
        {
          id: sessionId,
          cmd,
          args,
          cwd: config.cwd,
        }
      );

      // Register in terminal store
      useTerminalStore.getState().addSession({
        id: sessionId,
        title: `[Runner] ${config.name}`,
        workspaceId,
        agentType: "runner",
        projectPath: result.cwd,
        pid: result.pid,
        isActive: true,
      });

      const instance: RunnerInstance = {
        configId,
        sessionId,
        pid: result.pid,
        status: "running",
        ports: [],
        startedAt: Date.now(),
      };

      set((s) => ({
        instances: [
          ...s.instances.filter((i) => i.configId !== configId),
          instance,
        ],
      }));

      // Store PTY connection cleanup
      ptyCleanups.set(sessionId, cleanupPty);

      // Start persistent output capture (survives view switches)
      startOutputCapture(sessionId);

      // Listen for exit
      const cleanup = listen(`pty-exit-${sessionId}`, (data: any) => {
        get().markExited(sessionId, data?.exitCode ?? -1);
        cleanup();
        exitCleanups.delete(sessionId);
      });
      exitCleanups.set(sessionId, cleanup);
    } catch (err) {
      // Mark error instance so UI can show it
      set((s) => ({
        instances: [
          ...s.instances.filter((i) => i.configId !== configId),
          {
            configId,
            sessionId,
            status: "error" as RunnerStatus,
            ports: [],
            startedAt: Date.now(),
          },
        ],
      }));
    }
  },

  stopRunner: async (configId) => {
    const instance = get().instances.find(
      (i) => i.configId === configId && i.status === "running"
    );
    if (!instance) return;

    // Kill child processes first (e.g., flutter run spawns dart, chrome, etc.)
    if (instance.pid) {
      try {
        const childPids = await invoke<number[]>("get_child_pids", { pid: instance.pid });
        for (const cpid of childPids) {
          try { await invoke("kill_process", { pid: cpid }); } catch {}
        }
      } catch {}
      // Also kill the main process directly
      try { await invoke("kill_process", { pid: instance.pid }); } catch {}
    }

    try {
      await invoke("close_pty", { id: instance.sessionId });
    } catch {
      // PTY might already be gone
    }

    // Clean up exit listener and PTY connection
    const exitCleanup = exitCleanups.get(instance.sessionId);
    if (exitCleanup) {
      exitCleanup();
      exitCleanups.delete(instance.sessionId);
    }
    const ptyCleanup = ptyCleanups.get(instance.sessionId);
    if (ptyCleanup) {
      ptyCleanup();
      ptyCleanups.delete(instance.sessionId);
    }

    // Stop output capture (but keep buffer so user can still see logs)
    stopOutputCapture(instance.sessionId);

    useTerminalStore.getState().updateSession(instance.sessionId, { isActive: false });

    set((s) => ({
      instances: s.instances.map((i) =>
        i.configId === configId ? { ...i, status: "stopped" as RunnerStatus } : i
      ),
    }));
  },

  restartRunner: async (configId, workspaceId) => {
    await get().stopRunner(configId);
    // Small delay for cleanup
    await new Promise((r) => setTimeout(r, 300));
    await get().startRunner(configId, workspaceId);
  },

  removeInstance: (configId) => {
    const instance = get().instances.find((i) => i.configId === configId);
    if (instance) {
      const cleanup = exitCleanups.get(instance.sessionId);
      if (cleanup) {
        cleanup();
        exitCleanups.delete(instance.sessionId);
      }
      stopOutputCapture(instance.sessionId);
      clearOutputBuffer(instance.sessionId);
    }
    set((s) => ({
      instances: s.instances.filter((i) => i.configId !== configId),
    }));
  },

  updatePorts: (pidPorts) => {
    set((s) => ({
      instances: s.instances.map((inst) => {
        if (!inst.pid || inst.status !== "running") return inst;
        const ports = pidPorts.get(inst.pid) || [];
        // Only update if ports actually changed
        if (
          ports.length === inst.ports.length &&
          ports.every((p, i) => p === inst.ports[i])
        ) {
          return inst;
        }
        return { ...inst, ports: [...new Set(ports)].sort((a, b) => a - b) };
      }),
    }));
  },

  markExited: (sessionId, exitCode) => {
    set((s) => ({
      instances: s.instances.map((i) =>
        i.sessionId === sessionId
          ? {
              ...i,
              status: (exitCode === 0 ? "stopped" : "error") as RunnerStatus,
              exitCode,
            }
          : i
      ),
    }));
  },

  refreshEmulators: async () => {
    try {
      const result = await invoke<{
        android: EmulatorInfo[];
        ios: EmulatorInfo[];
      }>("detect_emulators");
      set({ emulators: result });
    } catch {
      // Ignore errors
    }
  },
}));
