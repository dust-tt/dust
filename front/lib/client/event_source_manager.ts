import { ManagedEventSourceTransport } from "@app/lib/client/event_source_transport";
import { isSseVerbose } from "@app/lib/client/sse_verbose";
import { COMMIT_HASH } from "@app/lib/commit-hash";
import { clientEventSource } from "@app/lib/egress/client";
import datadogLogger from "@app/logger/datadogLogger";
import type { DatadogLogContext } from "@app/logger/logger";
import type {
  ConnectionConfig,
  ConnectionEntry,
  EventSourceConnectionState,
  EventSourceFactory,
  EventSourceLike,
  EventSourceManagerOptions,
  Subscriber,
} from "@app/types/event_source";
import { normalizeError } from "@app/types/shared/utils/error_utils";
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
const HEARTBEAT_TIMEOUT_MS = 5 * 60 * 1000;
const MIN_HEALTHY_SSE_LIFETIME_MS = 30_000;

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
    ...(typeof globalThis.fetch === "function" &&
    typeof Response !== "undefined" &&
    "body" in Response.prototype
      ? { Transport: ManagedEventSourceTransport }
      : {}),
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
/**
 * @cc [owner:id13,label:logging;performance] devtools-stream-diagnostics
 * When SSE logging is enabled in the dev console, the manager MUST report connection activity
 * without event payloads, request headers, or URL query parameters. Disabling it MUST stop
 * those diagnostics immediately.
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
      this.restart(streamId, entry, config);
    } else {
      entry.config = config;
      entry.keepAliveWithoutSubscribers ||= keepAliveWithoutSubscribers;
    }

    entry.subscribers.add(subscriber);
    this.logVerbose(streamId, entry, "subscriber_added");
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
      this.logVerbose(streamId, current, "subscriber_removed");
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
    entry.reconnectAttempts = 0;
    this.logVerbose(streamId, entry, "resume");
    this.transition(streamId, entry, { kind: "idle" });
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
      lastResumeAtMs: null,
      lastURL: null,
      keepAliveWithoutSubscribers,
      reconnectAttempts: 0,
      unsuccessfulResumes: 0,
      reconnectTimeout: null,
      source: null,
      state: { kind: "idle" },
      subscribers: new Set(),
    };
  }

  private restart(
    streamId: string,
    entry: ConnectionEntry,
    config: ConnectionConfig
  ): void {
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
    entry.lastResumeAtMs = null;
    entry.lastURL = null;
    entry.reconnectAttempts = 0;
    entry.unsuccessfulResumes = 0;
    this.transition(streamId, entry, { kind: "idle" });
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
    this.logVerbose(streamId, entry, "sse_connect");
    this.transition(streamId, entry, {
      kind: "connecting",
      attempt: entry.reconnectAttempts + 1,
      startedAt: Date.now(),
    });

    let source: EventSourceLike;
    try {
      source = await this.sourceFactory(url, entry.config.headers);
    } catch (error) {
      // A newer attempt may have replaced this one while the factory was pending.
      // Only the current attempt may consume retry budget or change stream state.
      if (generation === entry.generation) {
        this.handleDisconnect(streamId, entry, null, {
          kind: "failure",
          failure: error,
        });
      }
      return;
    }

    // Generation rejects an older attempt on this entry; map identity rejects an
    // entry removed or replaced during the await. Close either stale source.
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
      this.transition(streamId, entry, { kind: "open", openedAt: Date.now() });
    };
    source.onmessage = (event: PolyfillMessageEvent) => {
      if (entry.source !== source || typeof event.data !== "string") {
        return;
      }
      if (event.data === "done") {
        const isHealthyRollover =
          entry.state.kind === "open" &&
          Date.now() - entry.state.openedAt >= MIN_HEALTHY_SSE_LIFETIME_MS;
        this.handleDisconnect(
          streamId,
          entry,
          source,
          isHealthyRollover
            ? { kind: "rollover" }
            : {
                kind: "failure",
                failure: new Error("SSE stream ended before a terminal event."),
              }
        );
        return;
      }

      entry.reconnectAttempts = 0;
      entry.unsuccessfulResumes = 0;
      entry.lastEvent = event.data;
      entry.lastEventAt = Date.now();
      this.logVerbose(streamId, entry, "event_received", {
        eventLength: event.data.length,
      });
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
        this.handleDisconnect(streamId, entry, source, {
          kind: "failure",
          failure: event,
        });
      }
    };
  }

  private handleDisconnect(
    streamId: string,
    entry: ConnectionEntry,
    source: EventSourceLike | null,
    outcome: { kind: "rollover" } | { kind: "failure"; failure: unknown }
  ): void {
    const readyState = source?.readyState ?? null;
    entry.source = null;
    source?.close();
    if (outcome.kind === "failure") {
      entry.reconnectAttempts++;
      this.logVerbose(streamId, entry, "sse_failure", { readyState });

      const context = this.telemetryContext({
        streamId,
        entry,
        readyState,
        failure: outcome.failure,
      });

      if (entry.reconnectAttempts >= this.maxReconnectAttempts) {
        const error = new Error("Too many SSE connection failures.");
        entry.keepAliveWithoutSubscribers = false;
        this.transition(streamId, entry, {
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
    } else {
      entry.reconnectAttempts = 0;
    }

    const reconnectDelayMs =
      this.reconnectDelayBaseMs + this.random() * this.reconnectDelayJitterMs;
    this.logVerbose(
      streamId,
      entry,
      outcome.kind === "rollover" ? "sse_rollover" : "sse_retry",
      {
        delayMs: reconnectDelayMs,
      }
    );
    this.transition(streamId, entry, {
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
    this.transition(streamId, entry, { kind: "terminal" });
    if (entry.subscribers.size === 0) {
      this.destroy(streamId, entry);
    }
  }

  private transition(
    streamId: string,
    entry: ConnectionEntry,
    state: EventSourceConnectionState
  ): void {
    const previousState = entry.state.kind;
    entry.state = state;
    this.logVerbose(streamId, entry, "state_change", {
      previousState,
      nextState: state.kind,
    });
    for (const subscriber of entry.subscribers) {
      subscriber.onStateChange(state);
    }
  }

  private logVerbose(
    streamId: string,
    entry: ConnectionEntry,
    event: string,
    details: {
      delayMs?: number;
      eventLength?: number;
      nextState?: EventSourceConnectionState["kind"];
      previousState?: EventSourceConnectionState["kind"];
      readyState?: number | null;
    } = {}
  ): void {
    if (!isSseVerbose()) {
      return;
    }
    console.info("[Dust SSE]", {
      event,
      streamId,
      workspaceId: entry.config.workspaceId,
      state: entry.state.kind,
      reconnectAttempts: entry.reconnectAttempts,
      subscriberCount: entry.subscribers.size,
      ...details,
    });
  }

  private destroy(streamId: string, entry: ConnectionEntry): void {
    this.logVerbose(streamId, entry, "destroy");
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
          this.handleDisconnect(streamId, entry, entry.source, {
            kind: "failure",
            failure: new Error(
              "SSE source closed while the page was inactive."
            ),
          });
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
