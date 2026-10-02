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
  LongPollBatch,
  LongPollFactory,
  Subscriber,
} from "@app/types/event_source";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { MANAGED_SSE_HANDSHAKE_EVENT } from "@app/types/sse";
import type {
  Event as PolyfillEvent,
  MessageEvent as PolyfillMessageEvent,
} from "event-source-polyfill";
import { EventSourcePolyfill } from "event-source-polyfill";
import { z } from "zod";

const RECONNECT_DELAY_BASE_MS = 3_000;
const RECONNECT_DELAY_JITTER_MS = 5_000;
const MAX_RECONNECT_ATTEMPTS = 10;
const RESUME_COOLDOWN_MS = 90_000;
const MAX_UNSUCCESSFUL_RESUMES = 3;
const EMPTY_POLL_DELAY_BASE_MS = 250;
const EMPTY_POLL_DELAY_JITTER_MS = 250;
const HEARTBEAT_TIMEOUT_MS = 5 * 60 * 1_000;
const SSE_HANDSHAKE_TIMEOUT_MS = 2_500;
const SSE_FAILURES_BEFORE_FALLBACK = 2;
const ONGOING_LOOP_SILENCE_TIMEOUT_MS = 30_000;
const MIN_HEALTHY_SSE_LIFETIME_MS = 30_000;
const IDLE_CONNECTION_STATE = { kind: "idle" } as const;

const LongPollResponseSchema = z.object({
  events: z.array(z.string()),
  lastEventId: z.string().nullable().optional(),
});

type KeepAliveState = "inactive" | "active" | "paused";
type BrowserSseHealth = "unknown" | "healthy" | "degraded";
type ActiveTransport =
  | {
      kind: "sse";
      source: EventSourceLike;
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
  preferLongPolling: boolean;
  lastResumeAtMs: number | null;
  lastURL: string | null;
  keepAliveState: KeepAliveState;
  reconnectAttempts: number;
  unsuccessfulResumes: number;
  reconnectTimeout: ReturnType<typeof setTimeout> | null;
  pendingSseController: AbortController | null;
  pendingSseHandshakeTimeout: ReturnType<typeof setTimeout> | null;
  state: EventSourceConnectionState;
  subscribers: Set<Subscriber>;
  transport: ActiveTransport | null;
};

// Restarts reuse an entry; destroying and recreating a stream replaces it.
// Both identity and generation must match before old work can continue.
type StreamSnapshot = {
  readonly streamId: string;
  readonly entry: ConnectionEntry;
  readonly generation: number;
};

type SubscriberNotification =
  | { kind: "event"; event: string }
  | { kind: "state"; state: EventSourceConnectionState }
  | { kind: "terminal_error"; error: Error };

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
  headers: Record<string, string> | undefined,
  signal: AbortSignal
): Promise<EventSourceLike> {
  return clientEventSource(
    getClientPath(url),
    {
      heartbeatTimeout: HEARTBEAT_TIMEOUT_MS,
      Transport: ManagedEventSourceTransport,
      ...(headers ? { headers } : {}),
    },
    signal
  );
}

async function createLongPoll(
  url: string,
  { headers, signal }: { headers?: Record<string, string>; signal: AbortSignal }
): Promise<LongPollBatch> {
  const response = await clientFetch(getClientPath(url), {
    cache: "no-store",
    headers,
    signal,
  });
  if (!response.ok) {
    throw new Error(`Long poll failed with status ${response.status}.`);
  }
  return LongPollResponseSchema.parse(await response.json());
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
 * New fallback-capable streams MUST start with SSE while browser-session SSE health is unknown or
 * healthy unless immediate long polling is configured. Once SSE health is degraded, they MUST use
 * long polling for the rest of the browser session. SSE and long polling MUST NOT run concurrently
 * for one stream.
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
  private unsubscribePageWake: (() => void) | null = null;
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

    const entry = this.prepareSubscriptionEntry(
      streamId,
      config,
      keepAliveWithoutSubscribers
    );
    if (!entry) {
      return () => undefined;
    }

    entry.subscribers.add(subscriber);
    this.logVerbose(streamId, "subscriber_added");

    // Subscriber callbacks can synchronously restart or destroy this stream.
    this.notifySubscriber(subscriber, { kind: "state", state: entry.state });
    // Restarts keep this subscriber attached; a replaced entry makes this subscription obsolete.
    if (!this.isRegisteredConnection(streamId, entry)) {
      return () => undefined;
    }

    this.replayBufferedEvents(streamId, entry, subscriber);
    if (!this.isRegisteredConnection(streamId, entry)) {
      return () => undefined;
    }

    if (
      entry.config.buildLongPollURL &&
      entry.config.longPollActivation === "immediate" &&
      (entry.transport?.kind === "sse" || entry.state.kind === "connecting")
    ) {
      this.resetTransport(streamId);
      this.transition(streamId, { kind: "idle" });
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
   * Refreshes of a continuously listed failed stream MAY resume it at most once per 90 seconds and at
   * most three times without an accepted event. Removal and re-registration, or a user-requested
   * reconnect, MAY reset these limits.
   */
  /**
   * @cc [owner:id13,label:concurrency;reliability] silent-ongoing-loop-polling
   * A successful registry refresh MUST switch a listed, nonpaused, fallback-capable SSE stream to polling after
   * 30 seconds without an event since its latest event or handshake. SSE MUST close first, and
   * its cursor and replay buffer MUST be preserved. The stream MUST retain polling across retries
   * and wakeups without marking the browser session degraded or changing other streams.
   */
  resume(streamId: string): void {
    const entry = this.connections.get(streamId);
    if (
      entry?.state.kind === "open" &&
      entry.transport?.kind === "sse" &&
      entry.config.buildLongPollURL &&
      entry.keepAliveState !== "paused" &&
      Date.now() - Math.max(entry.lastEventAt ?? 0, entry.state.openedAt) >=
        ONGOING_LOOP_SILENCE_TIMEOUT_MS
    ) {
      entry.preferLongPolling = true;
      datadogLogger.info(
        this.telemetryContext({
          streamId,
          entry,
          readyState: null,
          failure: null,
        }),
        "Ongoing agent loop is silent over SSE, switching its stream to long polling."
      );
      this.recoverConnection(streamId);
      return;
    }
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
    this.retryFailedConnection(streamId);
  }

  reconnect(streamId: string): void {
    const entry = this.connections.get(streamId);
    if (!entry || entry.state.kind !== "failed") {
      return;
    }
    entry.lastResumeAtMs = null;
    entry.unsuccessfulResumes = 0;
    this.retryFailedConnection(streamId);
  }

  private retryFailedConnection(streamId: string): void {
    const entry = this.connections.get(streamId);
    if (!entry) {
      return;
    }
    entry.reconnectAttempts = 0;
    this.logVerbose(streamId, "resume");
    this.recoverConnection(streamId);
  }

  private prepareSubscriptionEntry(
    streamId: string,
    config: ConnectionConfig,
    keepAliveWithoutSubscribers: boolean
  ): ConnectionEntry | undefined {
    const entry = this.connections.get(streamId);
    if (!entry) {
      const newEntry = this.createEntry(config, keepAliveWithoutSubscribers);
      this.connections.set(streamId, newEntry);
      return newEntry;
    }
    if (
      config.restartKey !== undefined &&
      entry.config.restartKey !== undefined &&
      entry.config.restartKey !== config.restartKey
    ) {
      this.restartForConfigChange(
        streamId,
        config,
        keepAliveWithoutSubscribers
      );
      return this.connections.get(streamId);
    }

    entry.config = {
      ...config,
      restartKey: config.restartKey ?? entry.config.restartKey,
    };
    if (
      entry.keepAliveState === "inactive" &&
      keepAliveWithoutSubscribers &&
      entry.state.kind !== "failed" &&
      entry.state.kind !== "terminal"
    ) {
      entry.keepAliveState = "active";
    }
    return entry;
  }

  private replayBufferedEvents(
    streamId: string,
    entry: ConnectionEntry,
    subscriber: Subscriber
  ): void {
    if (!entry.config.replayBufferedEventsOnSubscribe) {
      return;
    }
    const snapshot = this.captureStreamSnapshot(streamId, entry);
    for (const event of [...entry.events]) {
      if (!this.isStreamSnapshotCurrent(snapshot)) {
        return;
      }
      this.notifySubscriber(subscriber, { kind: "event", event });
    }
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
      preferLongPolling: false,
      lastResumeAtMs: null,
      lastURL: null,
      keepAliveState: keepAliveWithoutSubscribers ? "active" : "inactive",
      reconnectAttempts: 0,
      unsuccessfulResumes: 0,
      reconnectTimeout: null,
      pendingSseController: null,
      pendingSseHandshakeTimeout: null,
      state: { kind: "idle" },
      subscribers: new Set(),
      transport: null,
    };
  }

  private restartForConfigChange(
    streamId: string,
    config: ConnectionConfig,
    keepAliveWithoutSubscribers: boolean
  ): void {
    const entry = this.connections.get(streamId);
    if (!entry) {
      return;
    }
    this.resetTransport(streamId);
    entry.config = config;
    entry.events = [];
    entry.lastEvent = null;
    entry.lastEventAt = null;
    entry.preferLongPolling = false;
    entry.lastURL = null;
    if (entry.keepAliveState === "inactive" && keepAliveWithoutSubscribers) {
      entry.keepAliveState = "active";
    }
    entry.reconnectAttempts = 0;
    this.transition(streamId, { kind: "idle" });
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
    this.startConnection(streamId);
  }

  private startConnection(streamId: string): void {
    const entry = this.connections.get(streamId);
    if (!entry) {
      return;
    }
    if (
      entry.config.buildLongPollURL &&
      (entry.preferLongPolling ||
        this.sseHealth === "degraded" ||
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
  /**
   * @cc [owner:id13,label:concurrency;reliability] sse-setup-handshake-deadline
   * The SSE handshake deadline MUST start before asynchronous source creation and MUST count a
   * stalled source as a pre-handshake failure. Late sources MUST close without replacing a fallback
   * transport; stopping a stream MUST cancel its deadline.
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

    entry.generation++;
    const snapshot = this.captureStreamSnapshot(streamId, entry);
    const controller = new AbortController();
    entry.pendingSseController = controller;
    this.logVerbose(streamId, "sse_connect");
    this.transition(streamId, {
      kind: "connecting",
      attempt: entry.reconnectAttempts + 1,
      startedAt: Date.now(),
    });
    if (controller.signal.aborted) {
      return;
    }
    entry.pendingSseHandshakeTimeout = setTimeout(() => {
      if (
        this.isStreamSnapshotCurrent(snapshot) &&
        entry.state.kind === "connecting"
      ) {
        this.handleSseDisconnect(streamId, {
          kind: "failure",
          failure: new Error("SSE handshake timed out."),
        });
      }
    }, this.handshakeTimeoutMs);

    let source: EventSourceLike;
    try {
      source = await this.sourceFactory(
        url,
        entry.config.headers,
        controller.signal
      );
    } catch (error) {
      if (entry.pendingSseController === controller) {
        entry.pendingSseController = null;
      }
      if (this.isStreamSnapshotCurrent(snapshot)) {
        this.handleSseDisconnect(streamId, {
          kind: "failure",
          failure: error,
        });
      }
      return;
    }

    if (entry.pendingSseController === controller) {
      entry.pendingSseController = null;
    }
    if (!this.isStreamSnapshotCurrent(snapshot) || controller.signal.aborted) {
      source.close();
      return;
    }

    const transport: ActiveTransport = {
      kind: "sse",
      source,
    };
    entry.transport = transport;
    source.addEventListener(MANAGED_SSE_HANDSHAKE_EVENT, () => {
      if (entry.transport !== transport || entry.state.kind !== "connecting") {
        return;
      }
      if (entry.pendingSseHandshakeTimeout) {
        clearTimeout(entry.pendingSseHandshakeTimeout);
        entry.pendingSseHandshakeTimeout = null;
      }
      const openedAt = Date.now();
      const handshakeLatencyMs = openedAt - entry.state.startedAt;
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
    this.resetTransport(streamId);
    if (outcome.kind === "failure") {
      entry.reconnectAttempts++;
      if (isPreHandshake) {
        this.recordPreHandshakeFailure(streamId);
      } else if (
        entry.config.buildLongPollURL &&
        entry.reconnectAttempts >= SSE_FAILURES_BEFORE_FALLBACK
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
      context.transport = "sse";

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

  private recordPreHandshakeFailure(streamId: string): void {
    this.consecutivePreHandshakeFailures++;
    if (this.consecutivePreHandshakeFailures >= SSE_FAILURES_BEFORE_FALLBACK) {
      this.degradeSseHealth(streamId);
    }
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
      entry.reconnectAttempts = 0;
      this.recoverConnection(streamId);
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

    if (entry.transport !== transport || controller.signal.aborted) {
      return;
    }

    void this.longPollFactory(url, {
      headers: entry.config.headers,
      signal: controller.signal,
    })
      .then(({ events, lastEventId }) => {
        if (entry.transport !== transport) {
          return;
        }
        entry.reconnectAttempts = 0;
        if (events.length === 0) {
          if (lastEventId) {
            entry.lastEvent = JSON.stringify({ eventId: lastEventId });
          }
          this.stopTransport(streamId);
          this.scheduleReconnect(
            streamId,
            "poll_retry",
            EMPTY_POLL_DELAY_BASE_MS +
              this.random() * EMPTY_POLL_DELAY_JITTER_MS
          );
          return;
        }
        for (const event of events) {
          this.acceptEvent(streamId, event);
          if (entry.transport !== transport) {
            return;
          }
        }
        if (lastEventId) {
          entry.lastEvent = JSON.stringify({ eventId: lastEventId });
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
    const snapshot = this.captureStreamSnapshot(streamId, entry);
    this.logVerbose(streamId, logEvent, { delayMs });
    this.transition(streamId, {
      kind: "reconnecting",
      attempt: entry.reconnectAttempts,
      reconnectAt: Date.now() + delayMs,
    });
    if (!this.isStreamSnapshotCurrent(snapshot)) {
      return;
    }
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
    const snapshot = this.captureStreamSnapshot(streamId, entry);
    this.transition(streamId, {
      kind: "failed",
      attempt: entry.reconnectAttempts,
      error,
    });
    datadogLogger.error({ ...context, retryBudgetExhausted: true }, message);
    if (
      this.dispatchToSubscribers(snapshot, {
        kind: "terminal_error",
        error,
      }) === "delivered" &&
      entry.subscribers.size === 0
    ) {
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
      conversationId: entry.config.telemetryContext?.conversationId ?? null,
      streamId,
      connectionState: entry.state.kind,
      connectionStateDetails: entry.state,
      transport: entry.transport?.kind ?? null,
      keepAliveState: entry.keepAliveState,
      generation: entry.generation,
      subscriberCount: entry.subscribers.size,
      bufferedEventCount: entry.events.length,
      reconnectAttempt: entry.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts,
      unsuccessfulResumes: entry.unsuccessfulResumes,
      msSinceLastResume:
        entry.lastResumeAtMs === null ? null : now - entry.lastResumeAtMs,
      reconnectScheduled: entry.reconnectTimeout !== null,
      readyState,
      sseHealth: this.sseHealth,
      consecutivePreHandshakeFailures: this.consecutivePreHandshakeFailures,
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
      err: failure,
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

  /**
   * @cc [owner:id13,label:concurrency;error-handling] stream-callback-isolation
   * Exceptions from event, state, and terminal-error callbacks MUST be logged without interrupting
   * delivery to other subscribers or transport cleanup.
   */
  private runSubscriberCallback(callback: () => void): void {
    try {
      callback();
    } catch (error) {
      datadogLogger.error(
        { err: normalizeError(error) },
        "Stream subscriber callback failed."
      );
    }
  }

  private isRegisteredConnection(
    streamId: string,
    entry: ConnectionEntry
  ): boolean {
    return this.connections.get(streamId) === entry;
  }

  private captureStreamSnapshot(
    streamId: string,
    entry: ConnectionEntry
  ): StreamSnapshot {
    return { streamId, entry, generation: entry.generation };
  }

  private isStreamSnapshotCurrent(snapshot: StreamSnapshot): boolean {
    return (
      this.isRegisteredConnection(snapshot.streamId, snapshot.entry) &&
      snapshot.entry.generation === snapshot.generation
    );
  }

  private notifySubscriber(
    subscriber: Subscriber,
    notification: SubscriberNotification
  ): void {
    this.runSubscriberCallback(() => {
      switch (notification.kind) {
        case "event":
          subscriber.onEvent(notification.event);
          break;
        case "state":
          subscriber.onStateChange(notification.state);
          break;
        case "terminal_error":
          subscriber.onTerminalError?.(notification.error);
          break;
        default:
          assertNever(notification);
      }
    });
  }

  /**
   * @cc [owner:id13,label:concurrency] subscriber-dispatch-validity
   * Delivery MUST stop if a callback replaces or resets the stream. State notifications MUST also
   * stop if a callback changes the current state. Subscribers removed during delivery MUST be skipped.
   */
  private dispatchToSubscribers(
    snapshot: StreamSnapshot,
    notification: SubscriberNotification
  ): "delivered" | "superseded" {
    const { entry } = snapshot;
    const isNotificationCurrent = () =>
      this.isStreamSnapshotCurrent(snapshot) &&
      (notification.kind !== "state" || entry.state === notification.state);

    // Callbacks may subscribe, unsubscribe, or restart synchronously. New subscribers
    // receive their initial state and replay through subscribe(), outside this dispatch.
    for (const subscriber of [...entry.subscribers]) {
      if (!isNotificationCurrent()) {
        return "superseded";
      }
      if (entry.subscribers.has(subscriber)) {
        this.notifySubscriber(subscriber, notification);
      }
    }

    // The last callback can also restart the stream. Its caller must not apply
    // the old event's terminal state or cleanup to the replacement stream.
    return isNotificationCurrent() ? "delivered" : "superseded";
  }

  /**
   * @cc [owner:id13,label:concurrency;reliability] blocked-stream-keepalive
   * A final blocking event MUST reach subscribers before keepalive pauses. A paused stream MUST
   * close when its last subscriber leaves, MUST NOT rearm on subscribe, and MUST rearm on the next
   * accepted nonblocking event.
   */
  /**
   * @cc [owner:id13,label:concurrency] stream-event-fanout-isolation
   * A failing subscriber MUST NOT prevent delivery to other subscribers. Restarting or destroying
   * a stream during delivery MUST stop the old dispatch without terminating the replacement stream.
   */
  private acceptEvent(streamId: string, event: string): void {
    const entry = this.connections.get(streamId);
    if (!entry) {
      return;
    }
    const snapshot = this.captureStreamSnapshot(streamId, entry);
    const isTerminalEvent = entry.config.isTerminalEvent?.(event) ?? false;
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
    if (
      this.dispatchToSubscribers(snapshot, { kind: "event", event }) ===
      "superseded"
    ) {
      return;
    }
    if (isTerminalEvent) {
      this.markTerminal(streamId);
    } else if (pausesKeepAlive) {
      entry.keepAliveState = "paused";
      if (entry.subscribers.size === 0) {
        this.destroy(streamId);
      }
    }
  }

  /**
   * @cc [owner:id13,label:concurrency] recovery-preserves-stream-progress
   * Recovering a connection MUST cancel its transport, pending setup, and retry timer before
   * reconnecting. Recovery MUST preserve the cursor, replay buffer, polling preference, and
   * retry budgets; the caller owns any intentional budget reset.
   */
  private recoverConnection(streamId: string): void {
    this.resetTransport(streamId);
    this.startConnection(streamId);
  }

  /**
   * @cc [owner:id13,label:concurrency;reliability] transport-invalidation
   * Invalidating a stream MUST cancel active and pending transports, handshake and reconnect
   * timers, and invalidate callbacks from the previous generation before a replacement starts.
   */
  /**
   * @cc [owner:id13,label:concurrency;reliability] transport-invalidation-preserves-stream
   * Transport invalidation MUST preserve connection state, retry budgets, cursor, replay buffer,
   * keepalive and transport preference; lifecycle callers own changes to those values.
   */
  private resetTransport(streamId: string): void {
    const entry = this.connections.get(streamId);
    if (!entry) {
      return;
    }
    entry.generation++;
    this.stopTransport(streamId);
    if (entry.reconnectTimeout) {
      clearTimeout(entry.reconnectTimeout);
      entry.reconnectTimeout = null;
    }
  }

  private stopTransport(streamId: string): void {
    const entry = this.connections.get(streamId);
    if (!entry) {
      return;
    }
    if (entry.pendingSseHandshakeTimeout) {
      clearTimeout(entry.pendingSseHandshakeTimeout);
      entry.pendingSseHandshakeTimeout = null;
    }
    entry.pendingSseController?.abort();
    entry.pendingSseController = null;
    const transport = entry.transport;
    entry.transport = null;
    if (transport?.kind === "sse") {
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
    this.resetTransport(streamId);
    entry.keepAliveState = "inactive";
    const snapshot = this.captureStreamSnapshot(streamId, entry);
    this.transition(streamId, { kind: "terminal" });
    if (
      this.isStreamSnapshotCurrent(snapshot) &&
      entry.state.kind === "terminal" &&
      entry.subscribers.size === 0
    ) {
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
    const snapshot = this.captureStreamSnapshot(streamId, entry);
    if (
      this.dispatchToSubscribers(snapshot, { kind: "state", state }) ===
      "delivered"
    ) {
      this.notifyStateListeners(streamId);
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
        ...entry.config.telemetryContext,
        event,
        streamId,
        workspaceId: entry.config.workspaceId,
        conversationId: entry.config.telemetryContext?.conversationId ?? null,
        state: entry.state.kind,
        stateDetails: entry.state,
        transport: entry.transport?.kind ?? null,
        keepAliveState: entry.keepAliveState,
        generation: entry.generation,
        sseHealth: this.sseHealth,
        reconnectAttempts: entry.reconnectAttempts,
        unsuccessfulResumes: entry.unsuccessfulResumes,
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
    this.resetTransport(streamId);
    this.connections.delete(streamId);
    if (this.connections.size === 0) {
      this.unsubscribePageWake?.();
      this.unsubscribePageWake = null;
    }
    this.notifyStateListeners(streamId);
  }

  private notifyStateListeners(streamId: string): void {
    for (const listener of [...(this.stateListeners.get(streamId) ?? [])]) {
      this.runSubscriberCallback(listener);
    }
  }

  /**
   * @cc [owner:id13,label:concurrency] page-wake-subscription
   * Returning from a hidden or blurred page and coming online MUST request transport replacement.
   * A subsequent focus event without another inactive period MUST NOT request replacement again.
   * Destroying the last stream MUST remove every installed listener; subscribing again MUST reinstall them.
   */
  private installPageWakeRecovery(): void {
    if (this.unsubscribePageWake || typeof window === "undefined") {
      return;
    }
    let wasInactive = document.visibilityState === "hidden";
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        wasInactive = true;
      } else if (document.visibilityState === "visible") {
        const replaceActiveTransports = wasInactive;
        wasInactive = false;
        this.recoverStreamsAfterWake(replaceActiveTransports);
      }
    };
    const onBlur = () => {
      wasInactive = true;
    };
    const onFocus = () => {
      if (document.visibilityState === "visible") {
        const replaceActiveTransports = wasInactive;
        wasInactive = false;
        this.recoverStreamsAfterWake(replaceActiveTransports);
      }
    };
    const onOnline = () => this.recoverStreamsAfterWake(true);

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);

    this.unsubscribePageWake = () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
    };
  }

  /**
   * @cc [owner:id13,label:concurrency;reliability] wake-resumes-live-streams
   * After an inactive page becomes visible or focused, or network connectivity returns, live
   * streams MUST replace stale transports without resetting their retry budgets.
   * Terminal and failed streams MUST remain stopped.
   */
  private recoverStreamsAfterWake(replaceActiveTransports: boolean): void {
    for (const [streamId, entry] of this.connections) {
      if (entry.state.kind === "terminal" || entry.state.kind === "failed") {
        continue;
      }
      const source =
        entry.transport?.kind === "sse" ? entry.transport.source : null;
      if (
        !replaceActiveTransports &&
        source?.readyState !== EventSourcePolyfill.CLOSED
      ) {
        this.ensureConnected(streamId);
        continue;
      }
      if (entry.state.kind === "connecting" && entry.config.buildLongPollURL) {
        this.recordPreHandshakeFailure(streamId);
      }
      this.logVerbose(streamId, "page_wake_reconnect");
      this.recoverConnection(streamId);
    }
  }
}

export const eventSourceManager = new EventSourceManager();
