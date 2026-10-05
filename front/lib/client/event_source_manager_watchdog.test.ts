import {
  getAgentLoopEventId,
  shouldPauseAgentLoopStream,
} from "@app/lib/client/agent_loop_stream";
import { EventSourceManager } from "@app/lib/client/event_source_manager";
import { clientFetch } from "@app/lib/egress/client";
import { FakeEventSource } from "@app/tests/utils/FakeEventSource";
import type { ConnectionConfig } from "@app/types/event_source";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/logger/datadogLogger", () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("@app/lib/egress/client", () => ({ clientFetch: vi.fn() }));

const event = (eventId: string) =>
  JSON.stringify({ eventId, data: { type: "generation_tokens" } });

describe("ongoing-loop SSE watchdog", () => {
  const managers: EventSourceManager[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    vi.mocked(clientFetch).mockReset();
  });

  afterEach(() => {
    for (const manager of managers) {
      manager.releaseWorkspace("w_1");
    }
    managers.length = 0;
    vi.useRealTimers();
  });

  function setup() {
    const sources: FakeEventSource[] = [];
    const polls: Array<{
      url: string;
      signal: AbortSignal | null | undefined;
      resolve: (response: Response) => void;
    }> = [];
    vi.mocked(clientFetch).mockImplementation(
      (url, options) =>
        new Promise((resolve) =>
          polls.push({ url: String(url), signal: options?.signal, resolve })
        )
    );
    const manager = new EventSourceManager(
      async (url) => {
        const source = new FakeEventSource(url);
        sources.push(source);
        return source;
      },
      () => 0
    );
    managers.push(manager);
    const received: string[] = [];
    const subscribe = async (
      streamId = "message-msg_1",
      config: Partial<ConnectionConfig> = {}
    ) => {
      const unsubscribe = manager.subscribe({
        streamId,
        config: {
          workspaceId: "w_1",
          restartKey: streamId,
          buildURL: () => `/events/${streamId}`,
          buildLongPollURL: (last) =>
            `/events/${streamId}/poll?lastEventId=${getAgentLoopEventId(last)}`,
          replayBufferedEventsOnSubscribe: true,
          isPauseEvent: shouldPauseAgentLoopStream,
          isTerminalEvent: (data) => getAgentLoopEventId(data) === "terminal",
          ...config,
        },
        subscriber: {
          onEvent: (data) => received.push(data),
          onStateChange: vi.fn(),
        },
        keepAliveWithoutSubscribers: true,
      });
      await vi.advanceTimersByTimeAsync(0);
      sources.at(-1)?.emitHandshake();
      return unsubscribe;
    };
    return { manager, sources, polls, received, subscribe };
  }

  it("delivers missing events after a silent SSE connection and ignores its late callbacks", async () => {
    const { manager, sources, polls, received, subscribe } = setup();
    await subscribe();
    sources[0].emitMessage(event("1-0"));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(polls).toHaveLength(0);

    manager.resume("message-msg_1");
    expect(sources[0].close).toHaveBeenCalledOnce();
    expect(polls).toHaveLength(1);
    expect(sources[0].close.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(clientFetch).mock.invocationCallOrder[0]
    );
    expect(polls[0].url).toContain("lastEventId=1-0");
    sources[0].emitMessage(event("late-sse"));
    sources[0].onerror?.({ type: "error", target: sources[0] });
    polls[0].resolve(
      Response.json({ events: [event("2-0"), event("terminal")] })
    );
    await vi.advanceTimersByTimeAsync(0);

    expect(received).toEqual([event("1-0"), event("2-0"), event("terminal")]);
    expect(manager.getConnectionState("message-msg_1").kind).toBe("terminal");
    expect(polls[0].signal?.aborted).toBe(true);
  });

  it("measures silence from the latest event, including streams with no events yet", async () => {
    const { manager, sources, polls, subscribe } = setup();
    await subscribe();
    await subscribe("message-no-events");
    await vi.advanceTimersByTimeAsync(20_000);
    sources[0].emitMessage(event("1-0"));
    await vi.advanceTimersByTimeAsync(10_000);
    manager.resume("message-msg_1");
    manager.resume("message-no-events");
    expect(sources[0].close).not.toHaveBeenCalled();
    expect(polls).toHaveLength(1);
    expect(polls[0].url).toContain("message-no-events/poll?lastEventId=");
    await vi.advanceTimersByTimeAsync(20_000);
    manager.resume("message-msg_1");
    expect(polls).toHaveLength(2);
  });

  it("keeps a quiet loop on polling after an empty response without degrading other streams", async () => {
    const { manager, sources, polls, received, subscribe } = setup();
    await subscribe();
    await subscribe("message-healthy");
    await vi.advanceTimersByTimeAsync(30_000);
    manager.resume("message-msg_1");
    manager.resume("message-msg_1");
    expect(polls).toHaveLength(1);
    polls[0].resolve(Response.json({ events: [] }));
    await vi.advanceTimersByTimeAsync(250);
    expect(polls).toHaveLength(2);
    expect(sources).toHaveLength(2);
    expect(sources[1].close).not.toHaveBeenCalled();
    await subscribe("message-new");
    expect(sources).toHaveLength(3);
    polls[1].resolve(Response.json({ events: [event("1-0")] }));
    await vi.advanceTimersByTimeAsync(0);
    expect(received).toEqual([event("1-0")]);
  });

  it("keeps polling on page wake and aborts it when the workspace is released", async () => {
    const { manager, sources, polls, subscribe } = setup();
    await subscribe();
    await vi.advanceTimersByTimeAsync(30_000);
    manager.resume("message-msg_1");
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
    expect(polls).toHaveLength(2);
    expect(polls[0].signal?.aborted).toBe(true);
    expect(sources).toHaveLength(1);
    manager.releaseWorkspace("w_1");
    expect(polls[1].signal?.aborted).toBe(true);
  });

  it("replays both SSE and polling events when the message remounts", async () => {
    const { manager, sources, polls, received, subscribe } = setup();
    const unsubscribe = await subscribe();
    sources[0].emitMessage(event("1-0"));
    unsubscribe();
    received.length = 0;
    await vi.advanceTimersByTimeAsync(30_000);
    manager.resume("message-msg_1");
    polls[0].resolve(Response.json({ events: [event("2-0")] }));
    await vi.advanceTimersByTimeAsync(0);
    expect(received).toEqual([]);
    await subscribe();
    expect(received).toEqual([event("1-0"), event("2-0")]);
    expect(sources).toHaveLength(1);
  });

  it("leaves paused, terminal, and SSE-only streams alone", async () => {
    const { manager, sources, polls, subscribe } = setup();
    await subscribe();
    sources[0].emitMessage(
      JSON.stringify({
        eventId: "paused",
        data: {
          type: "tool_approve_execution",
          isLastBlockingEventForStep: true,
        },
      })
    );
    await subscribe("message-terminal");
    sources[1].emitMessage(event("terminal"));
    await subscribe("message-sse-only", { buildLongPollURL: undefined });
    await vi.advanceTimersByTimeAsync(30_000);
    for (const streamId of [
      "message-msg_1",
      "message-terminal",
      "message-sse-only",
      "missing",
    ]) {
      manager.resume(streamId);
    }
    expect(polls).toHaveLength(0);
    expect(sources[0].close).not.toHaveBeenCalled();
    expect(sources[2].close).not.toHaveBeenCalled();
  });
});
