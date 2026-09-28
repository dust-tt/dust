import {
  makeInitialMessageStreamState,
  reconcileAgentMessage,
  reconcileCachedAgentMessage,
} from "@app/components/assistant/conversation/types";
import { mockAgentMessage } from "@app/tests/utils/conversation_test_factories";
import type { LightAgentMessageWithActionsType } from "@app/types/assistant/conversation";
import { describe, expect, it } from "vitest";

function makeAgentMessage(
  overrides: Partial<LightAgentMessageWithActionsType> = {}
): LightAgentMessageWithActionsType {
  const { feedback: _feedback, ...message } = mockAgentMessage({
    content: null,
  });

  return { ...message, ...overrides };
}

describe("reconcileAgentMessage", () => {
  it("replaces the previous answer with a newer retry", () => {
    const previous = makeInitialMessageStreamState(
      makeAgentMessage({
        sId: "message-v0",
        version: 0,
        status: "succeeded",
        content: "Previous answer",
      })
    );
    const retry = makeInitialMessageStreamState(
      makeAgentMessage({
        sId: "message-v1",
        version: 1,
        status: "created",
      })
    );

    expect(reconcileAgentMessage(previous, retry)).toBe(retry);
  });

  it("does not erase live tokens with an initial snapshot", () => {
    const initial = makeInitialMessageStreamState(
      makeAgentMessage({ sId: "message-v1", version: 1, status: "created" })
    );
    const streaming = {
      ...initial,
      content: "Streaming answer",
      streaming: { ...initial.streaming, agentState: "writing" as const },
    };

    expect(reconcileAgentMessage(streaming, initial)).toBe(streaming);
  });

  it("does not erase live thinking steps with a partial nonterminal snapshot", () => {
    const initial = makeInitialMessageStreamState(
      makeAgentMessage({ sId: "message-v1", version: 1, status: "created" })
    );
    const thinkingStep = {
      type: "thinking" as const,
      content: "Reasoning before the tool.",
      id: "thinking-toolparams-1-0",
      step: 0,
    };
    const streaming = {
      ...initial,
      streaming: {
        ...initial.streaming,
        inlineActivitySteps: [thinkingStep],
      },
    };
    const partialSnapshot = makeInitialMessageStreamState(
      makeAgentMessage({
        sId: "message-v1",
        version: 1,
        status: "created",
        chainOfThought: "Partial persisted reasoning",
        activitySteps: [],
      })
    );

    expect(reconcileAgentMessage(streaming, partialSnapshot)).toBe(streaming);
  });

  it("accepts a newer partial snapshot before inline steps accumulate", () => {
    const earlier = makeInitialMessageStreamState(
      makeAgentMessage({
        sId: "message-v1",
        version: 1,
        status: "created",
        content: "Earlier partial answer",
      })
    );
    const later = makeInitialMessageStreamState(
      makeAgentMessage({
        sId: "message-v1",
        version: 1,
        status: "created",
        content: "Later partial answer",
      })
    );

    expect(reconcileAgentMessage(earlier, later)).toBe(later);
  });

  it("replaces live state when the same message has a newer version", () => {
    const initial = makeInitialMessageStreamState(
      makeAgentMessage({ sId: "message-v1", version: 1, status: "created" })
    );
    const streaming = {
      ...initial,
      streaming: {
        ...initial.streaming,
        inlineActivitySteps: [
          {
            type: "thinking" as const,
            content: "Reasoning from version 1",
            id: "thinking-toolparams-1-0",
            step: 0,
          },
        ],
      },
    };
    const retry = makeInitialMessageStreamState(
      makeAgentMessage({ sId: "message-v1", version: 2, status: "created" })
    );

    expect(reconcileAgentMessage(streaming, retry)).toBe(retry);
  });

  it("replaces live state with the terminal snapshot", () => {
    const initial = makeInitialMessageStreamState(
      makeAgentMessage({ sId: "message-v1", version: 1, status: "created" })
    );
    const streaming = {
      ...initial,
      content: "Streaming answer",
      streaming: { ...initial.streaming, agentState: "writing" as const },
    };
    const terminal = makeInitialMessageStreamState(
      makeAgentMessage({
        sId: "message-v1",
        version: 1,
        status: "succeeded",
        content: "Final answer",
      })
    );

    expect(reconcileAgentMessage(streaming, terminal)).toBe(terminal);
  });
});

describe("reconcileCachedAgentMessage", () => {
  it("keeps the retried version in cache across a remount", () => {
    const previous = makeAgentMessage({
      sId: "message-v0",
      version: 0,
      status: "succeeded",
      content: "Previous answer",
    });
    const retry = makeAgentMessage({
      sId: "message-v1",
      version: 1,
      status: "created",
    });

    expect(reconcileCachedAgentMessage(previous, retry)).toBe(retry);
    expect(reconcileCachedAgentMessage(retry, previous)).toBe(retry);
  });

  it("does not replace a terminal cache entry with its initial snapshot", () => {
    const terminal = makeAgentMessage({
      sId: "message-v1",
      version: 1,
      status: "succeeded",
      content: "Final answer",
    });
    const initial = makeAgentMessage({
      sId: "message-v1",
      version: 1,
      status: "created",
    });

    expect(reconcileCachedAgentMessage(terminal, initial)).toBe(terminal);
  });
});
