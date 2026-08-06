import { redactUserMemoryFromMessageStreamEvent } from "@app/lib/api/assistant/user_memory_redaction";
import type { AgentMCPActionWithOutputType } from "@app/types/actions";
import { describe, expect, it } from "vitest";

const MEMORY_TEXT = "SECRET: user lives in Paris";

function makeAction(
  overrides: Partial<AgentMCPActionWithOutputType> = {}
): AgentMCPActionWithOutputType {
  return {
    id: 1,
    sId: "act_1",
    createdAt: 0,
    updatedAt: 0,
    agentMessageId: 1,
    internalMCPServerName: "user_memory",
    toolName: "read",
    mcpServerId: "srv",
    functionCallName: "read",
    functionCallId: "call_1",
    params: { oldStr: MEMORY_TEXT },
    citationsAllocated: 0,
    status: "succeeded",
    step: 0,
    executionDurationMs: null,
    displayLabels: null,
    generatedFiles: [],
    output: [{ type: "text", text: MEMORY_TEXT }],
    citations: null,
    ...overrides,
  };
}

describe("redactUserMemoryFromMessageStreamEvent", () => {
  it("redacts params and output of a user_memory agent_action_success event", () => {
    const redacted = redactUserMemoryFromMessageStreamEvent({
      eventId: "evt",
      data: {
        type: "agent_action_success",
        created: 0,
        configurationId: "dust",
        messageId: "msg",
        action: makeAction(),
        step: 0,
      },
    });

    expect(JSON.stringify(redacted)).not.toContain(MEMORY_TEXT);
    if ("action" in redacted.data) {
      expect(redacted.data.action.params).toEqual({});
    }
  });

  it("redacts params of a user_memory tool_params event", () => {
    const redacted = redactUserMemoryFromMessageStreamEvent({
      eventId: "evt",
      data: {
        type: "tool_params",
        created: 0,
        configurationId: "dust",
        messageId: "msg",
        action: makeAction({ toolName: "edit", output: null }),
        step: 0,
      },
    });

    expect(JSON.stringify(redacted)).not.toContain(MEMORY_TEXT);
  });

  it("leaves a non-user_memory action event untouched", () => {
    const event = {
      eventId: "evt",
      data: {
        type: "agent_action_success" as const,
        created: 0,
        configurationId: "dust",
        messageId: "msg",
        action: makeAction({ internalMCPServerName: "search" }),
        step: 0,
      },
    };

    const redacted = redactUserMemoryFromMessageStreamEvent(event);

    expect(JSON.stringify(redacted)).toContain(MEMORY_TEXT);
  });

  it("leaves an event without an action untouched", () => {
    const event = {
      eventId: "evt",
      data: {
        type: "generation_tokens" as const,
        created: 0,
        configurationId: "dust",
        messageId: "msg",
        text: MEMORY_TEXT,
        classification: "tokens" as const,
        step: 0,
      },
    };

    const redacted = redactUserMemoryFromMessageStreamEvent(event);

    expect(JSON.stringify(redacted)).toContain(MEMORY_TEXT);
  });
});
