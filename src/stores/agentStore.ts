import { create } from "zustand";
import type { Agent, AgentGroup } from "../types/agent";

interface AgentState {
  agents: Agent[];
  selectedAgentId: string | null;
  setAgents: (agents: Agent[]) => void;
  selectAgent: (id: string | null) => void;
  updateAgent: (id: string, updates: Partial<Agent>) => void;
  getGroups: () => AgentGroup[];
}

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: [],
  selectedAgentId: null,

  setAgents: (agents) => set({ agents }),

  selectAgent: (id) => set({ selectedAgentId: id }),

  updateAgent: (id, updates) =>
    set((state) => ({
      agents: state.agents.map((a) =>
        a.id === id ? { ...a, ...updates } : a
      ),
    })),

  getGroups: () => {
    const { agents } = get();
    const groupMap = new Map<string, AgentGroup>();
    for (const agent of agents) {
      const key = agent.projectPath;
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          projectPath: key,
          projectName: agent.projectName,
          agents: [],
        });
      }
      groupMap.get(key)!.agents.push(agent);
    }
    return Array.from(groupMap.values());
  },
}));
