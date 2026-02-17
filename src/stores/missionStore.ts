import { create } from "zustand";
import { invoke } from "../lib/ipc";
import type { Mission, MissionStep, MissionStepStatus } from "../types/mission";

export interface ExportedStep {
  title: string;
  description: string;
  prompt?: string;
  status?: MissionStepStatus;
  children: ExportedStep[];
  dependsOn?: string[];
}

export interface ExportedMission {
  title: string;
  description: string;
  steps: ExportedStep[];
}

export interface MissionExportData {
  version: 1;
  exportedAt: string;
  missions: ExportedMission[];
}

interface MissionState {
  missions: Mission[];
  activeMissionId: string | null;
  loading: boolean;
  _loaded: boolean;

  loadMissions: (projectPath: string) => Promise<void>;
  addMission: (projectPath: string, title: string, description: string) => Promise<string>;
  updateMission: (projectPath: string, id: string, updates: Partial<Pick<Mission, "title" | "description">>) => Promise<void>;
  deleteMission: (projectPath: string, id: string) => Promise<void>;
  setActiveMission: (id: string | null) => void;

  addStep: (projectPath: string, missionId: string, parentId: string | null, title: string, description: string, prompt?: string) => Promise<string>;
  updateStep: (projectPath: string, missionId: string, stepId: string, updates: Partial<Pick<MissionStep, "title" | "description" | "prompt" | "status">>) => Promise<void>;
  deleteStep: (projectPath: string, missionId: string, stepId: string) => Promise<void>;
  cycleStepStatus: (projectPath: string, missionId: string, stepId: string) => Promise<void>;
  connectSteps: (projectPath: string, missionId: string, fromStepId: string, toStepId: string) => Promise<void>;
  disconnectSteps: (projectPath: string, missionId: string, parentId: string, childId: string) => Promise<void>;

  exportMissions: (missionIds: string[]) => MissionExportData;
  importMissions: (projectPath: string, data: MissionExportData, mergeAsOne?: boolean) => Promise<void>;
}

function now() {
  return Math.floor(Date.now() / 1000);
}

function genId(prefix: string = "step") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function persist(projectPath: string, missions: Mission[]) {
  await invoke("save_missions", { projectPath, missions });
}

const STATUS_CYCLE: MissionStepStatus[] = ["pending", "in_progress", "done"];

export const useMissionStore = create<MissionState>((set, get) => ({
  missions: [],
  activeMissionId: null,
  loading: false,
  _loaded: false,

  loadMissions: async (projectPath) => {
    // Don't reload if already loaded for this session
    if (get()._loaded && get().missions.length > 0) return;

    set({ loading: true });
    try {
      const rawMissions = await invoke<Mission[]>("load_missions", { projectPath });
      // Backward compat: ensure all steps have dependencies array
      const missions = rawMissions.map((m) => ({
        ...m,
        steps: m.steps.map((s) => ({ ...s, dependencies: s.dependencies || [] })),
      }));
      const currentActive = get().activeMissionId;
      // Preserve active mission if it still exists, otherwise auto-select first
      const activeExists = currentActive && missions.some((m) => m.id === currentActive);
      set({
        missions,
        _loaded: true,
        activeMissionId: activeExists ? currentActive : (missions.length > 0 ? missions[0].id : null),
      });
    } catch {
      set({ missions: [], _loaded: true });
    } finally {
      set({ loading: false });
    }
  },

  addMission: async (projectPath, title, description) => {
    const id = genId("mission");
    const mission: Mission = {
      id,
      title,
      description,
      steps: [],
      createdAt: now(),
      updatedAt: now(),
    };
    const missions = [...get().missions, mission];
    set({ missions, activeMissionId: id });
    await persist(projectPath, missions);
    return id;
  },

  updateMission: async (projectPath, id, updates) => {
    const missions = get().missions.map((m) =>
      m.id === id ? { ...m, ...updates, updatedAt: now() } : m
    );
    set({ missions });
    await persist(projectPath, missions);
  },

  deleteMission: async (projectPath, id) => {
    const missions = get().missions.filter((m) => m.id !== id);
    const activeMissionId = get().activeMissionId === id
      ? (missions.length > 0 ? missions[0].id : null)
      : get().activeMissionId;
    set({ missions, activeMissionId });
    await persist(projectPath, missions);
  },

  setActiveMission: (id) => set({ activeMissionId: id }),

  addStep: async (projectPath, missionId, parentId, title, description, prompt) => {
    const stepId = genId("step");
    const step: MissionStep = {
      id: stepId,
      missionId,
      title,
      description,
      prompt,
      status: "pending",
      parentId,
      children: [],
      dependencies: [],
      position: { x: 0, y: 0 },
      createdAt: now(),
      updatedAt: now(),
    };

    const missions = get().missions.map((m) => {
      if (m.id !== missionId) return m;
      let steps = [...m.steps, step];
      if (parentId) {
        steps = steps.map((s) =>
          s.id === parentId ? { ...s, children: [...s.children, stepId], updatedAt: now() } : s
        );
      }
      return { ...m, steps, updatedAt: now() };
    });
    set({ missions });
    await persist(projectPath, missions);
    return stepId;
  },

  updateStep: async (projectPath, missionId, stepId, updates) => {
    const missions = get().missions.map((m) => {
      if (m.id !== missionId) return m;
      const steps = m.steps.map((s) =>
        s.id === stepId ? { ...s, ...updates, updatedAt: now() } : s
      );
      return { ...m, steps, updatedAt: now() };
    });
    set({ missions });
    await persist(projectPath, missions);
  },

  deleteStep: async (projectPath, missionId, stepId) => {
    const missions = get().missions.map((m) => {
      if (m.id !== missionId) return m;

      const toDelete = new Set<string>();
      function collectDescendants(id: string) {
        toDelete.add(id);
        const step = m.steps.find((s) => s.id === id);
        if (step) {
          for (const childId of step.children) {
            collectDescendants(childId);
          }
        }
      }
      collectDescendants(stepId);

      // Remove deleted steps and clean up ALL references to deleted steps
      let steps = m.steps.filter((s) => !toDelete.has(s.id));
      steps = steps.map((s) => {
        const newChildren = s.children.filter((c) => !toDelete.has(c));
        const newDeps = (s.dependencies || []).filter((d) => !toDelete.has(d));
        const parentChanged = s.parentId && toDelete.has(s.parentId);
        if (newChildren.length !== s.children.length || parentChanged || newDeps.length !== (s.dependencies || []).length) {
          return {
            ...s,
            children: newChildren,
            dependencies: newDeps,
            parentId: parentChanged ? null : s.parentId,
            updatedAt: now(),
          };
        }
        return s;
      });

      return { ...m, steps, updatedAt: now() };
    });
    set({ missions });
    await persist(projectPath, missions);
  },

  cycleStepStatus: async (projectPath, missionId, stepId) => {
    const mission = get().missions.find((m) => m.id === missionId);
    if (!mission) return;
    const step = mission.steps.find((s) => s.id === stepId);
    if (!step) return;
    const currentIdx = STATUS_CYCLE.indexOf(step.status);
    const nextStatus = STATUS_CYCLE[(currentIdx + 1) % STATUS_CYCLE.length];
    const missions = get().missions.map((m) => {
      if (m.id !== missionId) return m;
      const steps = m.steps.map((s) =>
        s.id === stepId ? { ...s, status: nextStatus, updatedAt: now() } : s
      );
      return { ...m, steps, updatedAt: now() };
    });
    set({ missions });
    await persist(projectPath, missions);
  },

  connectSteps: async (projectPath, missionId, fromStepId, toStepId) => {
    if (fromStepId === toStepId) return;
    const mission = get().missions.find((m) => m.id === missionId);
    if (!mission) return;
    const fromStep = mission.steps.find((s) => s.id === fromStepId);
    const toStep = mission.steps.find((s) => s.id === toStepId);
    if (!fromStep || !toStep) return;
    // Already connected
    if (fromStep.children.includes(toStepId)) return;
    // Cycle detection: walk up ALL parents of fromStep to see if toStep is an ancestor
    function isAncestor(stepId: string, targetId: string, visited = new Set<string>()): boolean {
      if (visited.has(stepId)) return false;
      visited.add(stepId);
      // Find all parents of stepId (any step whose children includes stepId)
      for (const s of mission!.steps) {
        if (s.children.includes(stepId)) {
          if (s.id === targetId) return true;
          if (isAncestor(s.id, targetId, visited)) return true;
        }
      }
      return false;
    }
    if (isAncestor(fromStepId, toStepId)) return;

    const missions = get().missions.map((m) => {
      if (m.id !== missionId) return m;
      const steps = m.steps.map((s) => {
        // Add toStep to fromStep's children (don't remove from old parent)
        if (s.id === fromStepId) {
          return { ...s, children: [...s.children, toStepId], updatedAt: now() };
        }
        // Set parentId only if toStep has no parentId yet (first parent = layout parent)
        if (s.id === toStepId && !s.parentId) {
          return { ...s, parentId: fromStepId, updatedAt: now() };
        }
        return s;
      });
      return { ...m, steps, updatedAt: now() };
    });
    set({ missions });
    await persist(projectPath, missions);
  },

  exportMissions: (missionIds) => {
    const missions = get().missions.filter((m) => missionIds.includes(m.id));

    function stepsToTree(steps: MissionStep[], parentId: string | null): ExportedStep[] {
      const idToTitle = new Map(steps.map((s) => [s.id, s.title]));
      return steps
        .filter((s) => s.parentId === parentId)
        .map((s) => ({
          title: s.title,
          description: s.description,
          ...(s.prompt ? { prompt: s.prompt } : {}),
          ...(s.status !== "pending" ? { status: s.status } : {}),
          ...((s.dependencies || []).length > 0
            ? { dependsOn: s.dependencies.map((id) => idToTitle.get(id)).filter(Boolean) as string[] }
            : {}),
          children: stepsToTree(steps, s.id),
        }));
    }

    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      missions: missions.map((m) => ({
        title: m.title,
        description: m.description,
        steps: stepsToTree(m.steps, null),
      })),
    };
  },

  importMissions: async (projectPath, data, mergeAsOne = false) => {
    // Support both "children" and "steps" keys for sub-steps (AI may use either)
    function getChildren(es: any): ExportedStep[] {
      return es.children || es.steps || [];
    }

    // Map from exported step title to generated ID for dependsOn resolution
    const titleToId = new Map<string, string>();

    function treeToSteps(
      missionId: string,
      exportedSteps: ExportedStep[],
      parentId: string | null,
    ): MissionStep[] {
      const result: MissionStep[] = [];
      for (const es of exportedSteps) {
        const stepId = genId("step");
        titleToId.set(es.title, stepId);
        const subSteps = getChildren(es) as ExportedStep[];
        const childSteps = treeToSteps(missionId, subSteps, stepId);
        result.push({
          id: stepId,
          missionId,
          title: es.title,
          description: es.description || "",
          prompt: es.prompt,
          status: es.status || "pending",
          parentId,
          children: childSteps.filter((c) => c.parentId === stepId).map((c) => c.id),
          dependencies: [],
          position: { x: 0, y: 0 },
          createdAt: now(),
          updatedAt: now(),
        });
        result.push(...childSteps);
      }
      return result;
    }

    // Resolve dependsOn references (by title) to step IDs
    function resolveDependencies(
      steps: MissionStep[],
      exportedSteps: ExportedStep[],
    ) {
      function walk(exported: ExportedStep[]) {
        for (const es of exported) {
          if (es.dependsOn && es.dependsOn.length > 0) {
            const stepId = titleToId.get(es.title);
            if (stepId) {
              const step = steps.find((s) => s.id === stepId);
              if (step) {
                step.dependencies = es.dependsOn
                  .map((title) => titleToId.get(title))
                  .filter((id): id is string => !!id);
              }
            }
          }
          const subs = (es as any).children || (es as any).steps || [];
          if (subs.length > 0) walk(subs);
        }
      }
      walk(exportedSteps);
    }

    let newMissions: Mission[];

    if (mergeAsOne && data.missions.length > 1) {
      // Merge all missions into one: each mission becomes a top-level step
      const missionId = genId("mission");
      const allSteps: MissionStep[] = [];

      // Convert each "mission" into a top-level step with its steps as children
      for (const em of data.missions) {
        titleToId.clear();
        const groupStepId = genId("step");
        titleToId.set(em.title, groupStepId);
        const childSteps = treeToSteps(missionId, em.steps || [], groupStepId);

        allSteps.push({
          id: groupStepId,
          missionId,
          title: em.title,
          description: em.description || "",
          prompt: undefined,
          status: "pending",
          parentId: null,
          children: childSteps.filter((c) => c.parentId === groupStepId).map((c) => c.id),
          dependencies: [],
          position: { x: 0, y: 0 },
          createdAt: now(),
          updatedAt: now(),
        });
        allSteps.push(...childSteps);
        resolveDependencies(allSteps, em.steps || []);
      }

      const title = data.missions.map((m) => m.title).join(" + ");
      newMissions = [{
        id: missionId,
        title: title.length > 60 ? title.slice(0, 57) + "..." : title,
        description: data.missions.map((m) => m.description).filter(Boolean).join(" | "),
        steps: allSteps,
        createdAt: now(),
        updatedAt: now(),
      }];
    } else {
      newMissions = data.missions.map((em) => {
        titleToId.clear();
        const missionId = genId("mission");
        const steps = treeToSteps(missionId, em.steps || [], null);
        resolveDependencies(steps, em.steps || []);

        return {
          id: missionId,
          title: em.title,
          description: em.description || "",
          steps,
          createdAt: now(),
          updatedAt: now(),
        };
      });
    }

    const missions = [...get().missions, ...newMissions];
    const activeMissionId = newMissions.length > 0 ? newMissions[0].id : get().activeMissionId;
    set({ missions, activeMissionId });
    await persist(projectPath, missions);
  },

  disconnectSteps: async (projectPath, missionId, parentId, childId) => {
    const mission = get().missions.find((m) => m.id === missionId);
    if (!mission) return;

    const missions = get().missions.map((m) => {
      if (m.id !== missionId) return m;
      // Find if there are other parents for this child besides the one being disconnected
      const otherParent = m.steps.find((s) => s.id !== parentId && s.children.includes(childId));

      const steps = m.steps.map((s) => {
        // Remove child from parent's children
        if (s.id === parentId) {
          return { ...s, children: s.children.filter((c) => c !== childId), updatedAt: now() };
        }
        // Update child's parentId only if it was pointing to the disconnected parent
        if (s.id === childId && s.parentId === parentId) {
          return { ...s, parentId: otherParent ? otherParent.id : null, updatedAt: now() };
        }
        return s;
      });
      return { ...m, steps, updatedAt: now() };
    });
    set({ missions });
    await persist(projectPath, missions);
  },
}));
