import type { VirtuosoMessage } from "@app/components/assistant/conversation/types";
import { getSteerGroupInfo } from "@app/components/assistant/conversation/utils";
import { describe, expect, it } from "vitest";

function makeAgentMessage(
  sId: string,
  configurationSId: string,
  status: string,
  opts?: {
    created?: number;
    completedTs?: number | null;
    completionDurationMs?: number | null;
  }
): VirtuosoMessage {
  return {
    sId,
    type: "agent_message",
    status,
    configuration: { sId: configurationSId },
    streaming: {},
    created: opts?.created ?? 0,
    completedTs: opts?.completedTs ?? null,
    completionDurationMs: opts?.completionDurationMs ?? null,
  } as unknown as VirtuosoMessage;
}

function makeUserMessage(sId: string): VirtuosoMessage {
  return {
    sId,
    type: "user_message",
  } as unknown as VirtuosoMessage;
}

describe("getSteerGroupInfo", () => {
  it("returns no group for a standalone agent message", () => {
    const messages = [
      makeUserMessage("u1"),
      makeAgentMessage("a1", "config-1", "succeeded"),
    ];

    const result = getSteerGroupInfo({
      messages,
      messageSId: "a1",
      configurationId: "config-1",
      agentStatus: "succeeded",
    });

    expect(result).toEqual({
      isSteeredAgentMessage: false,
      steerGroupId: null,
      groupDurationMs: null,
      isGroupComplete: false,
    });
  });

  it("identifies the root of a steered chain (forward-look)", () => {
    const messages = [
      makeAgentMessage("a1", "config-1", "gracefully_stopped"),
      makeUserMessage("u1"),
      makeAgentMessage("a2", "config-1", "succeeded", {
        completedTs: 5000,
      }),
    ];

    const result = getSteerGroupInfo({
      messages,
      messageSId: "a1",
      configurationId: "config-1",
      agentStatus: "gracefully_stopped",
    });

    expect(result).toMatchObject({
      isSteeredAgentMessage: false,
      steerGroupId: "a1",
      isGroupComplete: true,
    });
  });

  it("identifies a steered continuation and finds the root", () => {
    const messages = [
      makeAgentMessage("a1", "config-1", "gracefully_stopped"),
      makeUserMessage("u1"),
      makeAgentMessage("a2", "config-1", "succeeded"),
    ];

    const result = getSteerGroupInfo({
      messages,
      messageSId: "a2",
      configurationId: "config-1",
      agentStatus: "succeeded",
    });

    expect(result).toMatchObject({
      isSteeredAgentMessage: true,
      steerGroupId: "a1",
    });
  });

  it("finds the true root in a chain of 3+ steered messages", () => {
    const messages = [
      makeAgentMessage("a1", "config-1", "gracefully_stopped"),
      makeUserMessage("u1"),
      makeAgentMessage("a2", "config-1", "gracefully_stopped"),
      makeUserMessage("u2"),
      makeAgentMessage("a3", "config-1", "succeeded"),
    ];

    // a3 should point to a1 as the group root.
    expect(
      getSteerGroupInfo({
        messages,
        messageSId: "a3",
        configurationId: "config-1",
        agentStatus: "succeeded",
      })
    ).toMatchObject({
      isSteeredAgentMessage: true,
      steerGroupId: "a1",
    });

    // a2 should also point to a1 as the group root.
    expect(
      getSteerGroupInfo({
        messages,
        messageSId: "a2",
        configurationId: "config-1",
        agentStatus: "gracefully_stopped",
      })
    ).toMatchObject({
      isSteeredAgentMessage: true,
      steerGroupId: "a1",
    });

    // a1 is the root — forward-look should find a2 as a continuation.
    expect(
      getSteerGroupInfo({
        messages,
        messageSId: "a1",
        configurationId: "config-1",
        agentStatus: "gracefully_stopped",
      })
    ).toMatchObject({
      isSteeredAgentMessage: false,
      steerGroupId: "a1",
    });
  });

  it("does not group messages from different configurations", () => {
    const messages = [
      makeAgentMessage("a1", "config-1", "gracefully_stopped"),
      makeUserMessage("u1"),
      makeAgentMessage("a2", "config-2", "succeeded"),
    ];

    const result = getSteerGroupInfo({
      messages,
      messageSId: "a2",
      configurationId: "config-2",
      agentStatus: "succeeded",
    });

    expect(result).toEqual({
      isSteeredAgentMessage: false,
      steerGroupId: null,
      groupDurationMs: null,
      isGroupComplete: false,
    });
  });

  it("does not group when previous agent message is succeeded (not steered)", () => {
    const messages = [
      makeAgentMessage("a1", "config-1", "succeeded"),
      makeUserMessage("u1"),
      makeAgentMessage("a2", "config-1", "succeeded"),
    ];

    const result = getSteerGroupInfo({
      messages,
      messageSId: "a2",
      configurationId: "config-1",
      agentStatus: "succeeded",
    });

    expect(result).toEqual({
      isSteeredAgentMessage: false,
      steerGroupId: null,
      groupDurationMs: null,
      isGroupComplete: false,
    });
  });

  it("skips user messages when walking backwards", () => {
    const messages = [
      makeAgentMessage("a1", "config-1", "gracefully_stopped"),
      makeUserMessage("u1"),
      makeUserMessage("u2"),
      makeUserMessage("u3"),
      makeAgentMessage("a2", "config-1", "succeeded"),
    ];

    const result = getSteerGroupInfo({
      messages,
      messageSId: "a2",
      configurationId: "config-1",
      agentStatus: "succeeded",
    });

    expect(result).toMatchObject({
      isSteeredAgentMessage: true,
      steerGroupId: "a1",
    });
  });

  it("handles root with status 'created' (still streaming)", () => {
    const messages = [
      makeAgentMessage("a1", "config-1", "created"),
      makeUserMessage("u1"),
      makeAgentMessage("a2", "config-1", "created"),
    ];

    expect(
      getSteerGroupInfo({
        messages,
        messageSId: "a2",
        configurationId: "config-1",
        agentStatus: "created",
      })
    ).toMatchObject({
      isSteeredAgentMessage: true,
      steerGroupId: "a1",
    });

    expect(
      getSteerGroupInfo({
        messages,
        messageSId: "a1",
        configurationId: "config-1",
        agentStatus: "created",
      })
    ).toMatchObject({
      isSteeredAgentMessage: false,
      steerGroupId: "a1",
    });
  });

  describe("groupDurationMs", () => {
    it("sums individual completionDurationMs values across the group", () => {
      const messages = [
        makeAgentMessage("a1", "config-1", "gracefully_stopped", {
          created: 1000,
          completedTs: 3000,
          completionDurationMs: 2000,
        }),
        makeUserMessage("u1"),
        makeAgentMessage("a2", "config-1", "succeeded", {
          created: 4000,
          completedTs: 8000,
          completionDurationMs: 3500,
        }),
      ];

      const rootResult = getSteerGroupInfo({
        messages,
        messageSId: "a1",
        configurationId: "config-1",
        agentStatus: "gracefully_stopped",
      });

      // Duration = sum of individual durations: 2000 + 3500 = 5500ms
      expect(rootResult.groupDurationMs).toBe(5500);
    });

    it("returns null duration when no message has completionDurationMs", () => {
      const messages = [
        makeAgentMessage("a1", "config-1", "gracefully_stopped", {
          created: 1000,
        }),
        makeUserMessage("u1"),
        makeAgentMessage("a2", "config-1", "created", {
          created: 4000,
          completedTs: null,
        }),
      ];

      const result = getSteerGroupInfo({
        messages,
        messageSId: "a1",
        configurationId: "config-1",
        agentStatus: "gracefully_stopped",
      });

      expect(result.groupDurationMs).toBeNull();
    });
  });

  describe("isGroupComplete", () => {
    it("returns true when all messages in the group are done", () => {
      const messages = [
        makeAgentMessage("a1", "config-1", "gracefully_stopped"),
        makeUserMessage("u1"),
        makeAgentMessage("a2", "config-1", "succeeded"),
      ];

      const result = getSteerGroupInfo({
        messages,
        messageSId: "a1",
        configurationId: "config-1",
        agentStatus: "gracefully_stopped",
      });

      expect(result.isGroupComplete).toBe(true);
    });

    it("returns false when the last message is still running", () => {
      const messages = [
        makeAgentMessage("a1", "config-1", "gracefully_stopped"),
        makeUserMessage("u1"),
        makeAgentMessage("a2", "config-1", "created"),
      ];

      const result = getSteerGroupInfo({
        messages,
        messageSId: "a1",
        configurationId: "config-1",
        agentStatus: "gracefully_stopped",
      });

      expect(result.isGroupComplete).toBe(false);
    });

    it("returns false when no group exists", () => {
      const messages = [makeAgentMessage("a1", "config-1", "succeeded")];

      const result = getSteerGroupInfo({
        messages,
        messageSId: "a1",
        configurationId: "config-1",
        agentStatus: "succeeded",
      });

      expect(result.isGroupComplete).toBe(false);
    });
  });
});
