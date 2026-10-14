import type { CollabAgent } from "@app/types/collab";

// Sync, in-memory factory: the agent a live document's editors see reading or editing.
export class CollabAgentFactory {
  static build(overrides: Partial<CollabAgent> = {}): CollabAgent {
    return { agentId: "agt_1", name: "Writer", ...overrides };
  }
}
