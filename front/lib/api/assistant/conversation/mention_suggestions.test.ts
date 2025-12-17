import { describe, expect, it } from "vitest";

import type {
  RichAgentMentionInConversation,
  RichUserMentionInConversation,
} from "@app/types";

import { interleaveMentionsPreservingAgentOrder } from "./mention_suggestions";

const buildAgent = (
  id: number,
  label?: string,
  isParticipant?: boolean,
  lastActivityAt?: number
): RichAgentMentionInConversation => ({
  id: `agent-${id}`,
  type: "agent",
  label: label ?? `Agent ${id}`,
  pictureUrl: `/agents/${id}.png`,
  description: `Agent ${id} description`,
  isParticipant,
  lastActivityAt,
});

const buildUser = (
  id: number,
  label?: string,
  isParticipant?: boolean,
  lastActivityAt?: number
): RichUserMentionInConversation => ({
  id: `user-${id}`,
  type: "user",
  label: label ?? `User ${id}`,
  pictureUrl: `/users/${id}.png`,
  description: `${id}@dust.tt`,
  isParticipant,
  lastActivityAt,
});

describe("interleaveMentionsPreservingAgentOrder", () => {
  it("preserves the original agent ordering while interleaving users", () => {
    const agents = [1, 2, 3, 4].map((id) => buildAgent(id));
    const users = [1, 2].map((id) => buildUser(id));

    const result = interleaveMentionsPreservingAgentOrder(agents, users);

    const agentIdsInResult = result
      .filter((item) => item.type === "agent")
      .map((item) => item.id);

    // Agent order should be preserved
    expect(agentIdsInResult).toEqual(agents.map((agent) => agent.id));
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

  it("should limit results to SUGGESTION_DISPLAY_LIMIT (20)", () => {
    const agents = Array.from({ length: 30 }, (_, i) => buildAgent(i));
    const users = Array.from({ length: 30 }, (_, i) => buildUser(i));

    const result = interleaveMentionsPreservingAgentOrder(agents, users);

    expect(result.length).toBe(20);
  });

  it("should prioritize all user participants before agent participants", () => {
    const agents = [
      buildAgent(1, "Agent 1", true),
      buildAgent(2, "Agent 2", false),
    ];
    const users = [
      buildUser(1, "User 1", true),
      buildUser(2, "User 2", true),
      buildUser(3, "User 3", false),
    ];

    const result = interleaveMentionsPreservingAgentOrder(agents, users);

    expect(result[0].label).toBe("User 1");
    expect(result[1].label).toBe("User 2");
    expect(result[2].label).toBe("Agent 1");
    expect(result.length).toBe(5);
  });

  describe("query-based prioritization", () => {
    it("should prioritize users whose label starts with query", () => {
      const agents = [buildAgent(1, "AgentJo", false)];
      const users = [
        buildUser(1, "John Doe", false),
        buildUser(2, "Joan Smith", false),
      ];

      const result = interleaveMentionsPreservingAgentOrder(
        agents,
        users,
        "jo"
      );

      expect(result[0].label).toBe("John Doe");
      expect(result[1].label).toBe("Joan Smith");
      expect(result[2].label).toBe("AgentJo");
    });

    it("should prioritize agents whose label starts with query", () => {
      const agents = [
        buildAgent(1, "Alpha Agent", false),
        buildAgent(2, "Alex Agent", false),
      ];
      const users = [
        buildUser(1, "Malo", false),
        buildUser(2, "User 2", false),
      ];

      const result = interleaveMentionsPreservingAgentOrder(
        agents,
        users,
        "al"
      );

      expect(result[0].label).toBe("Alpha Agent");
      expect(result[1].label).toBe("Alex Agent");
    });
  });

  describe("last mentioned prioritization", () => {
    it("should move last mentioned agent to first position", () => {
      const agents = [
        buildAgent(1, "Agent 1", false),
        buildAgent(2, "Agent 2", false),
        buildAgent(3, "Agent 3", false),
      ];
      const users = [buildUser(1, "User 1", false)];

      const result = interleaveMentionsPreservingAgentOrder(
        agents,
        users,
        "",
        "agent-2"
      );

      expect(result[0].label).toBe("Agent 2");
    });

    it("should move last mentioned user to first position", () => {
      const agents = [buildAgent(1, "Agent 1", false)];
      const users = [
        buildUser(1, "User 1", false),
        buildUser(2, "User 2", false),
        buildUser(3, "User 3", false),
      ];

      const result = interleaveMentionsPreservingAgentOrder(
        agents,
        users,
        "",
        "user-2"
      );

      expect(result[0].label).toBe("User 2");
    });

    it("should handle last mentioned that is a participant", () => {
      const agents = [
        buildAgent(1, "Agent 1", true),
        buildAgent(2, "Agent 2", false),
      ];
      const users = [
        buildUser(1, "User 1", true),
        buildUser(2, "User 2", false),
      ];

      const result = interleaveMentionsPreservingAgentOrder(
        agents,
        users,
        "",
        "agent-1"
      );

      expect(result[0].label).toBe("Agent 1");
    });
  });
});
