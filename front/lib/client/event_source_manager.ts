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
import { assertNever } from "@app/types/shared/utils/assert_never";
import { MANAGED_SSE_HANDSHAKE_EVENT } from "@app/types/sse";
import type {
  Event as PolyfillEvent,
  MessageEvent as PolyfillMessageEvent,
} from "event-source-polyfill";
import { EventSourcePolyfill } from "event-source-polyfill";

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

type ManagedConnectionState =
  | { kind: "idle" }
  | {
      kind: "connecting";
      attempt: number;
      restartKey: string;
      startedAt: number;
    }
  | {
      kind: "awaiting_handshake";
      attempt: number;
      startedAt: number;
      source: EventSourceLike;
      timeout: ReturnType<typeof setTimeout>;
    }
  | { kind: "open"; source: EventSourceLike; openedAt: number }
  | {
      kind: "long_polling";
      startedAt: number;
      controller: AbortController;
    }
  | {
      kind: "reconnecting";
      attempt: number;
      reconnectAt: number;
      timeout: ReturnType<typeof setTimeout>;
    }
  | { kind: "failed"; attempt: number; error: Error }
  | { kind: "terminal" };

type KeepAliveState = "inactive" | "active" | "paused";
type BrowserSseHealth = "unknown" | "healthy" | "degraded";

type ConnectionEntry = {
  config: ConnectionConfig;
  events: string[];
  lastEvent: string | null;
  lastEventAt: number | null;
  lastResumeAtMs: number | null;
  lastURL: string | null;
  keepAliveState: KeepAliveState;
  retryAttempts: number;
  state: ManagedConnectionState;
  unsuccessfulResumes: number;
  subscribers: Set<Subscriber>;
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

function isLongPollResponse(value: unknown): value is { events: string[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    "events" in value &&
    Array.isArray(value.events) &&
    value.events.every((event) => typeof event === "string")
  );
}

function getErrorDetails(
  failure: unknown
): { name: string; message: string } | null {
  if (
    typeof failure !== "object" ||
    failure === null ||
    !("name" in failure) ||
    typeof failure.name !== "string" ||
    !("message" in failure) ||
    typeof failure.message !== "string"
  ) {
    return null;
  }
  return { name: failure.name, message: failure.message };
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

  const body: unknown = await response.json();
  if (!isLongPollResponse(body)) {
    throw new Error("Long poll returned an invalid response.");
  }
  return body.events;
}

/**
 * @cc [owner:id13,label:architecture;concurrency] one-event-source-per-id
 * A stream id MUST have at most one active transport. Every subscriber MUST receive accepted
 * events in order, plus buffered events when replay is enabled.
 */
/**
 * @cc [owner:id13,label:architecture;concurrency] single-connection-state-machine
 * Stopping, replacing, failing, terminating, or destroying a stream MUST release its active
 * transport resource before another transport starts.
 */
/**
 * @cc [owner:id13,label:performance;concurrency] persistent-stream-lifecycle
 * An entry with active keepalive MUST survive with zero subscribers until it reaches a terminal
 * event, exhausts its retry budget, pauses on a final blocking event, or its workspace is released.
 */
/**
 * @cc [owner:id13,label:architecture;concurrency] browser-session-sse-fallback
 * After two consecutive pre-handshake failures, fallback-capable streams MUST use long polling for
 * the rest of the browser session. SSE and long polling MUST NOT run concurrently for one stream.
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
      this.restart(streamId, config);
    } else {
      entry.config = config;
    }
    if (
      entry.keepAliveState === "inactive" &&
      keepAliveWithoutSubscribers &&
      entry.state.kind !== "failed" &&
      entry.state.kind !== "terminal"
    ) {
      entry.keepAliveState = "active";
    }

    entry.subscribers.add(subscriber);
    this.logVerbose(streamId, "subscriber_added");
    subscriber.onStateChange(this.toPublicState(entry.state));
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
    entry.retryAttempts = 0;
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
      lastEvent: null,
      lastEventAt: null,
      lastResumeAtMs: null,
      lastURL: null,
      keepAliveState: keepAliveWithoutSubscribers ? "active" : "inactive",
      retryAttempts: 0,
      state: { kind: "idle" },
      unsuccessfulResumes: 0,
      subscribers: new Set(),
    };
  }

  private restart(streamId: string, config: ConnectionConfig): void {
    const entry = this.connections.get(streamId);
    if (!entry) {
      return;
    }
    const isConnecting = entry.state.kind === "connecting";
    if (!isConnecting) {
      this.stop(streamId);
    }
    entry.config = config;
    entry.events = [];
    entry.lastEvent = null;
    entry.lastEventAt = null;
    entry.lastURL = null;
    entry.retryAttempts = 0;
    if (!isConnecting) {
      this.transition(streamId, { kind: "idle" });
    }
  }

  private ensureConnected(streamId: string): void {
    const entry = this.connections.get(streamId);
    if (!entry) {
      return;
    }
    if (entry.state.kind !== "idle") {
      return;
    }
    if (this.sseHealth === "degraded" && this.hasLongPollFallback(entry)) {
      this.startLongPolling(streamId);
    } else {
      void this.startSse(streamId).catch((failure: unknown) => {
        const current = this.connections.get(streamId);
        if (
          !current ||
          (current.state.kind !== "connecting" &&
            current.state.kind !== "awaiting_handshake")
        ) {
          return;
        }
        this.handlePreHandshakeFailure(
          streamId,
          current.state.kind === "awaiting_handshake"
            ? current.state.source
            : null,
          failure
        );
      });
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
    if (entry.state.kind !== "idle") {
      return;
    }
    const url = entry.config.buildURL(entry.lastEvent);
    if (!url) {
      this.markTerminal(streamId);
      return;
    }
    entry.lastURL = url;

    const attempt = entry.retryAttempts + 1;
    const startedAt = Date.now();
    const connectingState: ManagedConnectionState = {
      kind: "connecting",
      attempt,
      restartKey: entry.config.restartKey,
      startedAt,
    };
    this.logVerbose(streamId, "sse_connect");
    this.transition(streamId, connectingState);

    let source: EventSourceLike;
    try {
      source = await this.sourceFactory(url, entry.config.headers);
    } catch (failure) {
      const current = this.connections.get(streamId);
      if (current === entry && current.state === connectingState) {
        if (entry.config.restartKey === connectingState.restartKey) {
          this.handlePreHandshakeFailure(streamId, null, failure);
        } else {
          this.transition(streamId, { kind: "idle" });
          this.ensureConnected(streamId);
        }
      }
      return;
    }

    const current = this.connections.get(streamId);
    if (current !== entry || current.state !== connectingState) {
      source.close();
      return;
    }
    if (current.config.restartKey !== connectingState.restartKey) {
      source.close();
      this.transition(streamId, { kind: "idle" });
      this.ensureConnected(streamId);
      return;
    }

    const timeout = setTimeout(() => {
      if (
        entry.state.kind === "awaiting_handshake" &&
        entry.state.source === source
      ) {
        this.handlePreHandshakeFailure(
          streamId,
          source,
          new Error("SSE handshake timed out.")
        );
      }
    }, this.handshakeTimeoutMs);
    this.transition(streamId, {
      kind: "awaiting_handshake",
      attempt,
      startedAt,
      source,
      timeout,
    });

    source.addEventListener(MANAGED_SSE_HANDSHAKE_EVENT, () => {
      if (
        entry.state.kind !== "awaiting_handshake" ||
        entry.state.source !== source
      ) {
        return;
      }
      clearTimeout(entry.state.timeout);
      const openedAt = Date.now();
      const handshakeLatencyMs = openedAt - entry.state.startedAt;
      this.consecutivePreHandshakeFailures = 0;
      if (this.sseHealth !== "degraded") {
        this.sseHealth = "healthy";
      }
      this.transition(streamId, { kind: "open", source, openedAt });
      this.logVerbose(streamId, "sse_handshake", { handshakeLatencyMs });
    });
    source.onmessage = (event: PolyfillMessageEvent) => {
      if (
        entry.state.kind !== "open" ||
        entry.state.source !== source ||
        typeof event.data !== "string"
      ) {
        return;
      }
      if (event.data === "done") {
        const isHealthyRollover =
          Date.now() - entry.state.openedAt >= MIN_HEALTHY_SSE_LIFETIME_MS;
        const readyState = source.readyState;
        this.stop(streamId);
        if (isHealthyRollover) {
          entry.retryAttempts = 0;
        }
        this.scheduleReconnect(streamId, {
          transport: "sse",
          readyState,
          failure: isHealthyRollover
            ? null
            : new Error("SSE stream ended before a terminal event."),
          countsAgainstBudget: !isHealthyRollover,
        });
        return;
      }
      this.acceptEvent(streamId, event.data);
    };
    source.onerror = (failure: PolyfillEvent) => {
      if (
        entry.state.kind === "awaiting_handshake" &&
        entry.state.source === source
      ) {
        this.handlePreHandshakeFailure(streamId, source, failure);
      } else if (entry.state.kind === "open" && entry.state.source === source) {
        this.handleSseFailure(streamId, source, failure);
      }
    };
  }

  private handlePreHandshakeFailure(
    streamId: string,
    source: EventSourceLike | null,
    failure: unknown
  ): void {
    const entry = this.connections.get(streamId);
    if (!entry) {
      return;
    }
    const readyState = source?.readyState ?? null;
    this.stop(streamId);
    this.logVerbose(streamId, "sse_failure", { readyState });
    this.consecutivePreHandshakeFailures++;
    if (this.consecutivePreHandshakeFailures >= 2) {
      this.sseHealth = "degraded";
    }

    const fallbackAvailable = this.hasLongPollFallback(entry);
    datadogLogger.warn(
      {
        ...this.telemetryContext({ streamId, entry, readyState, failure }),
        fallbackAvailable,
        handshakeTimeoutMs: this.handshakeTimeoutMs,
        transport: "sse",
      },
      fallbackAvailable && this.sseHealth === "degraded"
        ? "SSE handshake failed, switching to long polling."
        : "SSE handshake failed, reconnecting."
    );

    if (fallbackAvailable && this.sseHealth === "degraded") {
      entry.retryAttempts = 0;
      this.startLongPolling(streamId);
    } else {
      this.scheduleReconnect(streamId, {
        transport: "sse",
        readyState,
        failure,
        countsAgainstBudget: true,
      });
    }
  }

  private handleSseFailure(
    streamId: string,
    source: EventSourceLike,
    failure: unknown
  ): void {
    const entry = this.connections.get(streamId);
    if (!entry) {
      return;
    }
    const readyState = source.readyState;
    this.stop(streamId);
    this.logVerbose(streamId, "sse_failure", { readyState });
    if (this.hasLongPollFallback(entry) && entry.retryAttempts >= 1) {
      this.sseHealth = "degraded";
      entry.retryAttempts = 0;
      datadogLogger.warn(
        {
          ...this.telemetryContext({ streamId, entry, readyState, failure }),
          fallbackAvailable: true,
          transport: "sse",
        },
        "SSE failed after handshake twice, switching to long polling."
      );
      this.startLongPolling(streamId);
      return;
    }
    this.scheduleReconnect(streamId, {
      transport: "sse",
      readyState,
      failure,
      countsAgainstBudget: true,
    });
  }

  private startLongPolling(streamId: string): void {
    const entry = this.connections.get(streamId);
    if (!entry) {
      return;
    }
    if (
      !this.hasLongPollFallback(entry) ||
      (entry.state.kind !== "idle" && entry.state.kind !== "long_polling")
    ) {
      return;
    }
    const url = entry.config.buildLongPollURL(entry.lastEvent);
    if (!url) {
      this.markTerminal(streamId);
      return;
    }
    entry.lastURL = url;

    const previousState = entry.state;
    const controller = new AbortController();
    const pollingState: ManagedConnectionState = {
      kind: "long_polling",
      startedAt:
        previousState.kind === "long_polling"
          ? previousState.startedAt
          : Date.now(),
      controller,
    };
    if (previousState.kind === "long_polling") {
      entry.state = pollingState;
    } else {
      this.transition(streamId, pollingState);
    }

    void this.longPollFactory(url, {
      headers: entry.config.headers,
      signal: controller.signal,
    })
      .then((events) => {
        if (
          this.connections.get(streamId) !== entry ||
          entry.state !== pollingState
        ) {
          return;
        }
        if (events.length === 0) {
          this.scheduleReconnect(streamId, {
            transport: "long_polling",
            readyState: null,
            failure: null,
            countsAgainstBudget: false,
            delayMs:
              EMPTY_POLL_DELAY_BASE_MS +
              this.random() * EMPTY_POLL_DELAY_JITTER_MS,
            logWarning: false,
          });
          return;
        }

        entry.retryAttempts = 0;
        for (const event of events) {
          this.acceptEvent(streamId, event);
          if (
            this.connections.get(streamId) !== entry ||
            entry.state !== pollingState
          ) {
            return;
          }
        }
        this.startLongPolling(streamId);
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted || entry.state !== pollingState) {
          return;
        }
        this.scheduleReconnect(streamId, {
          transport: "long_polling",
          readyState: null,
          failure,
          countsAgainstBudget: true,
        });
      });
  }

  private scheduleReconnect(
    streamId: string,
    {
      transport,
      readyState,
      failure,
      countsAgainstBudget,
      delayMs = this.getReconnectDelayMs(),
      logWarning = true,
    }: {
      transport: "sse" | "long_polling";
      readyState: number | null;
      failure: unknown;
      countsAgainstBudget: boolean;
      delayMs?: number;
      logWarning?: boolean;
    }
  ): void {
    const entry = this.connections.get(streamId);
    if (!entry) {
      return;
    }
    this.stop(streamId);
    if (countsAgainstBudget) {
      entry.retryAttempts++;
    }
    this.logVerbose(
      streamId,
      transport === "sse" ? "sse_retry" : "poll_retry",
      { delayMs }
    );
    const context = {
      ...this.telemetryContext({ streamId, entry, readyState, failure }),
      transport,
    };
    if (entry.retryAttempts >= this.maxReconnectAttempts) {
      const isLongPolling = transport === "long_polling";
      this.markFailed(
        streamId,
        new Error(
          isLongPolling
            ? "Too many long-poll connection failures."
            : "Too many SSE connection failures."
        ),
        entry.retryAttempts,
        { ...context, retryBudgetExhausted: true },
        isLongPolling
          ? "Long-poll retry budget exhausted."
          : "SSE retry budget exhausted."
      );
      return;
    }
    if (logWarning && failure !== null) {
      datadogLogger.warn(
        context,
        transport === "long_polling"
          ? "Long-poll connection failed, reconnecting."
          : "SSE connection failed, reconnecting."
      );
    }

    const reconnectAt = Date.now() + delayMs;
    const timeout = setTimeout(() => {
      if (
        entry.state.kind !== "reconnecting" ||
        entry.state.timeout !== timeout
      ) {
        return;
      }
      entry.state = { kind: "idle" };
      this.ensureConnected(streamId);
    }, delayMs);
    this.transition(streamId, {
      kind: "reconnecting",
      attempt: entry.retryAttempts,
      reconnectAt,
      timeout,
    });
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

    entry.lastEvent = event;
    entry.lastEventAt = Date.now();
    entry.retryAttempts = 0;
    entry.unsuccessfulResumes = 0;
    this.logVerbose(streamId, "event_received", {
      eventLength: event.length,
    });
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
      this.logVerbose(streamId, "keepalive_paused");
      if (entry.subscribers.size === 0) {
        this.destroy(streamId);
      }
    }
  }

  private markFailed(
    streamId: string,
    error: Error,
    attempt: number,
    context: DatadogLogContext,
    message: string
  ): void {
    const entry = this.connections.get(streamId);
    if (!entry) {
      return;
    }
    this.stop(streamId);
    if (entry.keepAliveState !== "paused") {
      entry.keepAliveState = "inactive";
    }
    this.transition(streamId, { kind: "failed", attempt, error });
    datadogLogger.error(context, message);
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
      connectionState: this.toPublicState(entry.state).kind,
      reconnectAttempt: entry.retryAttempts,
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
      error: getErrorDetails(failure),
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

  private getReconnectDelayMs(): number {
    return (
      this.reconnectDelayBaseMs + this.random() * this.reconnectDelayJitterMs
    );
  }

  private hasLongPollFallback(
    entry: ConnectionEntry
  ): entry is ConnectionEntry & {
    config: ConnectionConfig & {
      buildLongPollURL: NonNullable<ConnectionConfig["buildLongPollURL"]>;
    };
  } {
    return Boolean(entry.config.buildLongPollURL);
  }

  private notifyEventSubscriber(subscriber: Subscriber, event: string): void {
    subscriber.onEvent(event);
  }

  private markTerminal(streamId: string): void {
    const entry = this.connections.get(streamId);
    if (!entry) {
      return;
    }
    this.stop(streamId);
    entry.keepAliveState = "inactive";
    this.transition(streamId, { kind: "terminal" });
    if (entry.subscribers.size === 0) {
      this.destroy(streamId);
    }
  }

  private toPublicState(
    state: ManagedConnectionState
  ): EventSourceConnectionState {
    switch (state.kind) {
      case "idle":
        return state;
      case "connecting":
      case "awaiting_handshake":
        return {
          kind: "connecting",
          attempt: state.attempt,
          startedAt: state.startedAt,
        };
      case "open":
        return { kind: "open", openedAt: state.openedAt };
      case "long_polling":
        return { kind: "long_polling", startedAt: state.startedAt };
      case "reconnecting":
        return {
          kind: "reconnecting",
          attempt: state.attempt,
          reconnectAt: state.reconnectAt,
        };
      case "failed":
      case "terminal":
        return state;
      default:
        return assertNever(state);
    }
  }

  private transition(streamId: string, state: ManagedConnectionState): void {
    const entry = this.connections.get(streamId);
    if (!entry) {
      return;
    }
    const previousState = entry.state.kind;
    entry.state = state;
    const publicState = this.toPublicState(state);
    this.logVerbose(streamId, "state_change", {
      nextState: publicState.kind,
      previousState,
    });
    for (const subscriber of entry.subscribers) {
      subscriber.onStateChange(publicState);
    }
  }

  private stop(streamId: string): void {
    const entry = this.connections.get(streamId);
    if (!entry) {
      return;
    }
    const state = entry.state;
    entry.state = { kind: "idle" };
    switch (state.kind) {
      case "awaiting_handshake":
        clearTimeout(state.timeout);
        state.source.close();
        return;
      case "open":
        state.source.close();
        return;
      case "long_polling":
        state.controller.abort();
        return;
      case "reconnecting":
        clearTimeout(state.timeout);
        return;
      case "connecting":
      case "failed":
      case "idle":
      case "terminal":
        return;
      default:
        return assertNever(state);
    }
  }

  private logVerbose(
    streamId: string,
    event: string,
    details: {
      delayMs?: number;
      eventLength?: number;
      handshakeLatencyMs?: number;
      nextState?: EventSourceConnectionState["kind"];
      previousState?: ManagedConnectionState["kind"];
      readyState?: number | null;
    } = {}
  ): void {
    const entry = this.connections.get(streamId);
    if (!entry || !isSseVerbose()) {
      return;
    }
    console.info("[Dust SSE]", {
      event,
      streamId,
      workspaceId: entry.config.workspaceId,
      state: this.toPublicState(entry.state).kind,
      reconnectAttempts: entry.retryAttempts,
      subscriberCount: entry.subscribers.size,
      ...details,
    });
  }

  private destroy(streamId: string): void {
    if (!this.connections.has(streamId)) {
      return;
    }
    this.logVerbose(streamId, "destroy");
    this.stop(streamId);
    this.connections.delete(streamId);
  }

  private installPageWakeRecovery(): void {
    if (this.isPageWakeRecoveryInstalled || typeof window === "undefined") {
      return;
    }
    this.isPageWakeRecoveryInstalled = true;

    const recoverStaleStreams = () => {
      for (const [streamId, entry] of this.connections) {
        if (
          entry.state.kind === "open" &&
          entry.state.source.readyState === EventSourcePolyfill.CLOSED
        ) {
          const readyState = entry.state.source.readyState;
          this.stop(streamId);
          this.scheduleReconnect(streamId, {
            transport: "sse",
            readyState,
            failure: new Error(
              "SSE source closed while the page was inactive."
            ),
            countsAgainstBudget: true,
          });
        }
      }
    };
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
