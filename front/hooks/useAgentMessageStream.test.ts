import type { PendingToolCall } from "@app/components/assistant/conversation/types";
import {
  removePendingToolCallForAction,
  upsertPendingToolCall,
} from "@app/hooks/useAgentMessageStream";
import type { AgentMCPActionWithOutputType } from "@app/types/actions";
import { describe, expect, it } from "vitest";

function makeAction(
  overrides: Partial<
    Pick<AgentMCPActionWithOutputType, "functionCallId" | "functionCallName">
  > = {}
): Pick<AgentMCPActionWithOutputType, "functionCallId" | "functionCallName"> {
  return {
    functionCallId: overrides.functionCallId ?? "call_123",
    functionCallName:
      overrides.functionCallName ?? "create_interactive_content_file",
  };
}

describe("upsertPendingToolCall", () => {
  it("merges a later update for the same call id", () => {
    const pendingToolCalls: PendingToolCall[] = [
      {
        toolName: "create_interactive_content_file",
        toolCallId: "call_123",
      },
    ];

    expect(
      upsertPendingToolCall(pendingToolCalls, {
        toolName: "create_interactive_content_file",
        toolCallId: "call_123",
        toolCallIndex: 0,
      })
    ).toEqual([
      {
        toolName: "create_interactive_content_file",
        toolCallId: "call_123",
        toolCallIndex: 0,
      },
    ]);
  });

  it("keeps distinct pending calls for the same tool name", () => {
    const pendingToolCalls: PendingToolCall[] = [
      {
        toolName: "create_interactive_content_file",
        toolCallIndex: 0,
      },
    ];

    expect(
      upsertPendingToolCall(pendingToolCalls, {
        toolName: "create_interactive_content_file",
        toolCallIndex: 1,
      })
    ).toEqual([
      {
        toolName: "create_interactive_content_file",
        toolCallIndex: 0,
      },
      {
        toolName: "create_interactive_content_file",
        toolCallIndex: 1,
      },
    ]);
  });
});

describe("removePendingToolCallForAction", () => {
  it("removes the matching pending call by function call id", () => {
    const pendingToolCalls: PendingToolCall[] = [
      {
        toolName: "create_interactive_content_file",
        toolCallId: "call_123",
      },
      {
        toolName: "common_utilities__wait",
        toolCallId: "call_456",
      },
    ];

    expect(
      removePendingToolCallForAction(pendingToolCalls, makeAction())
    ).toEqual([
      {
        toolName: "common_utilities__wait",
        toolCallId: "call_456",
      },
    ]);
  });

  it("falls back to the first matching tool name when no call id is available", () => {
    const pendingToolCalls: PendingToolCall[] = [
      {
        toolName: "create_interactive_content_file",
        toolCallIndex: 0,
      },
      {
        toolName: "create_interactive_content_file",
        toolCallIndex: 1,
      },
    ];

    expect(
      removePendingToolCallForAction(
        pendingToolCalls,
        makeAction({ functionCallId: "call_999" })
      )
    ).toEqual([
      {
        toolName: "create_interactive_content_file",
        toolCallIndex: 1,
      },
    ]);
  });
});
