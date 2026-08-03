import { useChildAgentStream } from "@app/hooks/useChildAgentStream";
import type { LightWorkspaceType } from "@app/types/user";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseEventSource = vi.fn();

vi.mock("@app/hooks/useEventSource", () => ({
  useEventSource: (...args: unknown[]) => mockUseEventSource(...args),
}));

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

const childStreamIds = {
  conversationId: "child_conv_123",
  agentMessageId: "child_msg_123",
};

// Renders the hook and returns `{ result, emit }`, where `emit` dispatches a raw
// child-stream event (the same JSON the SSE endpoint sends).
function renderChildStream() {
  let onEventCallback: ((event: string) => void) | null = null;
  mockUseEventSource.mockImplementation(
    (_buildURL: unknown, callback: (event: string) => void) => {
      onEventCallback = callback;
    }
  );

  const { result } = renderHook(() =>
    useChildAgentStream({ childStreamIds, owner: mockOwner, disabled: false })
  );

  const emit = (data: unknown) => {
    act(() => {
      onEventCallback!(JSON.stringify({ eventId: "1-0", data }));
    });
  };

  return { result, emit };
}

describe("useChildAgentStream", () => {
  beforeEach(() => {
    mockUseEventSource.mockReset();
  });

  it("trusts the server-rendered content view at the terminal event", () => {
    const { result, emit } = renderChildStream();

    // Some CoT streamed live before the terminal event.
    emit({
      type: "generation_tokens",
      created: Date.now(),
      configurationId: "agent_123",
      messageId: childStreamIds.agentMessageId,
      text: "Let me think.",
      classification: "chain_of_thought",
    });

    emit({
      type: "agent_message_success",
      created: Date.now(),
      configurationId: "agent_123",
      messageId: childStreamIds.agentMessageId,
      message: { content: "all text concatenated body", actions: [] },
      contentView: {
        content: "The final answer.",
        chainOfThought: "Let me think.",
        activitySteps: [
          { type: "thinking", content: "Let me think.", id: "cot-0-0" },
        ],
      },
    });

    expect(result.current.isDone).toBe(true);
    // Body comes from the content view, not the message's all-text content.
    expect(result.current.response).toBe("The final answer.");
    expect(result.current.inlineActivitySteps).toEqual([
      { type: "thinking", content: "Let me think.", id: "cot-0-0" },
    ]);
  });

  it("falls back to flushing the CoT buffer when the content view is absent", () => {
    const { result, emit } = renderChildStream();

    emit({
      type: "generation_tokens",
      created: Date.now(),
      configurationId: "agent_123",
      messageId: childStreamIds.agentMessageId,
      text: "Thinking from the stream.",
      classification: "chain_of_thought",
    });

    // Older server: no contentView on the terminal event.
    emit({
      type: "agent_message_success",
      created: Date.now(),
      configurationId: "agent_123",
      messageId: childStreamIds.agentMessageId,
      message: { content: "Body from the message.", actions: [] },
    });

    expect(result.current.isDone).toBe(true);
    expect(result.current.response).toBe("Body from the message.");
    expect(result.current.inlineActivitySteps).toEqual([
      {
        type: "thinking",
        content: "Thinking from the stream.",
        id: expect.stringContaining("thinking-final-"),
      },
    ]);
  });

  it("accumulates response tokens and flushes CoT to a thinking step at tool_params", () => {
    const { result, emit } = renderChildStream();

    emit({
      type: "generation_tokens",
      created: Date.now(),
      configurationId: "agent_123",
      messageId: childStreamIds.agentMessageId,
      text: "Hello ",
      classification: "tokens",
    });
    emit({
      type: "generation_tokens",
      created: Date.now(),
      configurationId: "agent_123",
      messageId: childStreamIds.agentMessageId,
      text: "I should search.",
      classification: "chain_of_thought",
    });
    emit({
      type: "tool_params",
      created: Date.now(),
      configurationId: "agent_123",
      messageId: childStreamIds.agentMessageId,
    });

    expect(result.current.response).toBe("Hello ");
    expect(result.current.inlineActivitySteps).toEqual([
      {
        type: "thinking",
        content: "I should search.",
        id: expect.stringContaining("thinking-"),
      },
    ]);
    // CoT buffer flushed, no longer active.
    expect(result.current.activeCotContent).toBe("");
  });
});
