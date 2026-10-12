import type { LiveAgent } from "@app/types/collab";

// Sync, in-memory factory: the agent a live document's editors see reading or editing.
export class LiveAgentFactory {
  static build(overrides: Partial<LiveAgent> = {}): LiveAgent {
    return { agentId: "agt_1", name: "Writer", ...overrides };
  }
}
