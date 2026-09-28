import type { DatadogLogContext } from "@app/logger/logger";
import type {
  EventSourcePolyfill,
  Event as PolyfillEvent,
} from "event-source-polyfill";

export type EventSourceLike = Pick<
  EventSourcePolyfill,
  "close" | "onerror" | "onmessage" | "readyState"
> & {
  addEventListener: (
    type: string,
    listener: (event: PolyfillEvent) => void
  ) => void;
};

export type EventSourceFactory = (
  url: string,
  headers: Record<string, string> | undefined,
  signal: AbortSignal
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

export type LongPollActivation = "fallback" | "immediate";

export type ConnectionConfig = {
  buildLongPollURL?: (lastEvent: string | null) => string | null;
  buildURL: (lastEvent: string | null) => string | null;
  headers?: Record<string, string>;
  isPauseEvent?: (event: string) => boolean;
  isTerminalEvent?: (event: string) => boolean;
  longPollActivation?: LongPollActivation;
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
