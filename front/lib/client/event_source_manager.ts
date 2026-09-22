import { ManagedEventSourceTransport } from "@app/lib/client/event_source_transport";
import { isSseVerbose } from "@app/lib/client/sse_verbose";
import { COMMIT_HASH } from "@app/lib/commit-hash";
import { clientEventSource, clientFetch } from "@app/lib/egress/client";
import datadogLogger from "@app/logger/datadogLogger";
import type { DatadogLogContext } from "@app/logger/logger";
import type {
  ConnectionConfig,
  EventSourceConnectionState,
  EventSourceFactory,
  EventSourceLike,
  EventSourceManagerOptions,
  LongPollFactory,
  Subscriber,
} from "@app/types/event_source";
import { MANAGED_SSE_HANDSHAKE_EVENT } from "@app/types/sse";
import type {
  Event as PolyfillEvent,
  MessageEvent as PolyfillMessageEvent,
} from "event-source-polyfill";
import { EventSourcePolyfill } from "event-source-polyfill";
import { z } from "zod";

const RECONNECT_DELAY_BASE_MS = 3000;
const RECONNECT_DELAY_JITTER_MS = 5000;
const MAX_RECONNECT_ATTEMPTS = 10;
const RESUME_COOLDOWN_MS = 90_000;
const MAX_UNSUCCESSFUL_RESUMES = 3;
const EMPTY_POLL_DELAY_BASE_MS = 250;
const EMPTY_POLL_DELAY_JITTER_MS = 250;
const HEARTBEAT_TIMEOUT_MS = 5 * 60 * 1000;
const SSE_HANDSHAKE_TIMEOUT_MS = 2_500;
const MIN_HEALTHY_SSE_LIFETIME_MS = 30_000;
const IDLE_CONNECTION_STATE = { kind: "idle" } as const;

const LongPollResponseSchema = z.object({
  events: z.array(z.string()),
});

type KeepAliveState = "inactive" | "active" | "paused";
type BrowserSseHealth = "unknown" | "healthy" | "degraded";
type ActiveTransport =
  | {
      kind: "sse";
      source: EventSourceLike;
      handshakeTimeout: ReturnType<typeof setTimeout> | null;
    }
  | {
      kind: "long_polling";
      controller: AbortController;
    };

type ConnectionEntry = {
  config: ConnectionConfig;
  events: string[];
  generation: number;
  lastEvent: string | null;
  lastEventAt: number | null;
  lastResumeAtMs: number | null;
  lastURL: string | null;
  keepAliveState: KeepAliveState;
  reconnectAttempts: number;
  unsuccessfulResumes: number;
  reconnectTimeout: ReturnType<typeof setTimeout> | null;
  state: EventSourceConnectionState;
  subscribers: Set<Subscriber>;
  transport: ActiveTransport | null;
};

function getClientPath(url: string): string {
  const urlWithCommitHash = new URL(url, document.baseURI);
  urlWithCommitHash.searchParams.append("commitHash", COMMIT_HASH);
  return (
    urlWithCommitHash.pathname +
    urlWithCommitHash.search +
    urlWithCommitHash.hash
  );
}

async function createEventSource(
  url: string,
  headers?: Record<string, string>
): Promise<EventSourceLike> {
  return clientEventSource(getClientPath(url), {
    heartbeatTimeout: HEARTBEAT_TIMEOUT_MS,
    ...(typeof globalThis.fetch === "function" &&
    typeof Response !== "undefined" &&
    "body" in Response.prototype
      ? { Transport: ManagedEventSourceTransport }
      : {}),
    ...(headers ? { headers } : {}),
  });
}

async function createLongPoll(
  url: string,
  { headers, signal }: { headers?: Record<string, string>; signal: AbortSignal }
): Promise<string[]> {
  const response = await clientFetch(getClientPath(url), {
    cache: "no-store",
    headers,
    signal,
  });
  if (!response.ok) {
    throw new Error(`Long poll failed with status ${response.status}.`);
  }
  return LongPollResponseSchema.parse(await response.json()).events;
}

/**
 * @cc [owner:id13,label:architecture;concurrency] one-event-source-per-id
 * A stream id MUST have at most one active transport. Every subscriber MUST receive accepted
 * events in order, plus buffered events when replay is enabled.
 */
/**
 * @cc [owner:id13,label:architecture;concurrency] single-connection-state-machine
 * Stopping, replacing, failing, terminating, or destroying a stream MUST release its active
 * transport before another transport starts.
 */
/**
 * @cc [owner:id13,label:performance;concurrency] persistent-stream-lifecycle
 * An entry with active keepalive MUST survive with zero subscribers until it reaches a terminal
 * event, exhausts its retry budget, pauses on a final blocking event, or its workspace is released.
 */
/**
 * @cc [owner:id13,label:architecture;concurrency] browser-session-sse-fallback
 * After two consecutive pre-handshake failures, fallback-capable streams MUST use long polling for
 * the rest of the browser session. Immediate polling MAY select long polling before any SSE
 * attempt. SSE and long polling MUST NOT run concurrently for one stream.
 */
/**
 * @cc [owner:id13,label:logging;performance] devtools-stream-diagnostics
 * When SSE logging is enabled in the dev console, the manager MUST report connection activity
 * without event payloads, request headers, or URL query parameters. Disabling it MUST stop
 * those diagnostics immediately.
 */
export class EventSourceManager {
  private sseHealth: BrowserSseHealth = "unknown";
  private consecutivePreHandshakeFailures = 0;
  private readonly connections = new Map<string, ConnectionEntry>();
  private readonly stateListeners = new Map<string, Set<() => void>>();
  private isPageWakeRecoveryInstalled = false;
  private readonly handshakeTimeoutMs: number;
  private readonly longPollFactory: LongPollFactory;
  private readonly maxReconnectAttempts: number;
  private readonly reconnectDelayBaseMs: number;
  private readonly reconnectDelayJitterMs: number;

  constructor(
    private readonly sourceFactory: EventSourceFactory = createEventSource,
    private readonly random: () => number = Math.random,
    options: EventSourceManagerOptions = {}
  ) {
    this.handshakeTimeoutMs =
      options.handshakeTimeoutMs ?? SSE_HANDSHAKE_TIMEOUT_MS;
    this.longPollFactory = options.longPollFactory ?? createLongPoll;
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
      this.restart(streamId, config, keepAliveWithoutSubscribers);
      entry = this.connections.get(streamId);
      if (!entry) {
        return () => undefined;
      }
    } else {
      entry.config = config;
      if (
        entry.keepAliveState === "inactive" &&
        keepAliveWithoutSubscribers &&
        entry.state.kind !== "failed" &&
        entry.state.kind !== "terminal"
      ) {
        entry.keepAliveState = "active";
      }
    }

    entry.subscribers.add(subscriber);
    this.logVerbose(streamId, "subscriber_added");
    subscriber.onStateChange(entry.state);
    if (entry.config.replayBufferedEventsOnSubscribe) {
      for (const event of entry.events) {
        this.notifyEventSubscriber(subscriber, event);
      }
    }
    this.ensureConnected(streamId);

    return () => {
      const current = this.connections.get(streamId);
      if (!current) {
        return;
      }
      current.subscribers.delete(subscriber);
      this.logVerbose(streamId, "subscriber_removed");
      if (
        current.subscribers.size === 0 &&
        current.keepAliveState !== "active"
      ) {
        this.destroy(streamId);
      }
    };
  }

  getConnectionState(streamId: string): EventSourceConnectionState {
    const entry = this.connections.get(streamId);
    return entry?.state ?? IDLE_CONNECTION_STATE;
  }

  /**
   * @cc [owner:id13,label:architecture;concurrency] read-only-stream-state-observation
   * Observing stream state MUST NOT create, reconnect, retain, or otherwise change a transport.
   * Missing and destroyed streams MUST read as idle.
   */
  subscribeToConnectionState(
    streamId: string,
    listener: () => void
  ): () => void {
    const listeners = this.stateListeners.get(streamId) ?? new Set();
    listeners.add(listener);
    this.stateListeners.set(streamId, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.stateListeners.delete(streamId);
      }
    };
  }

  /**
   * @cc [owner:id13,label:architecture;concurrency] workspace-stream-cleanup
   * Releasing a workspace MUST close all and only its streams.
   */
  releaseWorkspace(workspaceId: string): void {
    for (const [streamId, entry] of this.connections) {
      if (entry.config.workspaceId === workspaceId) {
        this.destroy(streamId);
      }
    }
  }

  stopKeepingAlive(streamId: string, workspaceId: string): void {
    const entry = this.connections.get(streamId);
    if (!entry || entry.config.workspaceId !== workspaceId) {
      return;
    }
    if (entry.keepAliveState === "active") {
      entry.keepAliveState = "inactive";
    }
    entry.lastResumeAtMs = null;
    entry.unsuccessfulResumes = 0;
    if (entry.subscribers.size === 0) {
      this.destroy(streamId);
    }
  }

  /**
   * @cc [owner:id13,label:performance;concurrency] bounded-registry-resume
   * Refreshes of a continuously listed stream MAY resume it at most once per 90 seconds and at
   * most three times without an accepted event. Removal and re-registration, or a user-requested
   * reconnect, MAY reset these limits.
   */
  resume(streamId: string): void {
    const entry = this.connections.get(streamId);
    if (
      !entry ||
      entry.state.kind !== "failed" ||
      entry.unsuccessfulResumes >= MAX_UNSUCCESSFUL_RESUMES ||
      (entry.lastResumeAtMs !== null &&
        Date.now() - entry.lastResumeAtMs < RESUME_COOLDOWN_MS)
    ) {
      return;
    }
    entry.lastResumeAtMs = Date.now();
    entry.unsuccessfulResumes++;
    if (entry.keepAliveState === "inactive") {
      entry.keepAliveState = "active";
    }
    this.restartFailedConnection(streamId);
  }

  reconnect(streamId: string): void {
    const entry = this.connections.get(streamId);
    if (!entry || entry.state.kind !== "failed") {
      return;
    }
    entry.lastResumeAtMs = null;
    entry.unsuccessfulResumes = 0;
    this.restartFailedConnection(streamId);
  }

  private restartFailedConnection(streamId: string): void {
    const entry = this.connections.get(streamId);
    if (!entry) {
      return;
    }
    entry.reconnectAttempts = 0;
    this.logVerbose(streamId, "resume");
    this.transition(streamId, { kind: "idle" });
    this.ensureConnected(streamId);
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
      lastResumeAtMs: null,
      lastURL: null,
      keepAliveState: keepAliveWithoutSubscribers ? "active" : "inactive",
      reconnectAttempts: 0,
      unsuccessfulResumes: 0,
      reconnectTimeout: null,
      state: { kind: "idle" },
      subscribers: new Set(),
      transport: null,
    };
  }

  private restart(
    streamId: string,
    config: ConnectionConfig,
    keepAliveWithoutSubscribers: boolean
  ): void {
    const entry = this.connections.get(streamId);
    if (!entry) {
      return;
    }
    const hasPendingFactory =
      entry.state.kind === "connecting" && entry.transport === null;
    entry.generation++;
    this.stopTransport(streamId);
    if (entry.reconnectTimeout) {
      clearTimeout(entry.reconnectTimeout);
      entry.reconnectTimeout = null;
    }
    entry.config = config;
    entry.events = [];
    entry.lastEvent = null;
    entry.lastEventAt = null;
    entry.lastURL = null;
    if (entry.keepAliveState === "inactive" && keepAliveWithoutSubscribers) {
      entry.keepAliveState = "active";
    }
    entry.reconnectAttempts = 0;
    if (!hasPendingFactory) {
      this.transition(streamId, { kind: "idle" });
    }
  }

  private ensureConnected(streamId: string): void {
    const entry = this.connections.get(streamId);
    if (!entry) {
      return;
    }
    if (
      entry.transport ||
      entry.reconnectTimeout ||
      entry.state.kind === "connecting" ||
      entry.state.kind === "terminal" ||
      entry.state.kind === "failed"
    ) {
      return;
    }
    if (
      entry.config.buildLongPollURL &&
      (this.sseHealth === "degraded" ||
        entry.config.longPollActivation === "immediate")
    ) {
      this.startLongPolling(streamId);
    } else {
      void this.startSse(streamId);
    }
  }

  /**
   * @cc [owner:id13,label:performance;architecture] sse-health-handshake-proof
   * An SSE connection MUST mark the browser session healthy only after receiving the managed
   * handshake, never from the HTTP open alone.
   */
  private async startSse(streamId: string): Promise<void> {
    const entry = this.connections.get(streamId);
    if (!entry) {
      return;
    }
    const url = entry.config.buildURL(entry.lastEvent);
    if (!url) {
      this.markTerminal(streamId);
      return;
    }
    entry.lastURL = url;

    const generation = ++entry.generation;
    this.logVerbose(streamId, "sse_connect");
    this.transition(streamId, {
      kind: "connecting",
      attempt: entry.reconnectAttempts + 1,
      startedAt: Date.now(),
    });

    let source: EventSourceLike;
    try {
      source = await this.sourceFactory(url, entry.config.headers);
    } catch (error) {
      const current = this.connections.get(streamId);
      if (!current) {
        return;
      }
      if (current === entry && generation === current.generation) {
        this.handleSseDisconnect(streamId, {
          kind: "failure",
          failure: error,
        });
      } else if (current === entry && current.state.kind === "connecting") {
        this.transition(streamId, { kind: "idle" });
        this.ensureConnected(streamId);
      }
      return;
    }

    const current = this.connections.get(streamId);
    if (!current) {
      source.close();
      return;
    }
    if (current !== entry || generation !== current.generation) {
      source.close();
      if (current === entry && current.state.kind === "connecting") {
        this.transition(streamId, { kind: "idle" });
        this.ensureConnected(streamId);
      }
      return;
    }

    const transport: ActiveTransport = {
      kind: "sse",
      source,
      handshakeTimeout: null,
    };
    current.transport = transport;
    transport.handshakeTimeout = setTimeout(() => {
      if (current.transport === transport) {
        this.handleSseDisconnect(streamId, {
          kind: "failure",
          failure: new Error("SSE handshake timed out."),
        });
      }
    }, this.handshakeTimeoutMs);
    source.addEventListener(MANAGED_SSE_HANDSHAKE_EVENT, () => {
      if (
        current.transport !== transport ||
        current.state.kind !== "connecting"
      ) {
        return;
      }
      if (transport.handshakeTimeout) {
        clearTimeout(transport.handshakeTimeout);
        transport.handshakeTimeout = null;
      }
      const openedAt = Date.now();
      const handshakeLatencyMs = openedAt - current.state.startedAt;
      this.consecutivePreHandshakeFailures = 0;
      if (this.sseHealth !== "degraded") {
        this.sseHealth = "healthy";
      }
      this.transition(streamId, { kind: "open", openedAt });
      this.logVerbose(streamId, "sse_handshake", { handshakeLatencyMs });
    });
    source.onmessage = (event: PolyfillMessageEvent) => {
      const active = this.connections.get(streamId);
      if (
        active?.transport !== transport ||
        active.state.kind !== "open" ||
        typeof event.data !== "string"
      ) {
        return;
      }
      if (event.data === "done") {
        const isHealthyRollover =
          active.state.kind === "open" &&
          Date.now() - active.state.openedAt >= MIN_HEALTHY_SSE_LIFETIME_MS;
        this.handleSseDisconnect(
          streamId,
          isHealthyRollover
            ? { kind: "rollover" }
            : {
                kind: "failure",
                failure: new Error("SSE stream ended before a terminal event."),
              }
        );
        return;
      }
      this.acceptEvent(streamId, event.data);
    };
    source.onerror = (event: PolyfillEvent) => {
      if (this.connections.get(streamId)?.transport === transport) {
        this.handleSseDisconnect(streamId, {
          kind: "failure",
          failure: event,
        });
      }
    };
  }

  private handleSseDisconnect(
    streamId: string,
    outcome: { kind: "rollover" } | { kind: "failure"; failure: unknown }
  ): void {
    const entry = this.connections.get(streamId);
    if (!entry) {
      return;
    }
    const isPreHandshake = entry.state.kind === "connecting";
    const readyState =
      entry.transport?.kind === "sse"
        ? entry.transport.source.readyState
        : null;
    this.stopTransport(streamId);
    if (outcome.kind === "failure") {
      entry.reconnectAttempts++;
      if (isPreHandshake) {
        this.consecutivePreHandshakeFailures++;
        if (this.consecutivePreHandshakeFailures >= 2) {
          this.degradeSseHealth(streamId);
        }
      } else if (
        entry.config.buildLongPollURL &&
        entry.reconnectAttempts >= 2
      ) {
        this.degradeSseHealth(streamId);
      }
      this.logVerbose(streamId, "sse_failure", { readyState });

      const context = this.telemetryContext({
        streamId,
        entry,
        readyState,
        failure: outcome.failure,
      });

      if (entry.config.buildLongPollURL && this.sseHealth === "degraded") {
        entry.reconnectAttempts = 0;
        datadogLogger.warn(
          { ...context, fallbackAvailable: true, transport: "sse" },
          "SSE connection failed, switching to long polling."
        );
        this.startLongPolling(streamId);
        return;
      }

      if (entry.reconnectAttempts >= this.maxReconnectAttempts) {
        this.markFailed(
          streamId,
          new Error("Too many SSE connection failures."),
          { ...context, retryBudgetExhausted: true },
          "SSE retry budget exhausted."
        );
        return;
      }

      datadogLogger.warn(context, "SSE connection failed, reconnecting.");
    } else {
      entry.reconnectAttempts = 0;
    }

    this.scheduleReconnect(
      streamId,
      outcome.kind === "rollover" ? "sse_rollover" : "sse_retry"
    );
  }

  private degradeSseHealth(triggeringStreamId: string): void {
    if (this.sseHealth === "degraded") {
      return;
    }
    this.sseHealth = "degraded";
    for (const [streamId, entry] of this.connections) {
      if (
        streamId === triggeringStreamId ||
        !entry.config.buildLongPollURL ||
        entry.state.kind === "failed" ||
        entry.state.kind === "terminal" ||
        entry.transport?.kind === "long_polling"
      ) {
        continue;
      }
      const hasPendingFactory =
        entry.state.kind === "connecting" && entry.transport === null;
      entry.generation++;
      this.stopTransport(streamId);
      if (entry.reconnectTimeout) {
        clearTimeout(entry.reconnectTimeout);
        entry.reconnectTimeout = null;
      }
      entry.reconnectAttempts = 0;
      if (!hasPendingFactory) {
        this.startLongPolling(streamId);
      }
    }
  }

  private startLongPolling(streamId: string): void {
    const entry = this.connections.get(streamId);
    const buildURL = entry?.config.buildLongPollURL;
    if (!entry || !buildURL) {
      return;
    }
    const url = buildURL(entry.lastEvent);
    if (!url) {
      this.markTerminal(streamId);
      return;
    }
    entry.lastURL = url;
    const controller = new AbortController();
    const transport: ActiveTransport = { kind: "long_polling", controller };
    entry.transport = transport;
    if (entry.state.kind !== "long_polling") {
      this.transition(streamId, {
        kind: "long_polling",
        startedAt: Date.now(),
      });
    }

    void this.longPollFactory(url, {
      headers: entry.config.headers,
      signal: controller.signal,
    })
      .then((events) => {
        if (entry.transport !== transport) {
          return;
        }
        if (events.length === 0) {
          this.stopTransport(streamId);
          this.scheduleReconnect(
            streamId,
            "poll_retry",
            EMPTY_POLL_DELAY_BASE_MS +
              this.random() * EMPTY_POLL_DELAY_JITTER_MS
          );
          return;
        }
        entry.reconnectAttempts = 0;
        for (const event of events) {
          this.acceptEvent(streamId, event);
          if (entry.transport !== transport) {
            return;
          }
        }
        this.startLongPolling(streamId);
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted || entry.transport !== transport) {
          return;
        }
        const context = this.telemetryContext({
          streamId,
          entry,
          readyState: null,
          failure,
        });
        this.stopTransport(streamId);
        entry.reconnectAttempts++;
        if (entry.reconnectAttempts >= this.maxReconnectAttempts) {
          this.markFailed(
            streamId,
            new Error("Too many long-poll connection failures."),
            {
              ...context,
              retryBudgetExhausted: true,
              transport: "long_polling",
            },
            "Long-poll retry budget exhausted."
          );
          return;
        }
        datadogLogger.warn(
          { ...context, transport: "long_polling" },
          "Long-poll connection failed, reconnecting."
        );
        this.scheduleReconnect(streamId, "poll_retry");
      });
  }

  private scheduleReconnect(
    streamId: string,
    logEvent: "sse_rollover" | "sse_retry" | "poll_retry",
    delayMs = this.reconnectDelayBaseMs +
      this.random() * this.reconnectDelayJitterMs
  ): void {
    const entry = this.connections.get(streamId);
    if (!entry) {
      return;
    }
    this.logVerbose(streamId, logEvent, { delayMs });
    this.transition(streamId, {
      kind: "reconnecting",
      attempt: entry.reconnectAttempts,
      reconnectAt: Date.now() + delayMs,
    });
    const reconnectTimeout = setTimeout(() => {
      const current = this.connections.get(streamId);
      if (!current || current.reconnectTimeout !== reconnectTimeout) {
        return;
      }
      current.reconnectTimeout = null;
      this.ensureConnected(streamId);
    }, delayMs);
    entry.reconnectTimeout = reconnectTimeout;
  }

  private markFailed(
    streamId: string,
    error: Error,
    context: DatadogLogContext,
    message: string
  ): void {
    const entry = this.connections.get(streamId);
    if (!entry) {
      return;
    }
    if (entry.keepAliveState !== "paused") {
      entry.keepAliveState = "inactive";
    }
    this.transition(streamId, {
      kind: "failed",
      attempt: entry.reconnectAttempts,
      error,
    });
    datadogLogger.error({ ...context, retryBudgetExhausted: true }, message);
    for (const subscriber of entry.subscribers) {
      subscriber.onTerminalError?.(error);
    }
    if (entry.subscribers.size === 0) {
      this.destroy(streamId);
    }
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
      sseHealth: this.sseHealth,
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

  private notifyEventSubscriber(subscriber: Subscriber, event: string): void {
    subscriber.onEvent(event);
  }

  /**
   * @cc [owner:id13,label:concurrency;reliability] blocked-stream-keepalive
   * A final blocking event MUST reach subscribers before keepalive pauses. A paused stream MUST
   * close when its last subscriber leaves, MUST NOT rearm on subscribe, and MUST rearm on the next
   * accepted nonblocking event.
   */
  private acceptEvent(streamId: string, event: string): void {
    const entry = this.connections.get(streamId);
    if (!entry) {
      return;
    }
    const pausesKeepAlive = entry.config.isPauseEvent?.(event) ?? false;
    if (entry.keepAliveState === "paused" && !pausesKeepAlive) {
      entry.keepAliveState = "active";
    }
    entry.reconnectAttempts = 0;
    entry.unsuccessfulResumes = 0;
    entry.lastEvent = event;
    entry.lastEventAt = Date.now();
    this.logVerbose(streamId, "event_received", { eventLength: event.length });
    if (entry.config.replayBufferedEventsOnSubscribe) {
      entry.events.push(event);
    }
    for (const subscriber of entry.subscribers) {
      this.notifyEventSubscriber(subscriber, event);
    }
    if (this.connections.get(streamId) !== entry) {
      return;
    }
    if (entry.config.isTerminalEvent?.(event)) {
      this.markTerminal(streamId);
    } else if (pausesKeepAlive) {
      entry.keepAliveState = "paused";
      if (entry.subscribers.size === 0) {
        this.destroy(streamId);
      }
    }
  }

  private stopTransport(streamId: string): void {
    const entry = this.connections.get(streamId);
    if (!entry) {
      return;
    }
    const transport = entry.transport;
    entry.transport = null;
    if (transport?.kind === "sse") {
      if (transport.handshakeTimeout) {
        clearTimeout(transport.handshakeTimeout);
      }
      transport.source.close();
    } else {
      transport?.controller.abort();
    }
  }

  private markTerminal(streamId: string): void {
    const entry = this.connections.get(streamId);
    if (!entry) {
      return;
    }
    entry.generation++;
    this.stopTransport(streamId);
    entry.keepAliveState = "inactive";
    if (entry.reconnectTimeout) {
      clearTimeout(entry.reconnectTimeout);
      entry.reconnectTimeout = null;
    }
    this.transition(streamId, { kind: "terminal" });
    if (entry.subscribers.size === 0) {
      this.destroy(streamId);
    }
  }

  private transition(
    streamId: string,
    state: EventSourceConnectionState
  ): void {
    const entry = this.connections.get(streamId);
    if (!entry) {
      return;
    }
    const previousState = entry.state.kind;
    entry.state = state;
    this.logVerbose(streamId, "state_change", {
      previousState,
      nextState: state.kind,
    });
    for (const subscriber of entry.subscribers) {
      subscriber.onStateChange(state);
    }
    this.notifyStateListeners(streamId);
  }

  private logVerbose(
    streamId: string,
    event: string,
    details: {
      delayMs?: number;
      eventLength?: number;
      handshakeLatencyMs?: number;
      nextState?: EventSourceConnectionState["kind"];
      previousState?: EventSourceConnectionState["kind"];
      readyState?: number | null;
    } = {}
  ): void {
    const entry = this.connections.get(streamId);
    if (!entry || !isSseVerbose()) {
      return;
    }
    datadogLogger.info(
      {
        event,
        streamId,
        workspaceId: entry.config.workspaceId,
        state: entry.state.kind,
        reconnectAttempts: entry.reconnectAttempts,
        subscriberCount: entry.subscribers.size,
        ...details,
      },
      "[Dust SSE]"
    );
  }

  private destroy(streamId: string): void {
    const entry = this.connections.get(streamId);
    if (!entry) {
      return;
    }
    this.logVerbose(streamId, "destroy");
    entry.generation++;
    this.stopTransport(streamId);
    if (entry.reconnectTimeout) {
      clearTimeout(entry.reconnectTimeout);
    }
    this.connections.delete(streamId);
    this.notifyStateListeners(streamId);
  }

  private notifyStateListeners(streamId: string): void {
    for (const listener of this.stateListeners.get(streamId) ?? []) {
      listener();
    }
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
        const source =
          entry.transport?.kind === "sse" ? entry.transport.source : null;
        if (source?.readyState === EventSourcePolyfill.CLOSED) {
          this.handleSseDisconnect(streamId, {
            kind: "failure",
            failure: new Error(
              "SSE source closed while the page was inactive."
            ),
          });
        } else if (!entry.transport && !entry.reconnectTimeout) {
          this.ensureConnected(streamId);
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
    window.addEventListener("online", recoverStaleStreams);
  }
}

export const eventSourceManager = new EventSourceManager();
