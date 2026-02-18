import { useEffect, useState } from "react";
import { useRunnerStore } from "../../stores/runnerStore";
import { useUIStore } from "../../stores/uiStore";
import { useServicesStore } from "../../stores/servicesStore";
import { invoke } from "../../lib/ipc";
import { useConfirmStore } from "../../stores/confirmStore";
import RunnerConfigList from "./RunnerConfigList";
import RunnerDetail from "./RunnerDetail";
import RunConfigDialog from "./RunConfigDialog";
import type { RunConfig } from "../../types/runner";

export default function RunnerPanel() {
  const selectedProject = useUIStore((s) => s.selectedProject);
  const activeWorkspaceId = useUIStore((s) => s.activeWorkspaceId);
  const projectPath = selectedProject?.path || "";

  const configs = useRunnerStore((s) => s.configs);
  const instances = useRunnerStore((s) => s.instances);
  const selectedConfigId = useRunnerStore((s) => s.selectedConfigId);
  const emulators = useRunnerStore((s) => s.emulators);
  const loading = useRunnerStore((s) => s.loading);

  const loadConfigs = useRunnerStore((s) => s.loadConfigs);
  const addConfig = useRunnerStore((s) => s.addConfig);
  const updateConfig = useRunnerStore((s) => s.updateConfig);
  const deleteConfig = useRunnerStore((s) => s.deleteConfig);
  const setSelectedConfig = useRunnerStore((s) => s.setSelectedConfig);
  const startRunner = useRunnerStore((s) => s.startRunner);
  const stopRunner = useRunnerStore((s) => s.stopRunner);
  const restartRunner = useRunnerStore((s) => s.restartRunner);
  const updatePorts = useRunnerStore((s) => s.updatePorts);
  const refreshEmulators = useRunnerStore((s) => s.refreshEmulators);

  const [showDialog, setShowDialog] = useState(false);
  const [editConfig, setEditConfig] = useState<RunConfig | null>(null);

  // Load configs on mount
  useEffect(() => {
    if (projectPath) {
      loadConfigs(projectPath);
    }
  }, [projectPath, loadConfigs]);

  // Port correlation polling (3s)
  useEffect(() => {
    let active = true;

    const poll = async () => {
      if (!active) return;

      // Refresh services
      await useServicesStore.getState().refresh();
      const services = useServicesStore.getState().services;

      // Build pid -> ports map
      const pidPorts = new Map<number, number[]>();
      for (const svc of services) {
        const existing = pidPorts.get(svc.pid) || [];
        existing.push(svc.port);
        pidPorts.set(svc.pid, existing);
      }

      // Check child PIDs for each running instance
      const runningInstances = useRunnerStore.getState().instances.filter(
        (i) => i.status === "running" && i.pid
      );

      for (const inst of runningInstances) {
        if (!inst.pid) continue;
        try {
          const childPids = await invoke<number[]>("get_child_pids", { pid: inst.pid });
          for (const cpid of childPids) {
            if (pidPorts.has(cpid)) {
              const childPorts = pidPorts.get(cpid)!;
              const existing = pidPorts.get(inst.pid) || [];
              pidPorts.set(inst.pid, [...existing, ...childPorts]);
            }
          }
        } catch {}
      }

      updatePorts(pidPorts);

      // Also refresh emulators
      await refreshEmulators();
    };

    poll();
    const interval = setInterval(poll, 3000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [updatePorts, refreshEmulators]);

  // Uptime ticker — force re-render every second when there's a running instance
  const [, setTick] = useState(0);
  const hasRunning = instances.some((i) => i.status === "running");
  useEffect(() => {
    if (!hasRunning) return;
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, [hasRunning]);

  const workspaceId = activeWorkspaceId || "ws-default";

  const selectedConfig = configs.find((c) => c.id === selectedConfigId) || null;
  const selectedInstance = instances.find((i) => i.configId === selectedConfigId) || null;

  const handleAddDialog = () => {
    setEditConfig(null);
    setShowDialog(true);
  };

  const handleEditDialog = (config: RunConfig) => {
    setEditConfig(config);
    setShowDialog(true);
  };

  const handleSubmit = async (partial: Omit<RunConfig, "id" | "createdAt" | "updatedAt">) => {
    if (editConfig) {
      await updateConfig(projectPath, editConfig.id, partial);
    } else {
      await addConfig(projectPath, partial);
    }
  };

  const handleDelete = (configId: string) => {
    useConfirmStore.getState().showConfirm(
      "Delete Run Config",
      "Delete this run configuration? If running, it will be stopped.",
      () => deleteConfig(projectPath, configId),
      { danger: true }
    );
  };

  const handleDuplicate = async (config: RunConfig) => {
    await addConfig(projectPath, {
      name: `${config.name} (copy)`,
      command: config.command,
      args: [...config.args],
      cwd: config.cwd,
      env: config.env ? { ...config.env } : undefined,
      autoRestart: config.autoRestart,
      icon: config.icon,
      color: config.color,
    });
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center" style={{ color: "var(--vp-text-faint)", fontSize: 12 }}>
        Loading run configurations...
      </div>
    );
  }

  return (
    <div className="h-full w-full" style={{ position: "relative" }}>
      <div className="h-full flex" style={{ overflow: "hidden" }}>
        {/* Left: config list */}
        <div style={{ width: 240, minWidth: 240, flexShrink: 0, height: "100%" }}>
          <RunnerConfigList
            configs={configs}
            instances={instances}
            selectedConfigId={selectedConfigId}
            onSelect={setSelectedConfig}
            onAdd={handleAddDialog}
            onStart={(id) => startRunner(id, workspaceId)}
            onStop={stopRunner}
            onDelete={handleDelete}
          />
        </div>

        {/* Right: detail */}
        <div className="flex-1 min-w-0" style={{ height: "100%" }}>
          <RunnerDetail
            config={selectedConfig}
            instance={selectedInstance}
            emulators={emulators}
            onStart={(id) => startRunner(id, workspaceId)}
            onStop={stopRunner}
            onRestart={(id) => restartRunner(id, workspaceId)}
            onEdit={handleEditDialog}
            onDelete={handleDelete}
            onDuplicate={handleDuplicate}
          />
        </div>
      </div>

      <RunConfigDialog
        open={showDialog}
        onClose={() => { setShowDialog(false); setEditConfig(null); }}
        onSubmit={handleSubmit}
        editConfig={editConfig}
        defaultCwd={projectPath}
      />
    </div>
  );
}
