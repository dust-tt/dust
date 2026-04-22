import type { PendingToolCall } from "@app/components/assistant/conversation/types";
import {
  appendThinkingStep,
  removePendingToolCallForAction,
  upsertPendingToolCall,
} from "@app/hooks/useAgentMessageStream";
import type { AgentMCPActionWithOutputType } from "@app/types/actions";
import type { InlineActivityStep } from "@app/types/assistant/conversation";
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

describe("appendThinkingStep", () => {
  it("deduplicates replayed thinking content even when an action step is in between", () => {
    const steps: InlineActivityStep[] = [
      {
        type: "thinking",
        content: "Looking up the repository state",
        id: "thinking-1",
      },
      {
        type: "action",
        label: "Listed files",
        id: "action-1",
        actionId: "act_1",
        internalMCPServerName: null,
      },
    ];

    expect(
      appendThinkingStep(
        steps,
        "Looking up the repository state",
        "thinking-replayed"
      )
    ).toEqual(steps);
  });

  it("appends distinct thinking content", () => {
    const steps: InlineActivityStep[] = [
      {
        type: "thinking",
        content: "Inspecting the request",
        id: "thinking-1",
      },
    ];

    expect(
      appendThinkingStep(steps, "Planning the patch", "thinking-2")
    ).toEqual([
      ...steps,
      {
        type: "thinking",
        content: "Planning the patch",
        id: "thinking-2",
      },
    ]);
  });
});
