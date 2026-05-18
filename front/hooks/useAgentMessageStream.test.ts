import type { PendingToolCall } from "@app/components/assistant/conversation/types";
import { makeInitialMessageStreamState } from "@app/components/assistant/conversation/types";
import {
  appendThinkingStep,
  removePendingToolCallForAction,
  upsertPendingToolCall,
  useAgentMessageStream,
} from "@app/hooks/useAgentMessageStream";
import type { AgentMCPActionWithOutputType } from "@app/types/actions";
import type {
  InlineActivityStep,
  LightAgentMessageType,
} from "@app/types/assistant/conversation";
import type { LightWorkspaceType } from "@app/types/user";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockUseEventSource = vi.fn();
const mockMutateContextUsage = vi.fn();
const mockUseVirtuosoMethods = vi.fn();

vi.mock("@app/hooks/useEventSource", () => ({
  useEventSource: (...args: unknown[]) => mockUseEventSource(...args),
}));

vi.mock("@app/hooks/conversations", () => ({
  useConversationContextUsage: () => ({
    mutateContextUsage: mockMutateContextUsage,
  }),
}));

vi.mock("@virtuoso.dev/message-list", () => ({
  useVirtuosoMethods: () => mockUseVirtuosoMethods(),
}));

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

function makeStreamAction(
  overrides: Partial<AgentMCPActionWithOutputType> = {}
): AgentMCPActionWithOutputType {
  return {
    id: overrides.id ?? 20,
    sId: overrides.sId ?? "act_123",
    createdAt: overrides.createdAt ?? Date.now(),
    updatedAt: overrides.updatedAt ?? Date.now(),
    agentMessageId: overrides.agentMessageId ?? 11,
    internalMCPServerName: overrides.internalMCPServerName ?? null,
    toolName: overrides.toolName ?? "websearch",
    mcpServerId: overrides.mcpServerId ?? "ims_123",
    functionCallName:
      overrides.functionCallName ?? "web_search_browse__websearch",
    functionCallId: overrides.functionCallId ?? "toolu_123",
    params: overrides.params ?? { query: "major world news events April 2026" },
    citationsAllocated: overrides.citationsAllocated ?? 0,
    status: overrides.status ?? "ready_allowed_implicitly",
    step: overrides.step ?? 0,
    executionDurationMs: overrides.executionDurationMs ?? null,
    displayLabels: overrides.displayLabels ?? {
      running: "Searching",
      done: "Search",
    },
    generatedFiles: overrides.generatedFiles ?? [],
    output: overrides.output ?? null,
    citations: overrides.citations ?? null,
  };
}

function makeLightAgentMessage(
  overrides: Partial<LightAgentMessageType> = {}
): LightAgentMessageType {
  return {
    type: "agent_message",
    sId: "msg_123",
    version: 0,
    rank: 0,
    branchId: null,
    created: Date.now(),
    completedTs: null,
    parentMessageId: "parent_msg_123",
    parentAgentMessageId: null,
    status: "created",
    content: "Hello world from the database",
    chainOfThought: "Thinking from the database",
    error: null,
    visibility: "visible",
    richMentions: [],
    completionDurationMs: null,
    reactions: [],
    configuration: {
      sId: "agent_123",
      name: "dust",
      pictureUrl: "",
      status: "active",
      canRead: true,
    },
    citations: {},
    generatedFiles: [],
    activitySteps: [],
    ...overrides,
  };
}

const mockOwner: LightWorkspaceType = {
  id: 1,
  sId: "w_test",
  name: "Test Workspace",
  role: "admin",
  segmentation: null,
  whiteListedProviders: null,
  defaultEmbeddingProvider: null,
  sharingPolicy: "workspace_only",
  metronomeCustomerId: null,
};

beforeEach(() => {
  mockUseEventSource.mockReset();
  mockMutateContextUsage.mockReset();
  mockUseVirtuosoMethods.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

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
        toolName: null,
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

describe("useAgentMessageStream", () => {
  it("clears stale database content before replaying fresh-mount tokens", () => {
    let currentMessage = makeInitialMessageStreamState(makeLightAgentMessage());
    const snapshots: Array<{
      content: string | null;
      chainOfThought: string | null;
      agentState: string;
    }> = [];
    let onEventCallback: ((event: string) => void) | null = null;

    mockUseVirtuosoMethods.mockReturnValue({
      data: {
        map: (
          updater: (message: typeof currentMessage) => typeof currentMessage
        ) => {
          currentMessage = updater(currentMessage);
          snapshots.push({
            content: currentMessage.content,
            chainOfThought: currentMessage.chainOfThought,
            agentState: currentMessage.streaming.agentState,
          });
          return [currentMessage];
        },
      },
    });

    mockUseEventSource.mockImplementation(
      (
        _buildURL: unknown,
        callback: (event: string) => void
      ): { isError: null } => {
        onEventCallback = callback;
        return { isError: null };
      }
    );

    renderHook(() =>
      useAgentMessageStream({
        agentMessage: currentMessage,
        conversationId: "conv_123",
        owner: mockOwner,
        streamId: "stream_123",
      })
    );

    act(() => {
      onEventCallback!(
        JSON.stringify({
          eventId: "1-0",
          data: {
            type: "generation_tokens",
            created: Date.now(),
            configurationId: "agent_123",
            messageId: currentMessage.sId,
            text: "Hello ",
            classification: "tokens",
          },
        })
      );
    });

    expect(snapshots[0]).toEqual({
      content: "",
      chainOfThought: "",
      agentState: "thinking",
    });
    expect(currentMessage.content).toBe("Hello ");
    expect(currentMessage.chainOfThought).toBe("");
  });

  it("does not restore stale thinking text from a pending throttled update after tool_params", () => {
    vi.useFakeTimers();

    let currentMessage = makeInitialMessageStreamState(
      makeLightAgentMessage({
        content: null,
        chainOfThought: null,
      })
    );
    let onEventCallback: ((event: string) => void) | null = null;

    mockUseVirtuosoMethods.mockReturnValue({
      data: {
        map: (
          updater: (message: typeof currentMessage) => typeof currentMessage
        ) => {
          currentMessage = updater(currentMessage);
          return [currentMessage];
        },
      },
    });

    mockUseEventSource.mockImplementation(
      (
        _buildURL: unknown,
        callback: (event: string) => void
      ): { isError: null } => {
        onEventCallback = callback;
        return { isError: null };
      }
    );

    renderHook(() =>
      useAgentMessageStream({
        agentMessage: currentMessage,
        conversationId: "conv_123",
        owner: mockOwner,
        streamId: "stream_123",
      })
    );

    const action = makeStreamAction();

    act(() => {
      onEventCallback!(
        JSON.stringify({
          eventId: "1-0",
          data: {
            type: "generation_tokens",
            created: Date.now(),
            configurationId: "agent_123",
            messageId: currentMessage.sId,
            text: "The user wants recent world events.",
            classification: "chain_of_thought",
          },
        })
      );
      onEventCallback!(
        JSON.stringify({
          eventId: "2-0",
          data: {
            type: "generation_tokens",
            created: Date.now(),
            configurationId: "agent_123",
            messageId: currentMessage.sId,
            text: " Let me search the web for this.",
            classification: "chain_of_thought",
          },
        })
      );
      onEventCallback!(
        JSON.stringify({
          eventId: "3-0",
          data: {
            type: "tool_params",
            created: Date.now(),
            configurationId: "agent_123",
            messageId: currentMessage.sId,
            action,
            runIds: ["llm_trace_123"],
            step: 0,
          },
        })
      );
      onEventCallback!(
        JSON.stringify({
          eventId: "4-0",
          data: {
            type: "agent_action_success",
            created: Date.now(),
            configurationId: "agent_123",
            messageId: currentMessage.sId,
            action: {
              ...action,
              status: "succeeded",
              executionDurationMs: 1000,
            },
            step: 0,
          },
        })
      );
      vi.advanceTimersByTime(150);
    });

    expect(currentMessage.streaming.inlineActivitySteps).toEqual([
      {
        type: "thinking",
        content:
          "The user wants recent world events. Let me search the web for this.",
        id: expect.stringContaining("thinking-toolparams-"),
      },
      {
        type: "action",
        label: "Search",
        id: `action-${action.id}`,
        actionId: action.sId,
        internalMCPServerName: action.internalMCPServerName,
        toolName: action.toolName ?? null,
      },
    ]);
    expect(currentMessage.chainOfThought).toBe("");
  });
});
