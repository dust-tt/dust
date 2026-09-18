import { ManagedEventSourceTransport } from "@app/lib/client/event_source_transport";
import { isSseVerbose } from "@app/lib/client/sse_verbose";
import { COMMIT_HASH } from "@app/lib/commit-hash";
import { clientEventSource, clientFetch } from "@app/lib/egress/client";
import datadogLogger from "@app/logger/datadogLogger";
import type { DatadogLogContext } from "@app/logger/logger";
import type {
  BrowserSseHealth,
  ConnectionConfig,
  ConnectionEntry,
  EventSourceConnectionState,
  EventSourceFactory,
  EventSourceLike,
  EventSourceManagerOptions,
  LongPollFactory,
  Subscriber,
} from "@app/types/event_source";
import { normalizeError } from "@app/types/shared/utils/error_utils";
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
 * A stream id MUST have at most one live EventSource. Every subscriber MUST receive each accepted
 * event in order, plus buffered events when replay is enabled.
 */
/**
 * @cc [owner:id13,label:performance;concurrency] persistent-stream-lifecycle
 * An entry marked `keepAliveWithoutSubscribers` MUST survive with zero subscribers until it reaches
 * a terminal event, all configured transports exhaust their retry budgets, or its workspace is
 * released.
 */
/**
 * @cc [owner:id13,label:architecture;concurrency] browser-session-sse-fallback
 * The manager MUST mark SSE degraded after two consecutive pre-handshake failures. New
 * fallback-capable streams MUST poll immediately while probing SSE once.
 */
export class EventSourceManager {
  private sseHealth: BrowserSseHealth = "unknown";
  private preHandshakeFailures = 0;
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
   * Releasing a workspace MUST close all and only its streams.
   */
  releaseWorkspace(workspaceId: string): void {
    for (const [streamId, entry] of this.connections) {
      if (entry.config.workspaceId === workspaceId) {
        this.destroy(streamId, entry);
      }
    }
  }

  stopKeepingAlive(streamId: string, workspaceId: string): void {
    const entry = this.connections.get(streamId);
    if (!entry || entry.config.workspaceId !== workspaceId) {
      return;
    }
    entry.keepAliveWithoutSubscribers = false;
    entry.lastResumeAtMs = null;
    entry.unsuccessfulResumes = 0;
    if (entry.subscribers.size === 0) {
      this.destroy(streamId, entry);
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
    entry.keepAliveWithoutSubscribers = true;
    this.restartFailedConnection(streamId, entry);
  }

  reconnect(streamId: string): void {
    const entry = this.connections.get(streamId);
    if (!entry || entry.state.kind !== "failed") {
      return;
    }
    entry.lastResumeAtMs = null;
    entry.unsuccessfulResumes = 0;
    this.restartFailedConnection(streamId, entry);
  }

  private restartFailedConnection(
    streamId: string,
    entry: ConnectionEntry
  ): void {
    entry.longPollAttempts = 0;
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
      lastLongPollURL: null,
      lastProbeAtMs: null,
      lastResumeAtMs: null,
      lastURL: null,
      longPollAttempts: 0,
      longPollState: { kind: "idle" },
      keepAliveWithoutSubscribers,
      reconnectAttempts: 0,
      unsuccessfulResumes: 0,
      seenEventIds: new Set(),
      sseAttemptId: 0,
      sseState: { kind: "idle" },
      state: { kind: "idle" },
      subscribers: new Set(),
    };
  }

  private restart(entry: ConnectionEntry, config: ConnectionConfig): void {
    entry.generation++;
    this.stopSse(entry);
    this.stopLongPolling(entry);
    entry.config = config;
    entry.events = [];
    entry.lastEvent = null;
    entry.lastEventAt = null;
    entry.lastLongPollURL = null;
    entry.lastProbeAtMs = null;
    entry.lastURL = null;
    entry.longPollAttempts = 0;
    entry.reconnectAttempts = 0;
    entry.seenEventIds.clear();
    this.transition(entry, { kind: "idle" });
  }

  private ensureConnected(streamId: string, entry: ConnectionEntry): void {
    if (entry.state.kind === "terminal" || entry.state.kind === "failed") {
      return;
    }

    if (this.sseHealth === "degraded" && this.hasLongPollFallback(entry)) {
      this.startLongPolling(streamId, entry);
    }
    void this.startSse(streamId, entry);
  }

  private async startSse(
    streamId: string,
    entry: ConnectionEntry
  ): Promise<void> {
    if (entry.sseState.kind !== "idle") {
      return;
    }

    const url = entry.config.buildURL(entry.lastEvent);
    if (!url) {
      this.markTerminal(streamId, entry);
      return;
    }
    entry.lastURL = url;
    entry.lastProbeAtMs = Date.now();

    const generation = entry.generation;
    const attemptId = ++entry.sseAttemptId;
    entry.sseState = { kind: "creating", attemptId };
    if (entry.longPollState.kind === "idle") {
      this.transition(entry, {
        kind: "connecting",
        attempt: entry.reconnectAttempts + 1,
        startedAt: Date.now(),
      });
    }

    let source: EventSourceLike;
    try {
      source = await this.sourceFactory(url, entry.config.headers);
    } catch (error) {
      // A newer attempt may have replaced this one while the factory was pending.
      // Only the current attempt may consume retry budget or change stream state.
      if (
        generation === entry.generation &&
        entry.sseState.kind === "creating" &&
        entry.sseState.attemptId === attemptId
      ) {
        this.handlePreHandshakeFailure(streamId, entry, null, error);
      }
      return;
    }

    // Generation and attempt ID reject superseded probes; map identity rejects an
    // entry removed or replaced during the await. Close any stale source.
    if (
      generation !== entry.generation ||
      this.connections.get(streamId) !== entry ||
      entry.sseState.kind !== "creating" ||
      entry.sseState.attemptId !== attemptId
    ) {
      source.close();
      return;
    }

    const timeout = setTimeout(() => {
      if (
        entry.sseState.kind === "awaiting_handshake" &&
        entry.sseState.source === source
      ) {
        this.handlePreHandshakeFailure(
          streamId,
          entry,
          source,
          new Error("SSE handshake timed out.")
        );
      }
    }, this.handshakeTimeoutMs);
    entry.sseState = {
      kind: "awaiting_handshake",
      attemptId,
      source,
      timeout,
    };

    source.addEventListener(MANAGED_SSE_HANDSHAKE_EVENT, () => {
      if (
        entry.sseState.kind !== "awaiting_handshake" ||
        entry.sseState.source !== source
      ) {
        return;
      }
      clearTimeout(entry.sseState.timeout);
      const openedAt = Date.now();
      entry.sseState = { kind: "open", source, openedAt };
      this.preHandshakeFailures = 0;
      this.sseHealth = "healthy";
      this.stopLongPolling(entry);
      this.transition(entry, { kind: "open", openedAt });
    });
    source.onmessage = (event: PolyfillMessageEvent) => {
      if (
        entry.sseState.kind !== "open" ||
        entry.sseState.source !== source ||
        typeof event.data !== "string"
      ) {
        return;
      }
      if (event.data === "done") {
        const isHealthyRollover =
          Date.now() - entry.sseState.openedAt >= MIN_HEALTHY_SSE_LIFETIME_MS;
        const readyState = source.readyState;
        this.stopSse(entry);
        this.scheduleSseReconnect(
          streamId,
          entry,
          isHealthyRollover
            ? { kind: "rollover", readyState }
            : {
                kind: "failure",
                readyState,
                failure: new Error("SSE stream ended before a terminal event."),
              }
        );
        return;
      }
      this.acceptEvent(streamId, entry, event.data);
    };
    source.onerror = (event: PolyfillEvent) => {
      if (
        entry.sseState.kind === "awaiting_handshake" &&
        entry.sseState.source === source
      ) {
        this.handlePreHandshakeFailure(streamId, entry, source, event);
      } else if (
        entry.sseState.kind === "open" &&
        entry.sseState.source === source
      ) {
        this.handleSseFailure(streamId, entry, source, event);
      }
    };
  }

  private handlePreHandshakeFailure(
    streamId: string,
    entry: ConnectionEntry,
    source: EventSourceLike | null,
    failure: unknown
  ): void {
    const readyState = source?.readyState ?? null;
    this.stopSse(entry);
    this.preHandshakeFailures++;
    if (this.preHandshakeFailures >= 2) {
      this.sseHealth = "degraded";
    }

    const hasLongPollFallback = this.hasLongPollFallback(entry);
    datadogLogger.warn(
      {
        ...this.telemetryContext({
          streamId,
          entry,
          readyState,
          failure,
        }),
        fallbackAvailable: hasLongPollFallback,
        handshakeTimeoutMs: this.handshakeTimeoutMs,
        transport: "sse",
      },
      hasLongPollFallback && this.sseHealth === "degraded"
        ? "SSE handshake failed, switching to long polling."
        : "SSE handshake failed, reconnecting."
    );

    if (hasLongPollFallback && this.sseHealth === "degraded") {
      this.startLongPolling(streamId, entry);
    } else {
      this.scheduleSseReconnect(streamId, entry, {
        kind: "failure",
        readyState,
        failure,
      });
    }
  }

  private handleSseFailure(
    streamId: string,
    entry: ConnectionEntry,
    source: EventSourceLike,
    failure: unknown
  ): void {
    const readyState = source.readyState;
    this.stopSse(entry);
    this.scheduleSseReconnect(streamId, entry, {
      kind: "failure",
      readyState,
      failure,
    });
  }

  private scheduleSseReconnect(
    streamId: string,
    entry: ConnectionEntry,
    outcome:
      | { kind: "rollover"; readyState: number | null }
      | { kind: "failure"; readyState: number | null; failure: unknown }
  ): void {
    if (outcome.kind === "rollover") {
      entry.reconnectAttempts = 0;
    } else {
      entry.reconnectAttempts++;
    }
    const context = this.telemetryContext({
      streamId,
      entry,
      readyState: outcome.readyState,
      failure: outcome.kind === "failure" ? outcome.failure : null,
    });

    if (entry.reconnectAttempts >= this.maxReconnectAttempts) {
      this.markFailed(
        streamId,
        entry,
        new Error("Too many SSE connection failures."),
        entry.reconnectAttempts,
        { ...context, retryBudgetExhausted: true },
        "SSE retry budget exhausted."
      );
      return;
    }

    if (outcome.kind === "failure") {
      datadogLogger.warn(context, "SSE connection failed, reconnecting.");
    }
    const reconnectDelayMs = this.getReconnectDelayMs();
    this.transition(entry, {
      kind: "reconnecting",
      attempt: entry.reconnectAttempts,
      reconnectAt: Date.now() + reconnectDelayMs,
    });
    const timeout = setTimeout(() => {
      if (
        entry.sseState.kind !== "retrying" ||
        entry.sseState.timeout !== timeout
      ) {
        return;
      }
      entry.sseState = { kind: "idle" };
      this.ensureConnected(streamId, entry);
    }, reconnectDelayMs);
    entry.sseState = { kind: "retrying", timeout };
  }

  private startLongPolling(streamId: string, entry: ConnectionEntry): void {
    if (
      !this.hasLongPollFallback(entry) ||
      entry.longPollState.kind !== "idle" ||
      entry.state.kind === "terminal" ||
      entry.state.kind === "failed"
    ) {
      return;
    }

    const url = entry.config.buildLongPollURL(entry.lastEvent);
    if (!url) {
      this.markTerminal(streamId, entry);
      return;
    }
    entry.lastLongPollURL = url;

    const generation = entry.generation;
    const controller = new AbortController();
    entry.longPollState = { kind: "requesting", controller };
    if (entry.state.kind !== "long_polling") {
      this.transition(entry, { kind: "long_polling", startedAt: Date.now() });
    }

    void this.longPollFactory(url, {
      headers: entry.config.headers,
      signal: controller.signal,
    }).then(
      (events) => {
        if (
          generation !== entry.generation ||
          this.connections.get(streamId) !== entry ||
          entry.longPollState.kind !== "requesting" ||
          entry.longPollState.controller !== controller
        ) {
          return;
        }
        entry.longPollState = { kind: "idle" };
        if (events.length === 0) {
          this.scheduleLongPollRetry(
            streamId,
            entry,
            new Error("Long poll returned no events."),
            EMPTY_POLL_DELAY_BASE_MS +
              this.random() * EMPTY_POLL_DELAY_JITTER_MS,
            false
          );
          return;
        }
        entry.longPollAttempts = 0;

        for (const event of events) {
          this.acceptEvent(streamId, entry, event);
          if (
            entry.state.kind === "terminal" ||
            this.connections.get(streamId) !== entry
          ) {
            return;
          }
        }
        this.startLongPolling(streamId, entry);
      },
      (failure: unknown) => {
        if (
          generation !== entry.generation ||
          controller.signal.aborted ||
          entry.longPollState.kind !== "requesting" ||
          entry.longPollState.controller !== controller
        ) {
          return;
        }
        entry.longPollState = { kind: "idle" };
        this.scheduleLongPollRetry(streamId, entry, failure);
      }
    );
  }

  private scheduleLongPollRetry(
    streamId: string,
    entry: ConnectionEntry,
    failure: unknown,
    delayMs = this.getReconnectDelayMs(),
    logWarning = true
  ): void {
    entry.longPollAttempts++;
    const context = {
      ...this.telemetryContext({
        streamId,
        entry,
        readyState: null,
        failure,
      }),
      longPollAttempt: entry.longPollAttempts,
      transport: "long_polling",
    };

    if (entry.longPollAttempts >= this.maxReconnectAttempts) {
      this.markFailed(
        streamId,
        entry,
        new Error("Too many long-poll connection failures."),
        entry.longPollAttempts,
        { ...context, retryBudgetExhausted: true },
        "Long-poll retry budget exhausted."
      );
      return;
    }

    if (logWarning) {
      datadogLogger.warn(context, "Long-poll connection failed, retrying.");
    }
    const timeout = setTimeout(() => {
      if (
        entry.longPollState.kind !== "retrying" ||
        entry.longPollState.timeout !== timeout
      ) {
        return;
      }
      entry.longPollState = { kind: "idle" };
      this.startLongPolling(streamId, entry);
    }, delayMs);
    entry.longPollState = { kind: "retrying", timeout };
  }

  private acceptEvent(
    streamId: string,
    entry: ConnectionEntry,
    event: string
  ): void {
    const eventId = entry.config.getEventId?.(event);
    if (eventId && entry.seenEventIds.has(eventId)) {
      return;
    }
    if (eventId) {
      entry.seenEventIds.add(eventId);
    }

    entry.lastEvent = event;
    entry.lastEventAt = Date.now();
    entry.reconnectAttempts = 0;
    entry.unsuccessfulResumes = 0;
    if (entry.config.replayBufferedEventsOnSubscribe) {
      entry.events.push(event);
    }
    for (const subscriber of entry.subscribers) {
      this.notifyEventSubscriber(entry, subscriber, event);
    }

    if (entry.config.isTerminalEvent?.(event)) {
      this.markTerminal(streamId, entry);
    }
  }

  private markFailed(
    streamId: string,
    entry: ConnectionEntry,
    error: Error,
    attempt: number,
    context: DatadogLogContext,
    message: string
  ): void {
    this.stopSse(entry);
    this.stopLongPolling(entry);
    entry.keepAliveWithoutSubscribers = false;
    this.transition(entry, { kind: "failed", attempt, error });
    datadogLogger.error(context, message);
    for (const subscriber of entry.subscribers) {
      subscriber.onTerminalError?.(error);
    }
    if (entry.subscribers.size === 0) {
      this.destroy(streamId, entry);
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
      longPollPath: this.getSourcePath(entry.lastLongPollURL),
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
      getEventId: NonNullable<ConnectionConfig["getEventId"]>;
    };
  } {
    return Boolean(entry.config.buildLongPollURL && entry.config.getEventId);
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
        "Stream subscriber failed to process an event."
      );
    }
  }

  private markTerminal(streamId: string, entry: ConnectionEntry): void {
    entry.generation++;
    this.stopSse(entry);
    this.stopLongPolling(entry);
    entry.keepAliveWithoutSubscribers = false;
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

  private stopSse(entry: ConnectionEntry): void {
    const state = entry.sseState;
    entry.sseAttemptId++;
    entry.sseState = { kind: "idle" };
    switch (state.kind) {
      case "awaiting_handshake":
        clearTimeout(state.timeout);
        state.source.close();
        return;
      case "open":
        state.source.close();
        return;
      case "retrying":
        clearTimeout(state.timeout);
        return;
      case "creating":
      case "idle":
        return;
    }
  }

  private stopLongPolling(entry: ConnectionEntry): void {
    const state = entry.longPollState;
    entry.longPollState = { kind: "idle" };
    switch (state.kind) {
      case "requesting":
        state.controller.abort();
        return;
      case "retrying":
        clearTimeout(state.timeout);
        return;
      case "idle":
        return;
    }
  }

  private destroy(streamId: string, entry: ConnectionEntry): void {
    entry.generation++;
    this.stopSse(entry);
    this.stopLongPolling(entry);
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
        if (
          entry.sseState.kind === "open" &&
          entry.sseState.source.readyState === EventSourcePolyfill.CLOSED
        ) {
          const readyState = entry.sseState.source.readyState;
          this.stopSse(entry);
          this.scheduleSseReconnect(streamId, entry, {
            kind: "failure",
            readyState,
            failure: new Error(
              "SSE source closed while the page was inactive."
            ),
          });
          continue;
        }
        if (
          entry.sseState.kind === "idle" &&
          (entry.lastProbeAtMs === null ||
            Date.now() - entry.lastProbeAtMs >= RESUME_COOLDOWN_MS)
        ) {
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
    window.addEventListener("online", recoverStaleStreams);
  }
}

export const eventSourceManager = new EventSourceManager();
