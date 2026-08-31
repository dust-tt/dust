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
const mockIsAutoScrollEnabledRef = { current: true };

function makeVirtuosoMethodsMock<T>(map: (updater: (message: T) => T) => T[]) {
  return {
    data: {
      map,
      batch: (callback: () => void) => {
        callback();
      },
    },
  };
}

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
    costCredits: null,
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
    resolvedModel: null,
    modelResolutionMethod: null,
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
  regionalModelsOnly: false,
  sharingPolicy: "workspace_only",
  metronomeCustomerId: null,
};

beforeEach(() => {
  mockUseEventSource.mockReset();
  mockMutateContextUsage.mockReset();
  mockUseVirtuosoMethods.mockReset();
  mockIsAutoScrollEnabledRef.current = true;
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
  it("appends a thinking step when none exists", () => {
    const steps: InlineActivityStep[] = [];
    expect(
      appendThinkingStep(steps, "Enable the toolset", "thinking-1", 0)
    ).toEqual([
      {
        type: "thinking",
        content: "Enable the toolset",
        id: "thinking-1",
        step: 0,
      },
    ]);
  });

  it("deduplicates when the same content is offered again", () => {
    const steps: InlineActivityStep[] = [
      { type: "thinking", content: "Enable the toolset", id: "thinking-1" },
    ];
    expect(
      appendThinkingStep(steps, "Enable the toolset", "thinking-2", 0)
    ).toBe(steps);
  });

  it("appends a new step when the content differs from the last thinking step", () => {
    const steps: InlineActivityStep[] = [
      { type: "thinking", content: "First attempt", id: "thinking-1" },
    ];
    expect(
      appendThinkingStep(steps, "Second attempt", "thinking-2", 1)
    ).toEqual([
      { type: "thinking", content: "First attempt", id: "thinking-1" },
      {
        type: "thinking",
        content: "Second attempt",
        id: "thinking-2",
        step: 1,
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

    mockUseVirtuosoMethods.mockReturnValue(
      makeVirtuosoMethodsMock(
        (
          updater: (message: typeof currentMessage) => typeof currentMessage
        ) => {
          currentMessage = updater(currentMessage);
          snapshots.push({
            content: currentMessage.content,
            chainOfThought: currentMessage.chainOfThought,
            agentState: currentMessage.streaming.agentState,
          });
          return [currentMessage];
        }
      )
    );

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
        isAutoScrollEnabledRef: mockIsAutoScrollEnabledRef,
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

    mockUseVirtuosoMethods.mockReturnValue(
      makeVirtuosoMethodsMock(
        (
          updater: (message: typeof currentMessage) => typeof currentMessage
        ) => {
          currentMessage = updater(currentMessage);
          return [currentMessage];
        }
      )
    );

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
        isAutoScrollEnabledRef: mockIsAutoScrollEnabledRef,
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
        step: 0,
      },
      {
        type: "action",
        label: "Search",
        id: `action-${action.id}`,
        actionId: action.sId,
        internalMCPServerName: action.internalMCPServerName,
        toolName: action.toolName ?? null,
        step: 0,
      },
    ]);
    expect(currentMessage.chainOfThought).toBe("");
  });

  it("flushes accumulated tokens as a content step at tokens→chain_of_thought transition", () => {
    let currentMessage = makeInitialMessageStreamState(
      makeLightAgentMessage({ content: null, chainOfThought: null })
    );
    let onEventCallback: ((event: string) => void) | null = null;

    mockUseVirtuosoMethods.mockReturnValue(
      makeVirtuosoMethodsMock(
        (
          updater: (message: typeof currentMessage) => typeof currentMessage
        ) => {
          currentMessage = updater(currentMessage);
          return [currentMessage];
        }
      )
    );

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
        isAutoScrollEnabledRef: mockIsAutoScrollEnabledRef,
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
            text: "I should enable the toolset.",
            classification: "chain_of_thought",
          },
        })
      );
    });

    // Scrolling up during thinking must survive the transition to answer content.
    mockIsAutoScrollEnabledRef.current = false;

    act(() => {
      onEventCallback!(
        JSON.stringify({
          eventId: "2-0",
          data: {
            type: "generation_tokens",
            created: Date.now(),
            configurationId: "agent_123",
            messageId: currentMessage.sId,
            text: "Enabling now.",
            classification: "tokens",
          },
        })
      );
      // tokens → chain_of_thought: the accumulated tokens text is flushed as a content step,
      // not discarded, because the model can legitimately interleave text and reasoning blocks.
      onEventCallback!(
        JSON.stringify({
          eventId: "3-0",
          data: {
            type: "generation_tokens",
            created: Date.now(),
            configurationId: "agent_123",
            messageId: currentMessage.sId,
            text: "I should enable the toolset.",
            classification: "chain_of_thought",
          },
        })
      );
    });

    // One thinking step (CoT→tokens flush) + one content step (tokens→CoT flush).
    expect(currentMessage.streaming.inlineActivitySteps).toEqual([
      {
        type: "thinking",
        content: "I should enable the toolset.",
        id: expect.stringContaining("thinking-pre-"),
      },
      {
        type: "content",
        content: "Enabling now.",
        id: expect.stringContaining("content-pre-"),
      },
    ]);
    expect(currentMessage.content).toBe("");
    expect(mockIsAutoScrollEnabledRef.current).toBe(false);
  });

  it("applies the server-rendered content view at success", () => {
    let currentMessage = makeInitialMessageStreamState(
      makeLightAgentMessage({ content: null, chainOfThought: null })
    );
    let onEventCallback: ((event: string) => void) | null = null;

    mockUseVirtuosoMethods.mockReturnValue(
      makeVirtuosoMethodsMock(
        (
          updater: (message: typeof currentMessage) => typeof currentMessage
        ) => {
          currentMessage = updater(currentMessage);
          return [currentMessage];
        }
      )
    );

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
        isAutoScrollEnabledRef: mockIsAutoScrollEnabledRef,
        owner: mockOwner,
        streamId: "stream_123",
      })
    );

    act(() => {
      // Some activity streamed live, but the final view is whatever the server
      // renders and ships on the terminal event; the client trusts it.
      onEventCallback!(
        JSON.stringify({
          eventId: "1-0",
          data: {
            type: "generation_tokens",
            created: Date.now(),
            configurationId: "agent_123",
            messageId: currentMessage.sId,
            text: "I should inspect the tool results first.",
            classification: "chain_of_thought",
          },
        })
      );
      onEventCallback!(
        JSON.stringify({
          eventId: "2-0",
          data: {
            type: "agent_message_success",
            created: Date.now(),
            configurationId: "agent_123",
            messageId: currentMessage.sId,
            message: {
              ...makeLightAgentMessage({
                content: "Here is the final answer from the model.",
                chainOfThought: "I should inspect the tool results first.",
              }),
              actions: [],
            },
            contentView: {
              content: "Here is the final answer from the model.",
              chainOfThought: "I should inspect the tool results first.",
              activitySteps: [
                {
                  type: "thinking",
                  content: "I should inspect the tool results first.",
                  id: "cot-0-0",
                },
              ],
            },
          },
        })
      );
    });

    expect(currentMessage.content).toBe(
      "Here is the final answer from the model."
    );
    expect(currentMessage.chainOfThought).toBe(
      "I should inspect the tool results first."
    );
    expect(currentMessage.streaming.agentState).toBe("done");
    expect(currentMessage.streaming.inlineActivitySteps).toEqual([
      {
        type: "thinking",
        content: "I should inspect the tool results first.",
        id: "cot-0-0",
      },
    ]);
  });

  it("collapses same-step Temporal retries to the final attempt", () => {
    let currentMessage = makeInitialMessageStreamState(
      makeLightAgentMessage({ content: null, chainOfThought: null })
    );
    let onEventCallback: ((event: string) => void) | null = null;

    mockUseVirtuosoMethods.mockReturnValue(
      makeVirtuosoMethodsMock(
        (
          updater: (message: typeof currentMessage) => typeof currentMessage
        ) => {
          currentMessage = updater(currentMessage);
          return [currentMessage];
        }
      )
    );

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
        isAutoScrollEnabledRef: mockIsAutoScrollEnabledRef,
        owner: mockOwner,
        streamId: "stream_123",
      })
    );

    const action = makeStreamAction();

    act(() => {
      // Retry 1: CoT → tokens → retry fails (traceId=attempt-1). The CoT is
      // flushed as a thinking step at the CoT→tokens transition.
      onEventCallback!(
        JSON.stringify({
          eventId: "1-0",
          data: {
            type: "generation_tokens",
            created: Date.now(),
            configurationId: "agent_123",
            messageId: currentMessage.sId,
            text: "I need to enable the toolset first.",
            classification: "chain_of_thought",
            traceId: "attempt-1",
            step: 0,
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
            text: "Enabling now.",
            classification: "tokens",
            step: 0,
          },
        })
      );
      // Retry 2: same step re-runs with a fresh traceId. The already-flushed
      // step-0 thinking step is dropped, and stale tokens ("Enabling now.") are
      // discarded before they can become a content step.
      onEventCallback!(
        JSON.stringify({
          eventId: "3-0",
          data: {
            type: "generation_tokens",
            created: Date.now(),
            configurationId: "agent_123",
            messageId: currentMessage.sId,
            text: "I should enable the Create Files toolset.",
            classification: "chain_of_thought",
            traceId: "attempt-2",
            step: 0,
          },
        })
      );
      onEventCallback!(
        JSON.stringify({
          eventId: "4-0",
          data: {
            type: "generation_tokens",
            created: Date.now(),
            configurationId: "agent_123",
            messageId: currentMessage.sId,
            text: "Let me enable it.",
            classification: "tokens",
            step: 0,
          },
        })
      );
      // Retry 3: final CoT → tool_params succeeds (traceId=attempt-3). Drops the
      // step-0 thinking step from retry 2 and rebuilds it from this attempt.
      onEventCallback!(
        JSON.stringify({
          eventId: "5-0",
          data: {
            type: "generation_tokens",
            created: Date.now(),
            configurationId: "agent_123",
            messageId: currentMessage.sId,
            text: "I need to enable the Create Files toolset first.",
            classification: "chain_of_thought",
            traceId: "attempt-3",
            step: 0,
          },
        })
      );
      onEventCallback!(
        JSON.stringify({
          eventId: "6-0",
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
    });

    // All three attempts are the same step (Temporal retries), so only the final
    // attempt's thinking step survives — the earlier ones are dropped instead of
    // flooding the timeline with duplicates (the ticket-9287 bug).
    expect(currentMessage.streaming.inlineActivitySteps).toEqual([
      {
        type: "thinking",
        content: "I need to enable the Create Files toolset first.",
        id: expect.stringContaining("thinking-toolparams-"),
        step: 0,
      },
    ]);
  });

  it("keeps earlier completed steps when a later step is retried", () => {
    let currentMessage = makeInitialMessageStreamState(
      makeLightAgentMessage({ content: null, chainOfThought: null })
    );
    let onEventCallback: ((event: string) => void) | null = null;

    mockUseVirtuosoMethods.mockReturnValue(
      makeVirtuosoMethodsMock(
        (
          updater: (message: typeof currentMessage) => typeof currentMessage
        ) => {
          currentMessage = updater(currentMessage);
          return [currentMessage];
        }
      )
    );

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
        isAutoScrollEnabledRef: mockIsAutoScrollEnabledRef,
        owner: mockOwner,
        streamId: "stream_123",
      })
    );

    const action0 = makeStreamAction({ id: 20, sId: "act_0" });

    act(() => {
      // Step 0: CoT → tool_params → action success. Fully committed.
      onEventCallback!(
        JSON.stringify({
          eventId: "1-0",
          data: {
            type: "generation_tokens",
            created: Date.now(),
            configurationId: "agent_123",
            messageId: currentMessage.sId,
            text: "First I search the web.",
            classification: "chain_of_thought",
            traceId: "step0-trace",
            step: 0,
          },
        })
      );
      onEventCallback!(
        JSON.stringify({
          eventId: "2-0",
          data: {
            type: "tool_params",
            created: Date.now(),
            configurationId: "agent_123",
            messageId: currentMessage.sId,
            action: action0,
            runIds: ["llm_trace_0"],
            step: 0,
          },
        })
      );
      onEventCallback!(
        JSON.stringify({
          eventId: "3-0",
          data: {
            type: "agent_action_success",
            created: Date.now(),
            configurationId: "agent_123",
            messageId: currentMessage.sId,
            action: { ...action0, status: "succeeded", executionDurationMs: 1 },
            step: 0,
          },
        })
      );
      // Step 1 attempt 1: CoT flushed, then the activity retries.
      onEventCallback!(
        JSON.stringify({
          eventId: "4-0",
          data: {
            type: "generation_tokens",
            created: Date.now(),
            configurationId: "agent_123",
            messageId: currentMessage.sId,
            text: "Stale step-1 reasoning.",
            classification: "chain_of_thought",
            traceId: "step1-attempt-1",
            step: 1,
          },
        })
      );
      onEventCallback!(
        JSON.stringify({
          eventId: "5-0",
          data: {
            type: "generation_tokens",
            created: Date.now(),
            configurationId: "agent_123",
            messageId: currentMessage.sId,
            text: "writing",
            classification: "tokens",
            step: 1,
          },
        })
      );
      // Step 1 attempt 2: fresh traceId, same step → drop only step-1 work.
      onEventCallback!(
        JSON.stringify({
          eventId: "6-0",
          data: {
            type: "generation_tokens",
            created: Date.now(),
            configurationId: "agent_123",
            messageId: currentMessage.sId,
            text: "Final step-1 reasoning.",
            classification: "chain_of_thought",
            traceId: "step1-attempt-2",
            step: 1,
          },
        })
      );
      onEventCallback!(
        JSON.stringify({
          eventId: "7-0",
          data: {
            type: "generation_tokens",
            created: Date.now(),
            configurationId: "agent_123",
            messageId: currentMessage.sId,
            text: "done writing",
            classification: "tokens",
            step: 1,
          },
        })
      );
    });

    // Step 0's thinking + action survive; only step 1's final attempt remains.
    expect(currentMessage.streaming.inlineActivitySteps).toEqual([
      {
        type: "thinking",
        content: "First I search the web.",
        id: expect.stringContaining("thinking-toolparams-"),
        step: 0,
      },
      {
        type: "action",
        label: "Search",
        id: `action-${action0.id}`,
        actionId: action0.sId,
        internalMCPServerName: action0.internalMCPServerName,
        toolName: action0.toolName ?? null,
        step: 0,
      },
      {
        type: "thinking",
        content: "Final step-1 reasoning.",
        id: expect.stringContaining("thinking-pre-"),
        step: 1,
      },
    ]);
  });

  it("does not re-append steps when the message remounts and replays history", () => {
    let currentMessage = makeInitialMessageStreamState(
      makeLightAgentMessage({ content: null, chainOfThought: null })
    );
    let onEventCallback: ((event: string) => void) | null = null;

    mockUseVirtuosoMethods.mockReturnValue(
      makeVirtuosoMethodsMock(
        (
          updater: (message: typeof currentMessage) => typeof currentMessage
        ) => {
          currentMessage = updater(currentMessage);
          return [currentMessage];
        }
      )
    );
    mockUseEventSource.mockImplementation(
      (
        _buildURL: unknown,
        callback: (event: string) => void
      ): { isError: null } => {
        onEventCallback = callback;
        return { isError: null };
      }
    );

    const mountHook = () =>
      renderHook(() =>
        useAgentMessageStream({
          agentMessage: currentMessage,
          conversationId: "conv_123",
          isAutoScrollEnabledRef: mockIsAutoScrollEnabledRef,
          owner: mockOwner,
          streamId: "stream_123",
        })
      );

    // The history the server replays on every (re)connect: step 0 CoT → tool.
    const history = [
      {
        eventId: "1-0",
        data: {
          type: "generation_tokens",
          created: Date.now(),
          configurationId: "agent_123",
          messageId: currentMessage.sId,
          text: "Reasoning about step 0.",
          classification: "chain_of_thought",
          traceId: "t0",
          step: 0,
        },
      },
      {
        eventId: "2-0",
        data: {
          type: "tool_params",
          created: Date.now(),
          configurationId: "agent_123",
          messageId: currentMessage.sId,
          action: makeStreamAction({ id: 1, sId: "act_1" }),
          runIds: [],
          step: 0,
        },
      },
    ];

    const { unmount } = mountHook();
    act(() => history.forEach((e) => onEventCallback!(JSON.stringify(e))));

    const stepsAfterFirstMount =
      currentMessage.streaming.inlineActivitySteps.length;
    expect(stepsAfterFirstMount).toBeGreaterThan(0);

    // Simulate a Virtuoso remount: unmount, mount a fresh hook instance for the
    // same message (its steps persist in currentMessage), and replay the same
    // history the server resends on reconnect.
    unmount();
    mountHook();
    act(() => history.forEach((e) => onEventCallback!(JSON.stringify(e))));

    expect(currentMessage.streaming.inlineActivitySteps.length).toBe(
      stepsAfterFirstMount
    );
  });

  it("commits the active CoT when tool_params arrives right after a remount", () => {
    // Regression: after a remount the parser refs (lastClassification, ...) are
    // reset. The replay must re-run so a live tool_params still flushes the
    // in-progress CoT into a step instead of dropping it.
    let currentMessage = makeInitialMessageStreamState(
      makeLightAgentMessage({ content: null, chainOfThought: null })
    );
    let onEventCallback: ((event: string) => void) | null = null;

    mockUseVirtuosoMethods.mockReturnValue(
      makeVirtuosoMethodsMock(
        (
          updater: (message: typeof currentMessage) => typeof currentMessage
        ) => {
          currentMessage = updater(currentMessage);
          return [currentMessage];
        }
      )
    );
    mockUseEventSource.mockImplementation(
      (
        _buildURL: unknown,
        callback: (event: string) => void
      ): { isError: null } => {
        onEventCallback = callback;
        return { isError: null };
      }
    );

    const mountHook = () =>
      renderHook(() =>
        useAgentMessageStream({
          agentMessage: currentMessage,
          conversationId: "conv_123",
          isAutoScrollEnabledRef: mockIsAutoScrollEnabledRef,
          owner: mockOwner,
          streamId: "stream_123",
        })
      );

    const cotEvent = {
      eventId: "1-0",
      data: {
        type: "generation_tokens",
        created: Date.now(),
        configurationId: "agent_123",
        messageId: currentMessage.sId,
        text: "Reasoning before the tool.",
        classification: "chain_of_thought",
        traceId: "t0",
        step: 0,
      },
    };
    const toolParamsEvent = {
      eventId: "2-0",
      data: {
        type: "tool_params",
        created: Date.now(),
        configurationId: "agent_123",
        messageId: currentMessage.sId,
        action: makeStreamAction({ id: 1, sId: "act_1" }),
        runIds: [],
        step: 0,
      },
    };

    // First mount: only the CoT arrives — it stays active, not yet flushed.
    const { unmount } = mountHook();
    act(() => onEventCallback!(JSON.stringify(cotEvent)));
    expect(currentMessage.streaming.inlineActivitySteps).toHaveLength(0);

    // Remount: the server replays the CoT (rebuilding parser state), then the
    // live tool_params flushes it.
    unmount();
    mountHook();
    act(() => {
      onEventCallback!(JSON.stringify(cotEvent));
      onEventCallback!(JSON.stringify(toolParamsEvent));
    });

    expect(currentMessage.streaming.inlineActivitySteps).toEqual([
      {
        type: "thinking",
        content: "Reasoning before the tool.",
        id: expect.stringContaining("thinking-toolparams-"),
        step: 0,
      },
    ]);
  });

  it("suppresses the re-stream when a Temporal retry produces identical CoT mid-stream", () => {
    // This test covers the case where an activity fails mid-CoT (no flush
    // between retries). The shadow buffer suppresses the re-stream so the
    // user never sees the thinking bubble go blank and refill.
    let currentMessage = makeInitialMessageStreamState(
      makeLightAgentMessage({ content: null, chainOfThought: null })
    );
    const chainOfThoughtSnapshots: string[] = [];
    let onEventCallback: ((event: string) => void) | null = null;

    mockUseVirtuosoMethods.mockReturnValue(
      makeVirtuosoMethodsMock(
        (
          updater: (message: typeof currentMessage) => typeof currentMessage
        ) => {
          currentMessage = updater(currentMessage);
          if (currentMessage.chainOfThought !== null) {
            chainOfThoughtSnapshots.push(currentMessage.chainOfThought);
          }
          return [currentMessage];
        }
      )
    );

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
        isAutoScrollEnabledRef: mockIsAutoScrollEnabledRef,
        owner: mockOwner,
        streamId: "stream_123",
      })
    );

    act(() => {
      // Retry 1: partial CoT (activity fails mid-stream, no flush)
      onEventCallback!(
        JSON.stringify({
          eventId: "1-0",
          data: {
            type: "generation_tokens",
            created: Date.now(),
            configurationId: "agent_123",
            messageId: currentMessage.sId,
            text: "I need to search the web.",
            classification: "chain_of_thought",
            traceId: "attempt-1",
            step: 0,
          },
        })
      );
      // Retry 2: identical CoT restarts from the beginning (new traceId).
      // The shadow buffer suppresses updates while tokens match what's shown.
      onEventCallback!(
        JSON.stringify({
          eventId: "2-0",
          data: {
            type: "generation_tokens",
            created: Date.now(),
            configurationId: "agent_123",
            messageId: currentMessage.sId,
            text: "I need to search the web.",
            classification: "chain_of_thought",
            traceId: "attempt-2",
            step: 0,
          },
        })
      );
      // Retry 2 completes successfully; the terminal event carries the
      // server-rendered view, which the client trusts for the final timeline.
      onEventCallback!(
        JSON.stringify({
          eventId: "3-0",
          data: {
            type: "agent_message_success",
            created: Date.now(),
            configurationId: "agent_123",
            messageId: currentMessage.sId,
            message: {
              ...makeLightAgentMessage({
                content: null,
                chainOfThought: "I need to search the web.",
              }),
              actions: [],
            },
            contentView: {
              content: null,
              chainOfThought: "I need to search the web.",
              activitySteps: [
                {
                  type: "thinking",
                  content: "I need to search the web.",
                  id: "cot-0-0",
                },
              ],
            },
          },
        })
      );
    });

    // chainOfThought never went blank — no empty string between the two runs.
    expect(chainOfThoughtSnapshots).not.toContain("");
    // Final timeline comes from the server-rendered content view.
    expect(currentMessage.streaming.inlineActivitySteps).toEqual([
      {
        type: "thinking",
        content: "I need to search the web.",
        id: "cot-0-0",
      },
    ]);
  });
});
