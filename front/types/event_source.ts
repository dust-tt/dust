import type { DatadogLogContext } from "@app/logger/logger";
import type { EventSourcePolyfill } from "event-source-polyfill";

export type EventSourceLike = Pick<
  EventSourcePolyfill,
  "close" | "onerror" | "onmessage" | "onopen" | "readyState" | "url"
>;

export type EventSourceFactory = (
  url: string,
  headers?: Record<string, string>
) => Promise<EventSourceLike>;

export type EventSourceManagerOptions = {
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

export type ConnectionConfig = {
  buildURL: (lastEvent: string | null) => string | null;
  headers?: Record<string, string>;
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

export type ConnectionEntry = {
  config: ConnectionConfig;
  events: string[];
  generation: number;
  lastEvent: string | null;
  lastEventAt: number | null;
  lastResumeAtMs: number | null;
  lastURL: string | null;
  keepAliveWithoutSubscribers: boolean;
  reconnectAttempts: number;
  unsuccessfulResumes: number;
  reconnectTimeout: ReturnType<typeof setTimeout> | null;
  source: EventSourceLike | null;
  state: EventSourceConnectionState;
  subscribers: Set<Subscriber>;
};
