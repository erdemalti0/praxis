import type { AgentEvent, AgentEventType, EventBus, EventSubscriber } from "../types/eventBus";

const RING_BUFFER_SIZE = 500;

function createEventBus(): EventBus {
  const subscribers = new Map<AgentEventType | "*", Set<EventSubscriber>>();
  const buffer: (AgentEvent | null)[] = new Array(RING_BUFFER_SIZE).fill(null);
  let head = 0;
  let count = 0;

  return {
    emit<T extends AgentEventType>(event: AgentEvent<T>) {
      // Add to ring buffer (O(1) instead of O(n) shift)
      buffer[head] = event as AgentEvent;
      head = (head + 1) % RING_BUFFER_SIZE;
      if (count < RING_BUFFER_SIZE) count++;

      // Dispatch to type-specific subscribers (synchronous)
      const typeHandlers = subscribers.get(event.type);
      if (typeHandlers) {
        for (const handler of typeHandlers) {
          try {
            handler(event as AgentEvent);
          } catch (err) {
            console.error(`[EventBus] Subscriber error on "${event.type}":`, err);
          }
        }
      }

      // Dispatch to wildcard subscribers
      const wildcardHandlers = subscribers.get("*");
      if (wildcardHandlers) {
        for (const handler of wildcardHandlers) {
          try {
            handler(event as AgentEvent);
          } catch (err) {
            console.error("[EventBus] Wildcard subscriber error:", err);
          }
        }
      }
    },

    subscribe(type: AgentEventType | "*", handler: EventSubscriber): () => void {
      if (!subscribers.has(type)) {
        subscribers.set(type, new Set());
      }
      subscribers.get(type)!.add(handler);

      // Return unsubscribe function
      return () => {
        const handlers = subscribers.get(type);
        if (handlers) {
          handlers.delete(handler);
          if (handlers.size === 0) {
            subscribers.delete(type);
          }
        }
      };
    },

    getHistory(limit?: number): AgentEvent[] {
      const n = limit !== undefined ? Math.min(limit, count) : count;
      const result: AgentEvent[] = [];
      const start = (head - n + RING_BUFFER_SIZE) % RING_BUFFER_SIZE;
      for (let i = 0; i < n; i++) {
        result.push(buffer[(start + i) % RING_BUFFER_SIZE]!);
      }
      return result;
    },

    clear() {
      subscribers.clear();
      buffer.fill(null);
      head = 0;
      count = 0;
    },
  };
}

/** Singleton event bus for all agent events */
export const agentEventBus: EventBus = createEventBus();
