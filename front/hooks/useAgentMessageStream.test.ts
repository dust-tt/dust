import type { PendingToolCall } from "@app/components/assistant/conversation/types";
import {
  removePendingToolCall,
  upsertPendingToolCall,
} from "@app/hooks/useAgentMessageStream";
import type { AgentMCPActionWithOutputType } from "@app/types/actions";
import { describe, expect, it } from "vitest";

function createActionIdentity({
  functionCallId,
  functionCallName,
}: {
  functionCallId: string;
  functionCallName: string;
}) {
  return {
    functionCallId,
    functionCallName,
  } satisfies Pick<
    AgentMCPActionWithOutputType,
    "functionCallId" | "functionCallName"
  >;
}

describe("useAgentMessageStream pending tool calls", () => {
  it("should merge a pending tool call when the call id arrives later", () => {
    const initialPendingToolCalls = upsertPendingToolCall([], {
      toolCallIndex: 0,
      toolName: "create_interactive_content_file",
    });

    const pendingToolCalls = upsertPendingToolCall(initialPendingToolCalls, {
      toolCallId: "call_123",
      toolCallIndex: 0,
      toolName: "create_interactive_content_file",
    });

    expect(pendingToolCalls).toEqual<PendingToolCall[]>([
      {
        key: "tool-call-0",
        name: "create_interactive_content_file",
        toolCallId: "call_123",
        toolCallIndex: 0,
      },
    ]);
  });

  it("should remove only the matching pending tool call when an action starts", () => {
    const pendingToolCalls: PendingToolCall[] = [
      {
        key: "call_123",
        name: "create_interactive_content_file",
        toolCallId: "call_123",
      },
      {
        key: "call_456",
        name: "search_knowledge",
        toolCallId: "call_456",
      },
    ];

    expect(
      removePendingToolCall(
        pendingToolCalls,
        createActionIdentity({
          functionCallId: "call_123",
          functionCallName: "create_interactive_content_file",
        })
      )
    ).toEqual<PendingToolCall[]>([
      {
        key: "call_456",
        name: "search_knowledge",
        toolCallId: "call_456",
      },
    ]);
  });

  it("should fall back to a unique tool name when the pending tool call has no id yet", () => {
    const pendingToolCalls: PendingToolCall[] = [
      {
        key: "tool-call-0",
        name: "create_interactive_content_file",
        toolCallIndex: 0,
      },
    ];

    expect(
      removePendingToolCall(
        pendingToolCalls,
        createActionIdentity({
          functionCallId: "call_123",
          functionCallName: "create_interactive_content_file",
        })
      )
    ).toEqual<PendingToolCall[]>([]);
  });
});
