import { isAgentLoopStreamActive } from "@app/components/assistant/conversation/AgentLoopStreamContext";
import type { EventSourceConnectionState } from "@app/types/event_source";
import { describe, expect, it } from "vitest";

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
