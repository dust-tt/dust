import {
  getAgentLoopEventId,
  isLastBlockingAgentLoopEvent,
} from "@app/lib/client/agent_loop_stream";
import { setSseVerbose } from "@app/lib/client/sse_verbose";
import type {
  EventSourceConnectionState,
  EventSourceManagerOptions,
} from "@app/types/event_source";
import { MANAGED_SSE_HANDSHAKE_EVENT } from "@app/types/sse";
import type {
  Event as PolyfillEvent,
  MessageEvent as PolyfillMessageEvent,
} from "event-source-polyfill";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const datadogLogger = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("@app/logger/datadogLogger", () => ({ default: datadogLogger }));

import { EventSourceManager } from "./event_source_manager";

class FakeEventSource {
  private readonly listeners = new Map<
    string,
    Set<(event: PolyfillEvent) => void>
  >();
  onerror: ((event: PolyfillEvent) => void) | null = null;
  onmessage: ((event: PolyfillMessageEvent) => void) | null = null;
  onopen: ((event: PolyfillEvent) => void) | null = null;
  readyState = 0;

  constructor(readonly url: string) {}

  addEventListener = (
    type: string,
    listener: (event: PolyfillEvent) => void
  ) => {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  };

  emitHandshake() {
    for (const listener of this.listeners.get(MANAGED_SSE_HANDSHAKE_EVENT) ??
      []) {
      listener({ type: MANAGED_SSE_HANDSHAKE_EVENT, target: this });
    }
  }

  emitMessage(data: string) {
    this.onmessage?.({ data, lastEventId: "", target: this, type: "message" });
  }

  close = vi.fn(() => {
    this.readyState = 2;
  });
}

const blockingEvent = JSON.stringify({
  eventId: "blocking-event",
  data: {
    type: "tool_approve_execution",
    isLastBlockingEventForStep: true,
  },
});
const resumedEvent = JSON.stringify({
  eventId: "resumed-event",
  data: { type: "generation_tokens" },
});

function createBlockedStreamManager(options: EventSourceManagerOptions = {}) {
  const sources: FakeEventSource[] = [];
  const manager = new EventSourceManager(
    async (url) => {
      const source = new FakeEventSource(url);
      sources.push(source);
      return source;
    },
    () => 0,
    options
  );
  const config = {
    buildURL: () => "/events",
    isPauseEvent: isLastBlockingAgentLoopEvent,
    replayBufferedEventsOnSubscribe: false,
    restartKey: "message-msg_blocked",
    workspaceId: "w_1",
  };
  const subscribe = (onEvent: (event: string) => void = vi.fn()) =>
    manager.subscribe({
      streamId: "message-msg_blocked",
      config,
      subscriber: { onEvent, onStateChange: vi.fn() },
      keepAliveWithoutSubscribers: true,
    });

  return { manager, sources, subscribe };
}

describe("EventSourceManager", () => {
  beforeEach(() => {
    datadogLogger.error.mockReset();
    datadogLogger.warn.mockReset();
  });

  afterEach(() => {
    setSseVerbose(false);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("logs connection activity without event payloads when SSE logs are enabled", async () => {
    const sources: FakeEventSource[] = [];
    const verboseLogs = vi
      .spyOn(console, "info")
      .mockImplementation(() => undefined);
    const manager = new EventSourceManager(async (url) => {
      const source = new FakeEventSource(url);
      sources.push(source);
      return source;
    });
    setSseVerbose(true);

    manager.subscribe({
      streamId: "message-msg_debug",
      config: {
        buildURL: () => "/events?token=secret-query",
        replayBufferedEventsOnSubscribe: false,
        restartKey: "message-msg_debug",
        workspaceId: "w_1",
        headers: { Authorization: "secret-header" },
      },
      subscriber: {
        onEvent: vi.fn(),
        onStateChange: vi.fn(),
      },
      keepAliveWithoutSubscribers: false,
    });

    await vi.waitFor(() => expect(sources).toHaveLength(1));
    sources[0].emitHandshake();
    sources[0].emitMessage("secret-payload");
    expect(verboseLogs).toHaveBeenCalledWith(
      "[Dust SSE]",
      expect.objectContaining({
        event: "event_received",
        eventLength: "secret-payload".length,
        streamId: "message-msg_debug",
      })
    );
    expect(JSON.stringify(verboseLogs.mock.calls)).not.toMatch(
      /secret-payload|secret-query|secret-header/
    );

    setSseVerbose(false);
    verboseLogs.mockClear();
    sources[0].emitMessage("another-event");
    expect(verboseLogs).not.toHaveBeenCalled();

    manager.releaseWorkspace("w_1");
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
    sources[0].emitHandshake();
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
    sources[0].emitHandshake();
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
    sources[0].emitHandshake();
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
    sources[0].emitHandshake();
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

  it("switches to long polling after two SSE handshake timeouts", async () => {
    const sources: FakeEventSource[] = [];
    const pollSignals: AbortSignal[] = [];
    const states: EventSourceConnectionState[] = [];
    const manager = new EventSourceManager(
      async (url) => {
        const source = new FakeEventSource(url);
        sources.push(source);
        return source;
      },
      () => 0,
      {
        handshakeTimeoutMs: 1,
        reconnectDelayBaseMs: 1,
        reconnectDelayJitterMs: 0,
        longPollFactory: async (_url, { signal }) => {
          pollSignals.push(signal);
          return new Promise((resolve) => {
            signal.addEventListener("abort", () => resolve([]), {
              once: true,
            });
          });
        },
      }
    );

    const unsubscribe = manager.subscribe({
      streamId: "message-msg_3",
      config: {
        buildURL: () => "/api/sse/events",
        buildLongPollURL: () => "/api/events/poll",
        getEventId: getAgentLoopEventId,
        replayBufferedEventsOnSubscribe: true,
        restartKey: "message-msg_3",
        workspaceId: "w_1",
      },
      subscriber: {
        onEvent: vi.fn(),
        onStateChange: (state) => states.push(state),
      },
      keepAliveWithoutSubscribers: true,
    });

    await vi.waitFor(() => expect(pollSignals).toHaveLength(1));

    expect(sources[0].close).toHaveBeenCalledOnce();
    expect(sources).toHaveLength(2);
    expect(states.at(-1)?.kind).toBe("long_polling");
    expect(datadogLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackAvailable: true,
        handshakeTimeoutMs: 1,
        sseHealth: "degraded",
        streamId: "message-msg_3",
        transport: "sse",
      }),
      "SSE handshake failed, switching to long polling."
    );

    unsubscribe();
    expect(pollSignals[0].aborted).toBe(false);
    manager.releaseWorkspace("w_1");
    expect(pollSignals[0].aborted).toBe(true);
  });

  it("polls immediately while probing SSE for new streams in a degraded session", async () => {
    const sources: FakeEventSource[] = [];
    const polls: Array<{
      signal: AbortSignal;
      resolve: (events: string[]) => void;
      url: string;
    }> = [];
    const manager = new EventSourceManager(
      async (url) => {
        const source = new FakeEventSource(url);
        sources.push(source);
        return source;
      },
      () => 0,
      {
        handshakeTimeoutMs: 5_000,
        reconnectDelayBaseMs: 1,
        reconnectDelayJitterMs: 0,
        longPollFactory: (url, { signal }) =>
          new Promise((resolve) => {
            polls.push({ signal, resolve, url });
            signal.addEventListener("abort", () => resolve([]), {
              once: true,
            });
          }),
      }
    );
    const config = (messageId: string) => ({
      buildURL: () => `/api/sse/events/${messageId}`,
      buildLongPollURL: (lastEvent: string | null) =>
        `/api/events/${messageId}/poll?lastEventId=${getAgentLoopEventId(lastEvent)}`,
      getEventId: getAgentLoopEventId,
      isTerminalEvent: () => false,
      replayBufferedEventsOnSubscribe: true,
      restartKey: messageId,
      workspaceId: "w_1",
    });

    manager.subscribe({
      streamId: "message-msg_4",
      config: config("msg_4"),
      subscriber: { onEvent: vi.fn(), onStateChange: vi.fn() },
      keepAliveWithoutSubscribers: true,
    });
    await vi.waitFor(() => expect(sources).toHaveLength(1));
    sources[0].onerror?.({ type: "error", target: sources[0] });
    await vi.waitFor(() => expect(sources).toHaveLength(2));
    sources[1].onerror?.({ type: "error", target: sources[1] });
    await vi.waitFor(() => expect(polls).toHaveLength(1));

    const events: string[] = [];
    const states: EventSourceConnectionState[] = [];
    manager.subscribe({
      streamId: "message-msg_5",
      config: config("msg_5"),
      subscriber: {
        onEvent: (event) => events.push(event),
        onStateChange: (state) => states.push(state),
      },
      keepAliveWithoutSubscribers: true,
    });

    await vi.waitFor(() => {
      expect(sources).toHaveLength(3);
      expect(polls).toHaveLength(2);
    });
    expect(polls[1].url).toBe("/api/events/msg_5/poll?lastEventId=");
    expect(states.at(-1)?.kind).toBe("long_polling");

    const event = JSON.stringify({ eventId: "evt_1", data: { type: "test" } });
    polls[1].resolve([event]);
    await vi.waitFor(() => expect(events).toEqual([event]));
    await vi.waitFor(() => expect(polls).toHaveLength(3));
    expect(polls[2].url).toBe("/api/events/msg_5/poll?lastEventId=evt_1");
    sources[2].emitHandshake();
    sources[2].emitMessage(event);

    expect(events).toEqual([event]);
    expect(states.at(-1)?.kind).toBe("open");
    expect(polls.at(-1)?.signal.aborted).toBe(true);

    manager.releaseWorkspace("w_1");
  });

  it("reports terminal long-poll failures with transport context", async () => {
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
        handshakeTimeoutMs: 5_000,
        longPollFactory: async () => {
          throw new Error("poll failed");
        },
        maxReconnectAttempts: 2,
        reconnectDelayBaseMs: 1,
        reconnectDelayJitterMs: 0,
      }
    );

    manager.subscribe({
      streamId: "message-msg_6",
      config: {
        buildURL: () => "/api/sse/events/msg_6",
        buildLongPollURL: () => "/api/events/msg_6/poll",
        getEventId: getAgentLoopEventId,
        replayBufferedEventsOnSubscribe: true,
        restartKey: "message-msg_6",
        workspaceId: "w_1",
      },
      subscriber: {
        onEvent: vi.fn(),
        onStateChange: (state) => states.push(state),
      },
      keepAliveWithoutSubscribers: true,
    });
    await vi.waitFor(() => expect(sources).toHaveLength(1));
    sources[0].onerror?.({ type: "error", target: sources[0] });
    await vi.waitFor(() => expect(sources).toHaveLength(2));
    sources[1].onerror?.({ type: "error", target: sources[1] });
    await vi.waitFor(() => expect(states.at(-1)?.kind).toBe("failed"));

    expect(datadogLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        error: { name: "Error", message: "poll failed" },
        longPollAttempt: 2,
        longPollPath: "/api/events/msg_6/poll",
        sseHealth: "degraded",
        streamId: "message-msg_6",
        retryBudgetExhausted: true,
        transport: "long_polling",
      }),
      "Long-poll retry budget exhausted."
    );

    manager.releaseWorkspace("w_1");
  });

  it("limits registry resumes until an event arrives", async () => {
    let nowMs = 0;
    vi.spyOn(Date, "now").mockImplementation(() => nowMs);
    const sources: FakeEventSource[] = [];
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
      streamId: "message-msg_7",
      config: {
        buildURL: () => "/events",
        replayBufferedEventsOnSubscribe: false,
        restartKey: "message-msg_7",
        workspaceId: "w_1",
      },
      subscriber: { onEvent: vi.fn(), onStateChange: vi.fn() },
      keepAliveWithoutSubscribers: true,
    });
    await vi.waitFor(() => expect(sources).toHaveLength(1));
    sources[0].onerror?.({ type: "error", target: sources[0] });

    manager.resume("message-msg_7");
    await vi.waitFor(() => expect(sources).toHaveLength(2));
    sources[1].onerror?.({ type: "error", target: sources[1] });

    nowMs = 89_999;
    manager.resume("message-msg_7");
    expect(sources).toHaveLength(2);

    nowMs = 90_000;
    manager.resume("message-msg_7");
    await vi.waitFor(() => expect(sources).toHaveLength(3));
    sources[2].onerror?.({ type: "error", target: sources[2] });

    nowMs = 180_000;
    manager.resume("message-msg_7");
    await vi.waitFor(() => expect(sources).toHaveLength(4));
    sources[3].onerror?.({ type: "error", target: sources[3] });

    nowMs = 270_000;
    manager.resume("message-msg_7");
    expect(sources).toHaveLength(4);
    manager.reconnect("message-msg_7");
    await vi.waitFor(() => expect(sources).toHaveLength(5));
    manager.releaseWorkspace("w_1");
  });

  it("counts empty polls and waits before requesting again", async () => {
    vi.useFakeTimers();
    const sources: FakeEventSource[] = [];
    const longPollFactory = vi.fn(async () => []);
    const manager = new EventSourceManager(
      async (url) => {
        const source = new FakeEventSource(url);
        sources.push(source);
        return source;
      },
      () => 0,
      {
        longPollFactory,
        maxReconnectAttempts: 2,
        reconnectDelayBaseMs: 1,
        reconnectDelayJitterMs: 0,
      }
    );
    const states: EventSourceConnectionState[] = [];
    manager.subscribe({
      streamId: "message-msg_8",
      config: {
        buildURL: () => "/events",
        buildLongPollURL: () => "/events/poll",
        getEventId: getAgentLoopEventId,
        replayBufferedEventsOnSubscribe: false,
        restartKey: "message-msg_8",
        workspaceId: "w_1",
      },
      subscriber: {
        onEvent: vi.fn(),
        onStateChange: (state) => states.push(state),
      },
      keepAliveWithoutSubscribers: true,
    });
    await vi.advanceTimersByTimeAsync(0);
    sources[0].onerror?.({ type: "error", target: sources[0] });
    await vi.advanceTimersByTimeAsync(1);
    sources[1].onerror?.({ type: "error", target: sources[1] });
    await vi.advanceTimersByTimeAsync(0);
    expect(longPollFactory).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(249);
    expect(longPollFactory).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(longPollFactory).toHaveBeenCalledTimes(2);
    expect(states.at(-1)?.kind).toBe("failed");
    manager.releaseWorkspace("w_1");
  });

  it("delays and budgets immediate SSE done sentinels", async () => {
    vi.useFakeTimers();
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
        reconnectDelayBaseMs: 1_000,
        reconnectDelayJitterMs: 0,
      }
    );
    manager.subscribe({
      streamId: "message-msg_9",
      config: {
        buildURL: () => "/events",
        replayBufferedEventsOnSubscribe: false,
        restartKey: "message-msg_9",
        workspaceId: "w_1",
      },
      subscriber: {
        onEvent: vi.fn(),
        onStateChange: (state) => states.push(state),
      },
      keepAliveWithoutSubscribers: true,
    });
    await vi.advanceTimersByTimeAsync(0);
    sources[0].emitHandshake();
    sources[0].emitMessage("done");
    expect(sources).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(999);
    expect(sources).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sources).toHaveLength(2);
    sources[1].emitHandshake();
    sources[1].emitMessage("done");
    expect(states.at(-1)?.kind).toBe("failed");
    manager.releaseWorkspace("w_1");
  });

  it("keeps reconnecting after planned idle SSE rollovers", async () => {
    vi.useFakeTimers();
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
        reconnectDelayBaseMs: 1_000,
        reconnectDelayJitterMs: 0,
      }
    );
    manager.subscribe({
      streamId: "conversation-c_1",
      config: {
        buildURL: () => "/events",
        replayBufferedEventsOnSubscribe: false,
        restartKey: "conversation-c_1",
        workspaceId: "w_1",
      },
      subscriber: {
        onEvent: vi.fn(),
        onStateChange: (state) => states.push(state),
      },
      keepAliveWithoutSubscribers: true,
    });
    await vi.advanceTimersByTimeAsync(0);
    sources[0].emitHandshake();

    for (let rollover = 0; rollover < 3; rollover++) {
      await vi.advanceTimersByTimeAsync(180_000);
      sources[rollover].emitMessage("done");
      expect(states.at(-1)?.kind).toBe("reconnecting");
      await vi.advanceTimersByTimeAsync(1_000);
      expect(sources).toHaveLength(rollover + 2);
      sources[rollover + 1].emitHandshake();
      expect(states.at(-1)?.kind).toBe("open");
    }

    sources[3].onerror?.({ type: "error", target: sources[3] });
    expect(states.at(-1)?.kind).toBe("reconnecting");
    await vi.advanceTimersByTimeAsync(1_000);
    sources[4].emitHandshake();
    sources[4].onerror?.({ type: "error", target: sources[4] });
    expect(states.at(-1)?.kind).toBe("failed");
    manager.releaseWorkspace("w_1");
  });

  it("does not reset the retry budget when a closed source is recovered on page wake", async () => {
    vi.useFakeTimers();
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
        maxReconnectAttempts: 3,
        reconnectDelayBaseMs: 1,
        reconnectDelayJitterMs: 0,
      }
    );
    manager.subscribe({
      streamId: "message-msg_10",
      config: {
        buildURL: () => "/events",
        replayBufferedEventsOnSubscribe: false,
        restartKey: "message-msg_10",
        workspaceId: "w_1",
      },
      subscriber: {
        onEvent: vi.fn(),
        onStateChange: (state) => states.push(state),
      },
      keepAliveWithoutSubscribers: true,
    });
    await vi.advanceTimersByTimeAsync(0);
    sources[0].emitHandshake();
    sources[0].onerror?.({ type: "error", target: sources[0] });
    await vi.advanceTimersByTimeAsync(1);
    sources[1].emitHandshake();
    sources[1].readyState = 2;

    window.dispatchEvent(new Event("online"));
    expect(sources).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(sources).toHaveLength(3);
    sources[2].emitHandshake();
    sources[2].onerror?.({ type: "error", target: sources[2] });
    expect(states.at(-1)?.kind).toBe("failed");
    manager.releaseWorkspace("w_1");
  });

  it("probes SSE again when the browser comes online during long polling", async () => {
    vi.useFakeTimers();
    const sources: FakeEventSource[] = [];
    const pollSignals: AbortSignal[] = [];
    const manager = new EventSourceManager(
      async (url) => {
        const source = new FakeEventSource(url);
        sources.push(source);
        return source;
      },
      () => 0,
      {
        reconnectDelayBaseMs: 1,
        reconnectDelayJitterMs: 0,
        longPollFactory: (_url, { signal }) => {
          pollSignals.push(signal);
          return new Promise((resolve) => {
            signal.addEventListener("abort", () => resolve([]), { once: true });
          });
        },
      }
    );
    manager.subscribe({
      streamId: "message-msg_12",
      config: {
        buildURL: () => "/events",
        buildLongPollURL: () => "/events/poll",
        getEventId: getAgentLoopEventId,
        replayBufferedEventsOnSubscribe: false,
        restartKey: "message-msg_12",
        workspaceId: "w_1",
      },
      subscriber: { onEvent: vi.fn(), onStateChange: vi.fn() },
      keepAliveWithoutSubscribers: true,
    });
    await vi.advanceTimersByTimeAsync(0);
    sources[0].onerror?.({ type: "error", target: sources[0] });
    await vi.advanceTimersByTimeAsync(1);
    sources[1].onerror?.({ type: "error", target: sources[1] });
    expect(pollSignals).toHaveLength(1);

    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);
    expect(sources).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(90_000);
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);
    expect(sources).toHaveLength(3);
    sources[2].emitHandshake();
    expect(pollSignals[0].aborted).toBe(true);
    manager.releaseWorkspace("w_1");
  });

  it("restarts a failed visible stream when its registry entry is readded", async () => {
    let nowMs = 0;
    vi.spyOn(Date, "now").mockImplementation(() => nowMs);
    const sources: FakeEventSource[] = [];
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
      streamId: "message-msg_blocked",
      config: {
        buildURL: () => "/events",
        replayBufferedEventsOnSubscribe: false,
        restartKey: "message-msg_blocked",
        workspaceId: "w_1",
      },
      subscriber: { onEvent: vi.fn(), onStateChange: vi.fn() },
      keepAliveWithoutSubscribers: true,
    });
    await vi.waitFor(() => expect(sources).toHaveLength(1));
    sources[0].onerror?.({ type: "error", target: sources[0] });

    manager.resume("message-msg_blocked");
    await vi.waitFor(() => expect(sources).toHaveLength(2));
    sources[1].onerror?.({ type: "error", target: sources[1] });

    nowMs = 1;
    manager.resume("message-msg_blocked");
    expect(sources).toHaveLength(2);

    manager.stopKeepingAlive("message-msg_blocked", "w_1");
    manager.resume("message-msg_blocked");
    await vi.waitFor(() => expect(sources).toHaveLength(3));
    manager.releaseWorkspace("w_1");
  });

  it("closes an unlisted stream after its last subscriber leaves", async () => {
    const sources: FakeEventSource[] = [];
    const manager = new EventSourceManager(async (url) => {
      const source = new FakeEventSource(url);
      sources.push(source);
      return source;
    });
    const unsubscribe = manager.subscribe({
      streamId: "message-msg_11",
      config: {
        buildURL: () => "/events",
        replayBufferedEventsOnSubscribe: false,
        restartKey: "message-msg_11",
        workspaceId: "w_1",
      },
      subscriber: { onEvent: vi.fn(), onStateChange: vi.fn() },
      keepAliveWithoutSubscribers: true,
    });
    await vi.waitFor(() => expect(sources).toHaveLength(1));
    sources[0].emitHandshake();

    manager.stopKeepingAlive("message-msg_11", "w_1");
    expect(sources[0].close).not.toHaveBeenCalled();
    unsubscribe();
    expect(sources[0].close).toHaveBeenCalledOnce();
  });

  it("evicts a blocked stream when its subscriber left before the blocking event", async () => {
    const { manager, sources, subscribe } = createBlockedStreamManager();

    const unsubscribe = subscribe();
    await vi.waitFor(() => expect(sources).toHaveLength(1));
    sources[0].emitHandshake();
    unsubscribe();
    expect(sources[0].close).not.toHaveBeenCalled();

    sources[0].emitMessage(blockingEvent);
    expect(sources[0].close).toHaveBeenCalledOnce();

    subscribe();
    await vi.waitFor(() => expect(sources).toHaveLength(2));
    manager.releaseWorkspace("w_1");
  });

  it("does not rearm a blocked stream when another subscriber mounts", async () => {
    const { sources, subscribe } = createBlockedStreamManager();
    const onEvent = vi.fn();

    const unsubscribe = subscribe(onEvent);
    await vi.waitFor(() => expect(sources).toHaveLength(1));
    sources[0].emitHandshake();
    sources[0].emitMessage(blockingEvent);
    expect(onEvent).toHaveBeenCalledWith(blockingEvent);
    expect(sources[0].close).not.toHaveBeenCalled();

    const unsubscribeRemount = subscribe(onEvent);
    unsubscribe();
    expect(sources[0].close).not.toHaveBeenCalled();
    unsubscribeRemount();
    expect(sources[0].close).toHaveBeenCalledOnce();
  });

  it("rearms keepalive when a blocked stream resumes while the conversation is open", async () => {
    const { manager, sources, subscribe } = createBlockedStreamManager();
    const onEvent = vi.fn();
    const unsubscribe = subscribe(onEvent);

    await vi.waitFor(() => expect(sources).toHaveLength(1));
    sources[0].emitHandshake();
    sources[0].emitMessage(blockingEvent);
    manager.stopKeepingAlive("message-msg_blocked", "w_1");
    sources[0].emitMessage(resumedEvent);
    expect(onEvent).toHaveBeenCalledWith(resumedEvent);

    unsubscribe();
    expect(sources[0].close).not.toHaveBeenCalled();
    manager.releaseWorkspace("w_1");
    expect(sources[0].close).toHaveBeenCalledOnce();
  });

  it("keeps a failed blocked stream paused until a resumed event arrives", async () => {
    const { manager, sources, subscribe } = createBlockedStreamManager({
      maxReconnectAttempts: 1,
    });
    const unsubscribe = subscribe();

    await vi.waitFor(() => expect(sources).toHaveLength(1));
    sources[0].emitHandshake();
    sources[0].emitMessage(blockingEvent);
    sources[0].onerror?.({ type: "error", target: sources[0] });

    manager.resume("message-msg_blocked");
    await vi.waitFor(() => expect(sources).toHaveLength(2));
    sources[1].emitHandshake();
    unsubscribe();
    expect(sources[1].close).toHaveBeenCalledOnce();

    manager.releaseWorkspace("w_1");
  });

  it("evicts a failed stream after a new subscriber also leaves", async () => {
    const { manager, sources, subscribe } = createBlockedStreamManager({
      maxReconnectAttempts: 1,
    });
    const unsubscribe = subscribe();
    await vi.waitFor(() => expect(sources).toHaveLength(1));
    sources[0].onerror?.({ type: "error", target: sources[0] });

    const unsubscribeRemount = subscribe();
    unsubscribe();
    unsubscribeRemount();

    subscribe();
    await vi.waitFor(() => expect(sources).toHaveLength(2));
    manager.releaseWorkspace("w_1");
  });
});
