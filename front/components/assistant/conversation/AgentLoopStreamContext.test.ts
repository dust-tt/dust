import {
  AgentLoopStreamContext,
  isAgentLoopStreamActive,
  useRegisterAgentLoopStream,
} from "@app/components/assistant/conversation/AgentLoopStreamContext";
import type { EventSourceConnectionState } from "@app/types/event_source";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isAgentLoopStreamActive", () => {
  it.each<EventSourceConnectionState>([
    { kind: "connecting", attempt: 1, startedAt: 1 },
    { kind: "long_polling", startedAt: 1 },
    { kind: "open", openedAt: 1 },
    { kind: "reconnecting", attempt: 1, reconnectAt: 1 },
  ])("treats $kind as streaming", (state) => {
    expect(isAgentLoopStreamActive(state)).toBe(true);
  });

  it.each<EventSourceConnectionState>([
    { kind: "failed", attempt: 1, error: new Error("failed") },
    { kind: "idle" },
    { kind: "terminal" },
  ])("treats $kind as inactive", (state) => {
    expect(isAgentLoopStreamActive(state)).toBe(false);
  });
});

describe("useRegisterAgentLoopStream", () => {
  it("registers a mounted stream until it stops or unmounts", () => {
    const unregister = vi.fn();
    const registerStream = vi.fn(() => unregister);
    interface WrapperProps {
      children: ReactNode;
    }
    const contextValue = {
      conversationStreamIds: new Map(),
      registerStream,
    };
    const wrapper = ({ children }: WrapperProps) =>
      createElement(
        AgentLoopStreamContext.Provider,
        { value: contextValue },
        children
      );
    const { rerender } = renderHook(
      ({ enabled }) =>
        useRegisterAgentLoopStream({
          conversationId: "conversation-1",
          enabled,
          streamId: "message-1",
        }),
      { initialProps: { enabled: true }, wrapper }
    );

    expect(registerStream).toHaveBeenCalledWith("conversation-1", "message-1");

    rerender({ enabled: false });

    expect(unregister).toHaveBeenCalledOnce();
  });
});
