import type { ChatAgentId, ChatMessage } from "../../types/agentPanel";
import { AGENT_CONFIGS } from "../../types/agentPanel";
import type { DebateConfig } from "../../types/debate";
import type { AgentAdapter } from "./adapters/base";
import { createAdapter } from "./adapters";
import { wireAdapterToEventBus } from "./adapterBridge";
import { agentEventBus } from "../eventBus";
import { useAgentPanelStore } from "../../stores/agentPanelStore";
import { useDebateStore } from "../../stores/debateStore";
import type { AgentEvent } from "../../types/eventBus";

/**
 * Orchestrates debate sessions between two agents.
 *
 * Three modes:
 * - side-by-side: Both agents answer the same prompt simultaneously
 * - sequential: Agent A answers, then Agent B reviews Agent A's response
 * - multi-round: Alternating rounds where agents respond to each other
 */
export class DebateOrchestrator {
  private adapters: Partial<Record<ChatAgentId, AgentAdapter>> = {};
  private streamingMsgIds: Partial<Record<ChatAgentId, string>> = {};
  private cwd: string;
  /** External callback to sync streaming message IDs with the main event bus store bridge */
  private onStreamingMsgId?: (agentId: ChatAgentId, msgId: string | undefined) => void;

  constructor(cwd: string, onStreamingMsgId?: (agentId: ChatAgentId, msgId: string | undefined) => void) {
    this.cwd = cwd;
    this.onStreamingMsgId = onStreamingMsgId;
  }

  /** Get or create an adapter for the given agent */
  private async getAdapter(agentId: ChatAgentId): Promise<AgentAdapter> {
    if (this.adapters[agentId]) return this.adapters[agentId]!;

    const adapter = createAdapter(agentId);
    wireAdapterToEventBus(adapter, agentId, () => this.streamingMsgIds[agentId]);
    const { ptySessionId, pid } = await adapter.spawn(this.cwd);

    // Ensure session exists in store so addMessage/appendBlock work
    const store = useAgentPanelStore.getState();
    if (!store.sessions[agentId]) {
      store.initSession(agentId, {
        agentId,
        ptySessionId,
        status: "running",
        messages: [],
        totalCost: 0,
        totalTokensIn: 0,
        totalTokensOut: 0,
        pid,
      });
    }

    this.adapters[agentId] = adapter;
    return adapter;
  }

  /** Create a user message in the store */
  private addUserMessage(agentId: ChatAgentId, text: string): string {
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      blocks: [{ type: "text", text }],
      timestamp: Date.now(),
      agentId,
    };
    useAgentPanelStore.getState().addMessage(agentId, msg);
    return msg.id;
  }

  /** Create a streaming assistant message and return its ID */
  private addAssistantMessage(agentId: ChatAgentId, model?: string): string {
    const msgId = crypto.randomUUID();
    const msg: ChatMessage = {
      id: msgId,
      role: "assistant",
      blocks: [],
      timestamp: Date.now(),
      agentId,
      model,
      isStreaming: true,
    };
    useAgentPanelStore.getState().addMessage(agentId, msg);
    this.streamingMsgIds[agentId] = msgId;
    this.onStreamingMsgId?.(agentId, msgId);
    return msgId;
  }

  /** Wait for a specific agent's message to complete (with timeout) */
  private waitForMessageComplete(agentId: ChatAgentId, timeoutMs = 300_000): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        unsub();
        reject(new Error(`Timeout waiting for ${agentId} message complete after ${timeoutMs}ms`));
      }, timeoutMs);
      const unsub = agentEventBus.subscribe("message_complete", (event: AgentEvent) => {
        if (event.agentId === agentId) {
          clearTimeout(timer);
          unsub();
          this.streamingMsgIds[agentId] = undefined;
          this.onStreamingMsgId?.(agentId, undefined);
          const { messageId } = event.payload as { messageId: string };
          resolve(messageId);
        }
      });
    });
  }

  /** Get the text content of a completed message */
  private getMessageText(agentId: ChatAgentId, messageId: string): string {
    const session = useAgentPanelStore.getState().sessions[agentId];
    if (!session) return "";
    const msg = session.messages.find((m) => m.id === messageId);
    if (!msg) return "";
    return msg.blocks
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("\n\n");
  }

  /**
   * Wrap the user's raw topic into a debate-aware prompt for the first round.
   * Gives the agent context that it's in a structured debate and should
   * take a clear position with well-supported arguments.
   */
  private buildInitialPrompt(config: DebateConfig, agentId: ChatAgentId): string {
    const opponentId = agentId === config.agentA ? config.agentB : config.agentA;
    const opponentLabel = AGENT_CONFIGS[opponentId].label;
    const modeDesc =
      config.mode === "side-by-side"
        ? `You and ${opponentLabel} are both answering this question simultaneously. Your responses will be compared side-by-side.`
        : config.mode === "sequential"
          ? agentId === config.agentA
            ? `You are the first responder in a structured debate. ${opponentLabel} will review and critique your response afterward.`
            : "" // Agent B gets a different prompt in sequential (the review prompt)
          : `You are in a ${config.rounds}-round structured debate against ${opponentLabel}. This is round 1. Take a clear, well-reasoned position.`;

    return [
      `You are participating in a structured AI debate.`,
      modeDesc,
      ``,
      `Provide a thorough, well-structured analysis. Take clear positions and support them with reasoning.`,
      ``,
      `Topic/Question:`,
      config.topic,
    ].join("\n");
  }

  /** Add a debate round divider to unified messages */
  private addRoundDivider(_roundNumber: number) {
    const debate = useDebateStore.getState().activeDebate;
    if (!debate) return;
    useAgentPanelStore.getState().addUnifiedMessage({
      id: crypto.randomUUID(),
      type: "agent-switch",
      fromAgent: debate.config.agentA,
      toAgent: debate.config.agentB,
      timestamp: Date.now(),
    });
  }

  /** Run a side-by-side debate: both agents answer simultaneously */
  private async runSideBySide(config: DebateConfig, modelA?: string, modelB?: string): Promise<void> {
    const debateStore = useDebateStore.getState();

    debateStore.updateRound(1, { status: "agent-a-running" });

    const [adapterA, adapterB] = await Promise.all([
      this.getAdapter(config.agentA),
      this.getAdapter(config.agentB),
    ]);

    // Build debate-aware prompts
    const promptA = this.buildInitialPrompt(config, config.agentA);
    const promptB = this.buildInitialPrompt(config, config.agentB);

    // Show original topic in UI (cleaner for user), but send debate-wrapped prompt to agents
    this.addUserMessage(config.agentA, config.topic);
    this.addUserMessage(config.agentB, config.topic);

    // Create streaming messages for both
    this.addAssistantMessage(config.agentA, modelA);
    this.addAssistantMessage(config.agentB, modelB);

    // Add agent switch divider between the two
    this.addRoundDivider(1);

    // Send debate-wrapped prompts to both in parallel
    const waitA = this.waitForMessageComplete(config.agentA);
    const waitB = this.waitForMessageComplete(config.agentB);

    adapterA.sendMessage(promptA, modelA);
    adapterB.sendMessage(promptB, modelB);

    // Wait for both to complete
    const [completedA, completedB] = await Promise.all([waitA, waitB]);

    debateStore.updateRound(1, {
      status: "complete",
      agentAMessageId: completedA,
      agentBMessageId: completedB,
    });

    // Synthesis round
    const textA = this.getMessageText(config.agentA, completedA);
    const textB = this.getMessageText(config.agentB, completedB);
    await this.runSynthesis(config, textA, textB, modelA);

    debateStore.setStatus("complete");
  }

  /** Run a sequential debate: A answers, B reviews */
  private async runSequential(config: DebateConfig, modelA?: string, modelB?: string): Promise<void> {
    const debateStore = useDebateStore.getState();

    // Round 1: Agent A answers (with debate context)
    debateStore.updateRound(1, { status: "agent-a-running" });

    const promptA = this.buildInitialPrompt(config, config.agentA);
    const adapterA = await this.getAdapter(config.agentA);
    this.addUserMessage(config.agentA, config.topic);
    this.addAssistantMessage(config.agentA, modelA);

    const waitA = this.waitForMessageComplete(config.agentA);
    adapterA.sendMessage(promptA, modelA);
    const completedA = await waitA;

    debateStore.updateRound(1, { agentAMessageId: completedA, status: "agent-b-running" });

    // Divider
    this.addRoundDivider(1);

    // Round 1: Agent B reviews Agent A's response
    const agentAText = this.getMessageText(config.agentA, completedA);
    const agentALabel = AGENT_CONFIGS[config.agentA].label;
    const reviewPrompt = [
      `You are participating in a structured AI debate as the reviewer/challenger.`,
      `${agentALabel} has already provided their analysis. Your role is to critically evaluate their response, identify weaknesses, and provide your own stronger analysis.`,
      ``,
      `Topic/Question:`,
      `"${config.topic}"`,
      ``,
      `--- ${agentALabel}'s response ---`,
      agentAText,
      ``,
      `Review this response critically. Point out errors, logical gaps, or missing considerations. Then provide your own thorough analysis.`,
    ].join("\n");

    const adapterB = await this.getAdapter(config.agentB);
    this.addUserMessage(config.agentB, `[Review] Critique ${agentALabel}'s analysis of: ${config.topic}`);
    this.addAssistantMessage(config.agentB, modelB);

    const waitB = this.waitForMessageComplete(config.agentB);
    adapterB.sendMessage(reviewPrompt, modelB);
    const completedB = await waitB;

    debateStore.updateRound(1, {
      status: "complete",
      agentBMessageId: completedB,
    });

    // Synthesis round
    const agentBText = this.getMessageText(config.agentB, completedB);
    await this.runSynthesis(config, agentAText, agentBText, modelA);

    debateStore.setStatus("complete");
  }

  /** Run a multi-round debate: agents take turns responding to each other */
  private async runMultiRound(config: DebateConfig, modelA?: string, modelB?: string): Promise<void> {
    const debateStore = useDebateStore.getState();

    let lastAgentAText = "";
    let lastAgentBText = "";

    for (let round = 1; round <= config.rounds; round++) {
      const currentDebate = useDebateStore.getState().activeDebate;
      if (!currentDebate || currentDebate.status === "cancelled") {
        for (const adapter of Object.values(this.adapters)) adapter?.kill();
        break;
      }

      // Agent A's turn
      debateStore.updateRound(round, { status: "agent-a-running" });

      const labelB = AGENT_CONFIGS[config.agentB].label;
      let promptA: string;
      if (round === 1) {
        promptA = this.buildInitialPrompt(config, config.agentA);
      } else {
        promptA = [
          `This is round ${round} of ${config.rounds} in a structured debate about: "${config.topic}"`,
          "",
          `${labelB}'s previous response was:`,
          "",
          lastAgentBText,
          "",
          `Respond to their points, address critiques, strengthen your arguments, and refine your position.`,
        ].join("\n");
      }

      const adapterA = await this.getAdapter(config.agentA);
      this.addUserMessage(config.agentA, round === 1 ? config.topic : `[Round ${round}/${config.rounds}] Respond to ${labelB}'s analysis`);
      this.addAssistantMessage(config.agentA, modelA);

      const waitA = this.waitForMessageComplete(config.agentA);
      adapterA.sendMessage(promptA, modelA);
      const completedA = await waitA;

      lastAgentAText = this.getMessageText(config.agentA, completedA);
      debateStore.updateRound(round, { agentAMessageId: completedA, status: "agent-b-running" });

      // Divider
      this.addRoundDivider(round);

      // Agent B's turn
      const labelA = AGENT_CONFIGS[config.agentA].label;
      const promptB = round === 1
        ? [
            `You are participating in a ${config.rounds}-round structured debate as the challenger/reviewer.`,
            `${labelA} has provided their initial analysis. Critically evaluate their response and provide your own stronger analysis.`,
            ``,
            `Topic/Question:`,
            `"${config.topic}"`,
            ``,
            `--- ${labelA}'s response ---`,
            lastAgentAText,
            ``,
            `Review critically, identify weaknesses, and present your own thorough analysis.`,
          ].join("\n")
        : [
            `This is round ${round} of ${config.rounds} in a structured debate about: "${config.topic}"`,
            "",
            `${labelA}'s latest response was:`,
            "",
            lastAgentAText,
            "",
            `Respond to their points, address critiques, strengthen your arguments, and refine your position.`,
          ].join("\n");

      const adapterB = await this.getAdapter(config.agentB);
      this.addUserMessage(config.agentB, `[Round ${round}/${config.rounds}] Review ${labelA}'s analysis`);
      this.addAssistantMessage(config.agentB, modelB);

      const waitB = this.waitForMessageComplete(config.agentB);
      adapterB.sendMessage(promptB, modelB);
      const completedB = await waitB;

      lastAgentBText = this.getMessageText(config.agentB, completedB);
      debateStore.updateRound(round, { status: "complete", agentBMessageId: completedB });
      debateStore.advanceRound();
    }

    const finalDebate = useDebateStore.getState().activeDebate;
    if (finalDebate && finalDebate.status !== "cancelled") {
      // Synthesis round using both agents' last positions
      await this.runSynthesis(config, lastAgentAText, lastAgentBText, modelA);
      debateStore.setStatus("complete");
    }
  }

  /**
   * Run a synthesis round: ask Agent A to produce a neutral consensus summary
   * based on both agents' final positions.
   */
  private async runSynthesis(
    config: DebateConfig,
    agentAText: string,
    agentBText: string,
    modelA?: string,
  ): Promise<void> {
    const debateStore = useDebateStore.getState();
    const currentDebate = debateStore.activeDebate;
    if (!currentDebate || currentDebate.status === "cancelled") return;

    const labelA = AGENT_CONFIGS[config.agentA].label;
    const labelB = AGENT_CONFIGS[config.agentB].label;

    // Update last round to synthesizing
    const lastRound = currentDebate.rounds[currentDebate.rounds.length - 1];
    if (lastRound) {
      debateStore.updateRound(lastRound.roundNumber, { status: "synthesizing" });
    }

    // Add a divider for synthesis
    useAgentPanelStore.getState().addUnifiedMessage({
      id: crypto.randomUUID(),
      type: "agent-switch",
      fromAgent: config.agentB,
      toAgent: config.agentA,
      timestamp: Date.now(),
    });

    const synthesisPrompt = [
      `You are acting as a neutral synthesizer. Two AI agents just debated the following topic:`,
      ``,
      `"${config.topic}"`,
      ``,
      `--- ${labelA}'s final position ---`,
      agentAText,
      ``,
      `--- ${labelB}'s final position ---`,
      agentBText,
      ``,
      `Please produce a structured consensus summary:`,
      `1. **Points of Agreement**: What both agents agree on`,
      `2. **Key Differences**: Where they disagree and why`,
      `3. **Synthesis / Recommended Conclusion**: Your best assessment combining the strongest arguments from both sides`,
      `4. **Open Questions**: Any unresolved points that need further investigation`,
      ``,
      `Be objective and fair to both perspectives. Do not favor one agent over the other.`,
    ].join("\n");

    const adapterA = await this.getAdapter(config.agentA);
    this.addUserMessage(config.agentA, "[Synthesis] Produce consensus summary from debate");
    this.addAssistantMessage(config.agentA, modelA);

    const waitSynthesis = this.waitForMessageComplete(config.agentA);
    adapterA.sendMessage(synthesisPrompt, modelA);
    const synthesisId = await waitSynthesis;

    debateStore.setSynthesis(config.agentA, synthesisId);
  }

  /** Start a debate with the given configuration */
  async start(config: DebateConfig, modelA?: string, modelB?: string): Promise<void> {
    try {
      switch (config.mode) {
        case "side-by-side":
          await this.runSideBySide(config, modelA, modelB);
          break;
        case "sequential":
          await this.runSequential(config, modelA, modelB);
          break;
        case "multi-round":
          await this.runMultiRound(config, modelA, modelB);
          break;
      }
    } catch (err) {
      useDebateStore.getState().setStatus("error", String(err));
    }
  }

  /** Stop and clean up all debate resources */
  dispose(): void {
    for (const adapter of Object.values(this.adapters)) {
      adapter?.kill();
      adapter?.dispose();
    }
    this.adapters = {};
    this.streamingMsgIds = {};
  }
}
