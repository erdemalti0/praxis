import type { ChatAgentId } from "../../types/agentPanel";
import type { MissionStep } from "../../types/mission";
import type { AgentAdapter } from "./adapters/base";

export type StepExecutionStatus = "pending" | "running" | "complete" | "error" | "skipped";

export interface StepExecutionConfig {
  agentId: ChatAgentId;
  model?: string;
}

export interface StepExecutionState {
  stepId: string;
  status: StepExecutionStatus;
  config: StepExecutionConfig;
  messageId?: string;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface BuildExecutorState {
  missionId: string;
  status: "idle" | "running" | "paused" | "complete" | "error";
  steps: StepExecutionState[];
  currentStepId: string | null;
}

/**
 * Build executor: orchestrates sequential execution of mission plan steps.
 * Respects dependency ordering via Kahn's algorithm (topological sort).
 */
export class BuildExecutor {
  private missionId: string;
  private steps: MissionStep[];
  private getAdapter: (agentId: ChatAgentId) => Promise<AgentAdapter>;
  private stepStates = new Map<string, StepExecutionState>();
  private executionOrder: string[] = [];
  private currentIdx = 0;
  private paused = false;
  private status: "idle" | "running" | "paused" | "complete" | "error" = "idle";

  constructor(
    missionId: string,
    steps: MissionStep[],
    getAdapter: (agentId: ChatAgentId) => Promise<AgentAdapter>,
  ) {
    this.missionId = missionId;
    this.steps = steps;
    this.getAdapter = getAdapter;

    // Initialize step states with default config
    for (const step of steps) {
      this.stepStates.set(step.id, {
        stepId: step.id,
        status: "pending",
        config: { agentId: "claude-code" },
      });
    }

    // Compute execution order (topological sort of leaf steps)
    this.executionOrder = this.topologicalSort();
  }

  /**
   * Kahn's algorithm for topological sorting.
   * Only includes leaf steps (those with prompts) — parent/phase steps are skipped.
   */
  private topologicalSort(): string[] {
    // Filter to leaf steps only (those with prompts and no children)
    const leafSteps = this.steps.filter((s) => s.children.length === 0 && s.prompt);
    const leafIds = new Set(leafSteps.map((s) => s.id));

    // Build adjacency from dependencies
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();

    for (const step of leafSteps) {
      if (!inDegree.has(step.id)) inDegree.set(step.id, 0);
      if (!adjList.has(step.id)) adjList.set(step.id, []);

      for (const depId of step.dependencies) {
        if (!leafIds.has(depId)) continue;
        if (!adjList.has(depId)) adjList.set(depId, []);
        adjList.get(depId)!.push(step.id);
        inDegree.set(step.id, (inDegree.get(step.id) || 0) + 1);
      }
    }

    // Kahn's algorithm
    const queue: string[] = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) queue.push(id);
    }

    const sorted: string[] = [];
    while (queue.length > 0) {
      const node = queue.shift()!;
      sorted.push(node);
      for (const neighbor of adjList.get(node) || []) {
        const newDegree = (inDegree.get(neighbor) || 1) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) queue.push(neighbor);
      }
    }

    // Detect cycles
    if (sorted.length !== leafSteps.length) {
      console.error("[BuildExecutor] Cycle detected in step dependencies. Some steps unreachable.");
    }

    return sorted;
  }

  /** Configure agent/model for a specific step */
  configureStep(stepId: string, config: StepExecutionConfig): void {
    const state = this.stepStates.get(stepId);
    if (state) {
      state.config = config;
    }
  }

  /**
   * Execute the next available step.
   * Returns the step ID being executed, or null if none available.
   */
  async executeNext(): Promise<string | null> {
    if (this.paused || this.currentIdx >= this.executionOrder.length) {
      return null;
    }

    const stepId = this.executionOrder[this.currentIdx];
    const step = this.steps.find((s) => s.id === stepId);
    const state = this.stepStates.get(stepId);

    if (!step || !state) return null;

    // Check dependencies are complete
    for (const depId of step.dependencies) {
      const depState = this.stepStates.get(depId);
      if (depState && depState.status !== "complete") {
        state.error = `Blocked by incomplete dependency: ${depId}`;
        state.status = "error";
        this.status = "error";
        return null;
      }
    }

    this.status = "running";
    state.status = "running";
    state.startedAt = Date.now();

    try {
      const adapter = await this.getAdapter(state.config.agentId);
      const prompt = step.prompt || step.description;
      adapter.sendMessage(prompt, state.config.model);
      state.messageId = crypto.randomUUID();
      return stepId;
    } catch (err) {
      state.status = "error";
      state.error = String(err);
      this.status = "error";
      return null;
    }
  }

  /** Mark the current step complete and advance to the next */
  completeCurrentStep(): void {
    const stepId = this.executionOrder[this.currentIdx];
    const state = this.stepStates.get(stepId);
    if (state) {
      state.status = "complete";
      state.completedAt = Date.now();
    }

    this.currentIdx++;
    if (this.currentIdx >= this.executionOrder.length) {
      this.status = "complete";
    } else if (!this.paused) {
      this.status = "running";
    }
  }

  pause(): void {
    this.paused = true;
    this.status = "paused";
  }

  resume(): void {
    this.paused = false;
    if (this.currentIdx < this.executionOrder.length) {
      this.status = "running";
    }
  }

  getState(): BuildExecutorState {
    return {
      missionId: this.missionId,
      status: this.status,
      steps: Array.from(this.stepStates.values()),
      currentStepId: this.currentIdx < this.executionOrder.length
        ? this.executionOrder[this.currentIdx]
        : null,
    };
  }
}
