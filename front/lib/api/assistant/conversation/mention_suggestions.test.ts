import { describe, expect, it } from "vitest";

import type { RichAgentMention, RichUserMention } from "@app/types";

import { interleaveMentionsPreservingAgentOrder } from "./mention_suggestions";

const buildAgent = (id: number, label?: string): RichAgentMention => ({
  id: `agent-${id}`,
  type: "agent",
  label: label ?? `Agent ${id}`,
  pictureUrl: `/agents/${id}.png`,
  description: `Agent ${id} description`,
});

const buildUser = (id: number, label?: string): RichUserMention => ({
  id: `user-${id}`,
  type: "user",
  label: label ?? `User ${id}`,
  pictureUrl: `/users/${id}.png`,
  description: `user-${id}@dust.tt`,
});

describe("interleaveMentionsPreservingAgentOrder", () => {
  it("preserves the original agent ordering while interleaving users", () => {
    const agents = [1, 2, 3, 4].map((id) => buildAgent(id));
    const users = [1, 2].map((id) => buildUser(id));

    const result = interleaveMentionsPreservingAgentOrder(agents, users);

    const agentIdsInResult = result
      .filter((item) => item.type === "agent")
      .map((item) => item.id);

    expect(agentIdsInResult).toEqual(agents.map((agent) => agent.id));
    expect(result[0].type).toBe("agent");
    expect(result).toHaveLength(agents.length + users.length);
  });

  it("returns only agents when no users are provided", () => {
    const agents = [1, 2, 3].map((id) => buildAgent(id));

    const result = interleaveMentionsPreservingAgentOrder(agents, []);

    expect(result).toEqual(agents);
  });

  it("returns only users when no agents are provided", () => {
    const users = [1, 2].map((id) => buildUser(id));

    const result = interleaveMentionsPreservingAgentOrder([], users);

    expect(result).toEqual(users);
  });
});
