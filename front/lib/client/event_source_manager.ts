import { COMMIT_HASH } from "@app/lib/commit-hash";
import { clientEventSource } from "@app/lib/egress/client";
import datadogLogger from "@app/logger/datadogLogger";
import type { DatadogLogContext } from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type {
  Event as PolyfillEvent,
  MessageEvent as PolyfillMessageEvent,
} from "event-source-polyfill";
import { EventSourcePolyfill } from "event-source-polyfill";

const RECONNECT_DELAY_BASE_MS = 3000;
const RECONNECT_DELAY_JITTER_MS = 5000;
const MAX_RECONNECT_ATTEMPTS = 10;
const HEARTBEAT_TIMEOUT_MS = 5 * 60 * 1000;

type EventSourceLike = Pick<
  EventSourcePolyfill,
  "close" | "onerror" | "onmessage" | "onopen" | "readyState" | "url"
>;

type EventSourceFactory = (
  url: string,
  headers?: Record<string, string>
) => Promise<EventSourceLike>;

type EventSourceManagerOptions = {
  maxReconnectAttempts?: number;
  reconnectDelayBaseMs?: number;
  reconnectDelayJitterMs?: number;
};

export type EventSourceConnectionState =
  | { kind: "idle" }
  | { kind: "connecting"; attempt: number; startedAt: number }
  | { kind: "open"; openedAt: number }
  | {
      kind: "reconnecting";
      attempt: number;
      reconnectAt: number;
    }
  | { kind: "failed"; attempt: number; error: Error }
  | { kind: "terminal" };

type ConnectionConfig = {
  buildURL: (lastEvent: string | null) => string | null;
  headers?: Record<string, string>;
  isTerminalEvent?: (event: string) => boolean;
  replayBufferedEventsOnSubscribe: boolean;
  restartKey: string;
  telemetryContext?: DatadogLogContext;
  workspaceId: string;
};

type Subscriber = {
  onEvent: (event: string) => void;
  onStateChange: (state: EventSourceConnectionState) => void;
  onTerminalError?: (error: Error) => void;
};

type ConnectionEntry = {
  config: ConnectionConfig;
  events: string[];
  generation: number;
  lastEvent: string | null;
  lastEventAt: number | null;
  lastURL: string | null;
  keepAliveWithoutSubscribers: boolean;
  reconnectAttempts: number;
  reconnectTimeout: ReturnType<typeof setTimeout> | null;
  source: EventSourceLike | null;
  state: EventSourceConnectionState;
  subscribers: Set<Subscriber>;
};

async function createEventSource(
  url: string,
  headers?: Record<string, string>
): Promise<EventSourceLike> {
  const urlWithCommitHash = new URL(url, document.baseURI);
  urlWithCommitHash.searchParams.append("commitHash", COMMIT_HASH);
  const path =
    urlWithCommitHash.pathname +
    urlWithCommitHash.search +
    urlWithCommitHash.hash;

  return clientEventSource(path, {
    heartbeatTimeout: HEARTBEAT_TIMEOUT_MS,
    ...(headers ? { headers } : {}),
  });
}

/**
 * @cc [owner:id13,label:architecture;concurrency] one-event-source-per-id
 * A stream id MUST have at most one live EventSource. Every subscriber MUST receive live events in
 * order, plus buffered events when replay is enabled.
 */
/**
 * @cc [owner:id13,label:performance;concurrency] persistent-stream-lifecycle
 * An entry marked `keepAliveWithoutSubscribers` MUST survive with zero subscribers until it reaches
 * a terminal event, exhausts its retry budget, or its workspace is released.
 */
export class EventSourceManager {
  private readonly connections = new Map<string, ConnectionEntry>();
  private isPageWakeRecoveryInstalled = false;
  private readonly maxReconnectAttempts: number;
  private readonly reconnectDelayBaseMs: number;
  private readonly reconnectDelayJitterMs: number;

  constructor(
    private readonly sourceFactory: EventSourceFactory = createEventSource,
    private readonly random: () => number = Math.random,
    options: EventSourceManagerOptions = {}
  ) {
    this.maxReconnectAttempts =
      options.maxReconnectAttempts ?? MAX_RECONNECT_ATTEMPTS;
    this.reconnectDelayBaseMs =
      options.reconnectDelayBaseMs ?? RECONNECT_DELAY_BASE_MS;
    this.reconnectDelayJitterMs =
      options.reconnectDelayJitterMs ?? RECONNECT_DELAY_JITTER_MS;
  }

  subscribe({
    streamId,
    config,
    subscriber,
    keepAliveWithoutSubscribers,
  }: {
    streamId: string;
    config: ConnectionConfig;
    subscriber: Subscriber;
    keepAliveWithoutSubscribers: boolean;
  }): () => void {
    this.installPageWakeRecovery();

    let entry = this.connections.get(streamId);
    if (!entry) {
      entry = this.createEntry(config, keepAliveWithoutSubscribers);
      this.connections.set(streamId, entry);
    } else if (entry.config.restartKey !== config.restartKey) {
      this.restart(entry, config);
    } else {
      entry.config = config;
      entry.keepAliveWithoutSubscribers ||= keepAliveWithoutSubscribers;
    }

    entry.subscribers.add(subscriber);
    subscriber.onStateChange(entry.state);
    if (entry.config.replayBufferedEventsOnSubscribe) {
      for (const event of entry.events) {
        this.notifyEventSubscriber(entry, subscriber, event);
      }
    }
    this.ensureConnected(streamId, entry);

    return () => {
      const current = this.connections.get(streamId);
      if (!current) {
        return;
      }
      current.subscribers.delete(subscriber);
      if (
        current.subscribers.size === 0 &&
        !current.keepAliveWithoutSubscribers
      ) {
        this.destroy(streamId, current);
      }
    };
  }

  /**
   * @cc [owner:id13,label:architecture;concurrency] workspace-stream-cleanup
   * Releasing a workspace MUST close all and only its streams, regardless of telemetry metadata.
   */
  releaseWorkspace(workspaceId: string): void {
    for (const [streamId, entry] of this.connections) {
      if (entry.config.workspaceId === workspaceId) {
        this.destroy(streamId, entry);
      }
    }
  }

  resume(streamId: string): void {
    const entry = this.connections.get(streamId);
    if (!entry || entry.state.kind !== "failed") {
      return;
    }
    entry.keepAliveWithoutSubscribers = true;
    entry.reconnectAttempts = 0;
    this.transition(entry, { kind: "idle" });
    this.ensureConnected(streamId, entry);
  }

  private createEntry(
    config: ConnectionConfig,
    keepAliveWithoutSubscribers: boolean
  ): ConnectionEntry {
    return {
      config,
      events: [],
      generation: 0,
      lastEvent: null,
      lastEventAt: null,
      lastURL: null,
      keepAliveWithoutSubscribers,
      reconnectAttempts: 0,
      reconnectTimeout: null,
      source: null,
      state: { kind: "idle" },
      subscribers: new Set(),
    };
  }

  private restart(entry: ConnectionEntry, config: ConnectionConfig): void {
    entry.generation++;
    const source = entry.source;
    entry.source = null;
    source?.close();
    if (entry.reconnectTimeout) {
      clearTimeout(entry.reconnectTimeout);
      entry.reconnectTimeout = null;
    }
    entry.config = config;
    entry.events = [];
    entry.lastEvent = null;
    entry.lastEventAt = null;
    entry.lastURL = null;
    entry.reconnectAttempts = 0;
    this.transition(entry, { kind: "idle" });
  }

  private ensureConnected(streamId: string, entry: ConnectionEntry): void {
    if (
      entry.source ||
      entry.reconnectTimeout ||
      entry.state.kind === "connecting" ||
      entry.state.kind === "terminal" ||
      entry.state.kind === "failed"
    ) {
      return;
    }
    void this.connect(streamId, entry);
  }

  private async connect(
    streamId: string,
    entry: ConnectionEntry
  ): Promise<void> {
    const url = entry.config.buildURL(entry.lastEvent);
    if (!url) {
      this.markTerminal(streamId, entry);
      return;
    }
    entry.lastURL = url;

    const generation = ++entry.generation;
    this.transition(entry, {
      kind: "connecting",
      attempt: entry.reconnectAttempts + 1,
      startedAt: Date.now(),
    });

    let source: EventSourceLike;
    try {
      source = await this.sourceFactory(url, entry.config.headers);
    } catch (error) {
      if (generation === entry.generation) {
        this.handleFailure(streamId, entry, null, error);
      }
      return;
    }

    if (
      generation !== entry.generation ||
      this.connections.get(streamId) !== entry
    ) {
      source.close();
      return;
    }

    entry.source = source;
    source.onopen = () => {
      if (entry.source !== source) {
        return;
      }
      this.transition(entry, { kind: "open", openedAt: Date.now() });
    };
    source.onmessage = (event: PolyfillMessageEvent) => {
      if (entry.source !== source || typeof event.data !== "string") {
        return;
      }
      if (event.data === "done") {
        this.handleFailure(
          streamId,
          entry,
          source,
          new Error("SSE stream ended before a terminal event.")
        );
        return;
      }

      entry.reconnectAttempts = 0;
      entry.lastEvent = event.data;
      entry.lastEventAt = Date.now();
      if (entry.config.replayBufferedEventsOnSubscribe) {
        entry.events.push(event.data);
      }
      for (const subscriber of entry.subscribers) {
        this.notifyEventSubscriber(entry, subscriber, event.data);
      }

      if (entry.config.isTerminalEvent?.(event.data)) {
        this.markTerminal(streamId, entry);
      }
    };
    source.onerror = (event: PolyfillEvent) => {
      if (entry.source === source) {
        this.handleFailure(streamId, entry, source, event);
      }
    };
  }

  private handleFailure(
    streamId: string,
    entry: ConnectionEntry,
    source: EventSourceLike | null,
    failure: unknown
  ): void {
    const readyState = source?.readyState ?? null;
    entry.source = null;
    source?.close();
    entry.reconnectAttempts++;

    const context = this.telemetryContext({
      streamId,
      entry,
      readyState,
      failure,
    });

    if (entry.reconnectAttempts >= this.maxReconnectAttempts) {
      const error = new Error("Too many SSE connection failures.");
      entry.keepAliveWithoutSubscribers = false;
      this.transition(entry, {
        kind: "failed",
        attempt: entry.reconnectAttempts,
        error,
      });
      datadogLogger.error(
        { ...context, retryBudgetExhausted: true },
        "SSE retry budget exhausted."
      );
      for (const subscriber of entry.subscribers) {
        subscriber.onTerminalError?.(error);
      }
      if (entry.subscribers.size === 0) {
        this.destroy(streamId, entry);
      }
      return;
    }

    datadogLogger.warn(context, "SSE connection failed, reconnecting.");
    const reconnectDelayMs =
      this.reconnectDelayBaseMs + this.random() * this.reconnectDelayJitterMs;
    this.transition(entry, {
      kind: "reconnecting",
      attempt: entry.reconnectAttempts,
      reconnectAt: Date.now() + reconnectDelayMs,
    });
    entry.reconnectTimeout = setTimeout(() => {
      entry.reconnectTimeout = null;
      this.ensureConnected(streamId, entry);
    }, reconnectDelayMs);
  }

  private telemetryContext({
    streamId,
    entry,
    readyState,
    failure,
  }: {
    streamId: string;
    entry: ConnectionEntry;
    readyState: number | null;
    failure: unknown;
  }): DatadogLogContext {
    const now = Date.now();
    return {
      ...entry.config.telemetryContext,
      workspaceId: entry.config.workspaceId,
      streamId,
      connectionState: entry.state.kind,
      reconnectAttempt: entry.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts,
      readyState,
      hasReceivedEvent: entry.lastEvent !== null,
      sourcePath: this.getSourcePath(entry.lastURL),
      msSinceLastEvent:
        entry.lastEventAt === null ? null : now - entry.lastEventAt,
      browserOnline: typeof navigator === "undefined" ? null : navigator.onLine,
      visibilityState:
        typeof document === "undefined" ? null : document.visibilityState,
      pagePath: typeof window === "undefined" ? null : window.location.pathname,
      eventType:
        typeof failure === "object" &&
        failure !== null &&
        "type" in failure &&
        typeof failure.type === "string"
          ? failure.type
          : null,
      error:
        failure instanceof Error
          ? { name: failure.name, message: failure.message }
          : null,
    };
  }

  private getSourcePath(url: string | null): string | null {
    if (!url) {
      return null;
    }
    try {
      return new URL(
        url,
        typeof document === "undefined" ? "https://dust.tt" : document.baseURI
      ).pathname;
    } catch {
      return null;
    }
  }

  private notifyEventSubscriber(
    entry: ConnectionEntry,
    subscriber: Subscriber,
    event: string
  ): void {
    try {
      subscriber.onEvent(event);
    } catch (error) {
      datadogLogger.error(
        {
          ...entry.config.telemetryContext,
          workspaceId: entry.config.workspaceId,
          err: normalizeError(error),
        },
        "SSE subscriber failed to process an event."
      );
    }
  }

  private markTerminal(streamId: string, entry: ConnectionEntry): void {
    entry.generation++;
    const source = entry.source;
    entry.source = null;
    source?.close();
    entry.keepAliveWithoutSubscribers = false;
    if (entry.reconnectTimeout) {
      clearTimeout(entry.reconnectTimeout);
      entry.reconnectTimeout = null;
    }
    this.transition(entry, { kind: "terminal" });
    if (entry.subscribers.size === 0) {
      this.destroy(streamId, entry);
    }
  }

  private transition(
    entry: ConnectionEntry,
    state: EventSourceConnectionState
  ): void {
    entry.state = state;
    for (const subscriber of entry.subscribers) {
      subscriber.onStateChange(state);
    }
  }

  private destroy(streamId: string, entry: ConnectionEntry): void {
    entry.generation++;
    const source = entry.source;
    entry.source = null;
    source?.close();
    if (entry.reconnectTimeout) {
      clearTimeout(entry.reconnectTimeout);
    }
    this.connections.delete(streamId);
  }

  /**
   * A backgrounded page can resume with a closed EventSource but no `onerror` callback. Install
   * one set of browser-session listeners to recover stale streams when the page becomes active.
   * Terminal and retry-exhausted streams remain stopped.
   */
  private installPageWakeRecovery(): void {
    if (this.isPageWakeRecoveryInstalled || typeof window === "undefined") {
      return;
    }
    this.isPageWakeRecoveryInstalled = true;

    const recoverStaleStreams = () => {
      for (const [streamId, entry] of this.connections) {
        if (entry.state.kind === "terminal" || entry.state.kind === "failed") {
          continue;
        }
        if (entry.source?.readyState === EventSourcePolyfill.CLOSED) {
          this.handleFailure(
            streamId,
            entry,
            entry.source,
            new Error("SSE source closed while the page was inactive.")
          );
        } else if (!entry.source && !entry.reconnectTimeout) {
          this.ensureConnected(streamId, entry);
        }
      }
    };
    // Visibility covers returning to a background tab; persisted pageshow covers bfcache restores.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        recoverStaleStreams();
      }
    });
    window.addEventListener("pageshow", (event) => {
      if (event.persisted) {
        recoverStaleStreams();
      }
    });
  }
}

export const eventSourceManager = new EventSourceManager();
