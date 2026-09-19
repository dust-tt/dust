import type { DatadogLogContext } from "@app/logger/logger";
import type {
  Event as PolyfillEvent,
  MessageEvent as PolyfillMessageEvent,
} from "event-source-polyfill";

export type EventSourceLike = {
  addEventListener: (
    type: string,
    listener: (event: PolyfillEvent) => void
  ) => void;
  close: () => void;
  onerror: ((event: PolyfillEvent) => void) | null;
  onmessage: ((event: PolyfillMessageEvent) => void) | null;
  onopen: ((event: PolyfillEvent) => void) | null;
  readonly readyState: number;
  readonly url: string;
};

export type EventSourceFactory = (
  url: string,
  headers?: Record<string, string>
) => Promise<EventSourceLike>;

export type LongPollFactory = (
  url: string,
  options: { headers?: Record<string, string>; signal: AbortSignal }
) => Promise<string[]>;

export type EventSourceManagerOptions = {
  handshakeTimeoutMs?: number;
  longPollFactory?: LongPollFactory;
  maxReconnectAttempts?: number;
  reconnectDelayBaseMs?: number;
  reconnectDelayJitterMs?: number;
};

export type EventSourceConnectionState =
  | { kind: "idle" }
  | { kind: "connecting"; attempt: number; startedAt: number }
  | { kind: "open"; openedAt: number }
  | { kind: "long_polling"; startedAt: number }
  | {
      kind: "reconnecting";
      attempt: number;
      reconnectAt: number;
    }
  | { kind: "failed"; attempt: number; error: Error }
  | { kind: "terminal" };

export type ConnectionConfig = {
  buildLongPollURL?: (lastEvent: string | null) => string | null;
  buildURL: (lastEvent: string | null) => string | null;
  getEventId?: (event: string) => string;
  headers?: Record<string, string>;
  isPauseEvent?: (event: string) => boolean;
  isTerminalEvent?: (event: string) => boolean;
  replayBufferedEventsOnSubscribe: boolean;
  restartKey: string;
  telemetryContext?: DatadogLogContext;
  workspaceId: string;
};

export type Subscriber = {
  onEvent: (event: string) => void;
  onStateChange: (state: EventSourceConnectionState) => void;
  onTerminalError?: (error: Error) => void;
};

export type SseTransportState =
  | { kind: "idle" }
  | { kind: "creating"; attemptId: number }
  | {
      kind: "awaiting_handshake";
      attemptId: number;
      source: EventSourceLike;
      timeout: ReturnType<typeof setTimeout>;
    }
  | { kind: "open"; source: EventSourceLike; openedAt: number }
  | { kind: "retrying"; timeout: ReturnType<typeof setTimeout> };

export type LongPollTransportState =
  | { kind: "idle" }
  | { kind: "requesting"; controller: AbortController }
  | { kind: "retrying"; timeout: ReturnType<typeof setTimeout> };

export type BrowserSseHealth = "unknown" | "healthy" | "degraded";

export type KeepAliveState = "inactive" | "active" | "paused";

export type ConnectionEntry = {
  config: ConnectionConfig;
  events: string[];
  generation: number;
  lastEvent: string | null;
  lastEventAt: number | null;
  lastLongPollURL: string | null;
  lastProbeAtMs: number | null;
  lastResumeAtMs: number | null;
  lastURL: string | null;
  longPollAttempts: number;
  longPollState: LongPollTransportState;
  keepAliveState: KeepAliveState;
  reconnectAttempts: number;
  unsuccessfulResumes: number;
  seenEventIds: Set<string>;
  sseAttemptId: number;
  sseState: SseTransportState;
  state: EventSourceConnectionState;
  subscribers: Set<Subscriber>;
};
