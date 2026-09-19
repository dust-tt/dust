import type {
  Event as PolyfillEvent,
  MessageEvent as PolyfillMessageEvent,
} from "event-source-polyfill";
import { beforeEach, describe, expect, it, vi } from "vitest";

const datadogLogger = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("@app/logger/datadogLogger", () => ({ default: datadogLogger }));

import type { EventSourceConnectionState } from "./event_source_manager";
import { EventSourceManager } from "./event_source_manager";

class FakeEventSource {
  onerror: ((event: PolyfillEvent) => void) | null = null;
  onmessage: ((event: PolyfillMessageEvent) => void) | null = null;
  onopen: ((event: PolyfillEvent) => void) | null = null;
  readyState = 0;

  constructor(readonly url: string) {}

  emitMessage(data: string) {
    this.onmessage?.({ data, lastEventId: "", target: this, type: "message" });
  }

  close = vi.fn(() => {
    this.readyState = 2;
  });
}

describe("EventSourceManager", () => {
  beforeEach(() => {
    datadogLogger.error.mockReset();
    datadogLogger.warn.mockReset();
  });

  it("retains one connection and replays buffered events to remounted subscribers", async () => {
    const sources: FakeEventSource[] = [];
    const manager = new EventSourceManager(async (url) => {
      const source = new FakeEventSource(url);
      sources.push(source);
      return source;
    });
    const firstEvents: string[] = [];
    const unsubscribe = manager.subscribe({
      streamId: "message-msg_1",
      config: {
        buildURL: () => "/events",
        isTerminalEvent: (event) => event === "terminal",
        replayBufferedEventsOnSubscribe: true,
        restartKey: "message-msg_1",
        workspaceId: "w_1",
      },
      subscriber: {
        onEvent: (event) => firstEvents.push(event),
        onStateChange: vi.fn(),
      },
      keepAliveWithoutSubscribers: true,
    });
    const unsubscribeConcurrent = manager.subscribe({
      streamId: "message-msg_1",
      config: {
        buildURL: () => "/events",
        isTerminalEvent: (event) => event === "terminal",
        replayBufferedEventsOnSubscribe: true,
        restartKey: "message-msg_1",
        workspaceId: "w_1",
      },
      subscriber: {
        onEvent: vi.fn(),
        onStateChange: vi.fn(),
      },
      keepAliveWithoutSubscribers: true,
    });

    await vi.waitFor(() => expect(sources).toHaveLength(1));
    unsubscribeConcurrent();
    sources[0].emitMessage("event-1");
    unsubscribe();

    expect(sources[0].close).not.toHaveBeenCalled();

    const remountedEvents: string[] = [];
    const remountedStates: EventSourceConnectionState[] = [];
    const unsubscribeRemounted = manager.subscribe({
      streamId: "message-msg_1",
      config: {
        buildURL: () => "/events",
        isTerminalEvent: (event) => event === "terminal",
        replayBufferedEventsOnSubscribe: true,
        restartKey: "message-msg_1",
        workspaceId: "w_1",
      },
      subscriber: {
        onEvent: (event) => remountedEvents.push(event),
        onStateChange: (state) => remountedStates.push(state),
      },
      keepAliveWithoutSubscribers: true,
    });

    expect(sources).toHaveLength(1);
    expect(firstEvents).toEqual(["event-1"]);
    expect(remountedEvents).toEqual(["event-1"]);

    sources[0].emitMessage("terminal");
    expect(sources[0].close).toHaveBeenCalledOnce();
    expect(remountedStates.at(-1)).toEqual({ kind: "terminal" });

    unsubscribeRemounted();
    manager.releaseWorkspace("w_1");
  });

  it("does not replay events for ordinary subscriber-owned streams", async () => {
    const sources: FakeEventSource[] = [];
    const manager = new EventSourceManager(async (url) => {
      const source = new FakeEventSource(url);
      sources.push(source);
      return source;
    });
    const firstEvents: string[] = [];
    const config = {
      buildURL: () => "/events",
      replayBufferedEventsOnSubscribe: false,
      restartKey: "conversation-conv_1",
      workspaceId: "w_1",
    };
    const unsubscribeFirst = manager.subscribe({
      streamId: "conversation-conv_1",
      config,
      subscriber: {
        onEvent: (event) => firstEvents.push(event),
        onStateChange: vi.fn(),
      },
      keepAliveWithoutSubscribers: false,
    });
    await vi.waitFor(() => expect(sources).toHaveLength(1));
    sources[0].emitMessage("event-1");

    const secondEvents: string[] = [];
    const unsubscribeSecond = manager.subscribe({
      streamId: "conversation-conv_1",
      config,
      subscriber: {
        onEvent: (event) => secondEvents.push(event),
        onStateChange: vi.fn(),
      },
      keepAliveWithoutSubscribers: false,
    });

    expect(secondEvents).toEqual([]);
    sources[0].emitMessage("event-2");
    expect(firstEvents).toEqual(["event-1", "event-2"]);
    expect(secondEvents).toEqual(["event-2"]);

    unsubscribeFirst();
    unsubscribeSecond();
  });

  it("releases only streams owned by the workspace, independent of telemetry", async () => {
    const sources: FakeEventSource[] = [];
    const manager = new EventSourceManager(async (url) => {
      const source = new FakeEventSource(url);
      sources.push(source);
      return source;
    });

    manager.subscribe({
      streamId: "message-msg_1",
      config: {
        buildURL: () => "/events/1",
        replayBufferedEventsOnSubscribe: false,
        restartKey: "message-msg_1",
        workspaceId: "w_1",
      },
      subscriber: { onEvent: vi.fn(), onStateChange: vi.fn() },
      keepAliveWithoutSubscribers: true,
    });
    manager.subscribe({
      streamId: "message-msg_2",
      config: {
        buildURL: () => "/events/2",
        replayBufferedEventsOnSubscribe: false,
        restartKey: "message-msg_2",
        telemetryContext: { workspaceId: "w_1" },
        workspaceId: "w_2",
      },
      subscriber: { onEvent: vi.fn(), onStateChange: vi.fn() },
      keepAliveWithoutSubscribers: true,
    });

    await vi.waitFor(() => expect(sources).toHaveLength(2));
    manager.releaseWorkspace("w_1");
    expect(sources[0].close).toHaveBeenCalledOnce();
    expect(sources[1].close).not.toHaveBeenCalled();

    manager.releaseWorkspace("w_2");
    expect(sources[1].close).toHaveBeenCalledOnce();
  });

  it("reports transient failures with reconnection context", async () => {
    const sources: FakeEventSource[] = [];
    const manager = new EventSourceManager(
      async (url) => {
        const source = new FakeEventSource(url);
        sources.push(source);
        return source;
      },
      () => 0,
      {
        maxReconnectAttempts: 2,
        reconnectDelayBaseMs: 1_000,
        reconnectDelayJitterMs: 0,
      }
    );
    manager.subscribe({
      streamId: "message-msg_2",
      config: {
        buildURL: () => "/events",
        replayBufferedEventsOnSubscribe: true,
        restartKey: "message-msg_2",
        workspaceId: "w_1",
        telemetryContext: {
          sseKind: "agent_loop",
          conversationId: "conv_1",
          messageId: "msg_2",
        },
      },
      subscriber: {
        onEvent: vi.fn(),
        onStateChange: vi.fn(),
      },
      keepAliveWithoutSubscribers: true,
    });

    await vi.waitFor(() => expect(sources).toHaveLength(1));
    sources[0].onerror?.({ type: "error", target: sources[0] });

    expect(datadogLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        sseKind: "agent_loop",
        workspaceId: "w_1",
        conversationId: "conv_1",
        messageId: "msg_2",
        streamId: "message-msg_2",
        sourcePath: "/events",
        reconnectAttempt: 1,
        maxReconnectAttempts: 2,
        eventType: "error",
      }),
      "SSE connection failed, reconnecting."
    );
    expect(datadogLogger.error).not.toHaveBeenCalled();

    manager.releaseWorkspace("w_1");
  });

  it("reports terminal failures with context and resumes an ongoing stream", async () => {
    const sources: FakeEventSource[] = [];
    const states: EventSourceConnectionState[] = [];
    const manager = new EventSourceManager(
      async (url) => {
        const source = new FakeEventSource(url);
        sources.push(source);
        return source;
      },
      () => 0,
      { maxReconnectAttempts: 1 }
    );
    manager.subscribe({
      streamId: "message-msg_2",
      config: {
        buildURL: () => "/events",
        replayBufferedEventsOnSubscribe: false,
        restartKey: "message-msg_2",
        workspaceId: "w_1",
        telemetryContext: {
          conversationId: "conv_1",
          messageId: "msg_2",
        },
      },
      subscriber: {
        onEvent: vi.fn(),
        onStateChange: (state) => states.push(state),
      },
      keepAliveWithoutSubscribers: true,
    });

    await vi.waitFor(() => expect(sources).toHaveLength(1));
    sources[0].onerror?.({ type: "error", target: sources[0] });

    expect(states.at(-1)?.kind).toBe("failed");
    expect(datadogLogger.warn).not.toHaveBeenCalled();
    expect(datadogLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "w_1",
        conversationId: "conv_1",
        messageId: "msg_2",
        streamId: "message-msg_2",
        sourcePath: "/events",
        reconnectAttempt: 1,
        readyState: 0,
        retryBudgetExhausted: true,
      }),
      "SSE retry budget exhausted."
    );

    manager.resume("message-msg_2");
    await vi.waitFor(() => expect(sources).toHaveLength(2));
    expect(states.at(-1)?.kind).toBe("connecting");

    manager.releaseWorkspace("w_1");
  });

  it("delays and budgets immediate done sentinels", async () => {
    const sources: FakeEventSource[] = [];
    const states: EventSourceConnectionState[] = [];
    const manager = new EventSourceManager(
      async (url) => {
        const source = new FakeEventSource(url);
        sources.push(source);
        return source;
      },
      () => 0,
      {
        maxReconnectAttempts: 2,
        reconnectDelayBaseMs: 10,
        reconnectDelayJitterMs: 0,
      }
    );
    manager.subscribe({
      streamId: "message-msg_done",
      config: {
        buildURL: () => "/events",
        replayBufferedEventsOnSubscribe: false,
        restartKey: "message-msg_done",
        workspaceId: "w_1",
      },
      subscriber: {
        onEvent: vi.fn(),
        onStateChange: (state) => states.push(state),
      },
      keepAliveWithoutSubscribers: true,
    });
    await vi.waitFor(() => expect(sources).toHaveLength(1));
    sources[0].onopen?.({ type: "open", target: sources[0] });
    sources[0].emitMessage("done");
    expect(sources).toHaveLength(1);
    await vi.waitFor(() => expect(sources).toHaveLength(2));
    sources[1].onopen?.({ type: "open", target: sources[1] });
    sources[1].emitMessage("done");
    expect(states.at(-1)?.kind).toBe("failed");
    manager.releaseWorkspace("w_1");
  });

  it("charges page-wake recovery to the existing budget", async () => {
    const sources: FakeEventSource[] = [];
    const states: EventSourceConnectionState[] = [];
    const manager = new EventSourceManager(
      async (url) => {
        const source = new FakeEventSource(url);
        sources.push(source);
        return source;
      },
      () => 0,
      {
        maxReconnectAttempts: 2,
        reconnectDelayBaseMs: 10,
        reconnectDelayJitterMs: 0,
      }
    );
    manager.subscribe({
      streamId: "message-msg_wake",
      config: {
        buildURL: () => "/events",
        replayBufferedEventsOnSubscribe: false,
        restartKey: "message-msg_wake",
        workspaceId: "w_1",
      },
      subscriber: {
        onEvent: vi.fn(),
        onStateChange: (state) => states.push(state),
      },
      keepAliveWithoutSubscribers: true,
    });
    await vi.waitFor(() => expect(sources).toHaveLength(1));
    sources[0].onopen?.({ type: "open", target: sources[0] });
    sources[0].onerror?.({ type: "error", target: sources[0] });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(sources).toHaveLength(1);

    await vi.waitFor(() => expect(sources).toHaveLength(2));
    sources[1].onopen?.({ type: "open", target: sources[1] });
    sources[1].readyState = 2;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(states.at(-1)?.kind).toBe("failed");
    manager.releaseWorkspace("w_1");
  });
});
