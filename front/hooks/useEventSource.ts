import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { eventSourceManager } from "@app/lib/client/event_source_manager";
import type { DatadogLogContext } from "@app/logger/logger";
import type { EventSourceConnectionState } from "@app/types/event_source";
import { useEffect, useRef, useState } from "react";

interface UseEventSourceOptions {
  workspaceId: string;
  buildLongPollURL?: (lastEvent: string | null) => string | null;
  isReadyToConsumeStream?: boolean;
  isPauseEvent?: (event: string) => boolean;
  isTerminalEvent?: (event: string) => boolean;
  onTerminalError?: (error: Error) => void;
  headers?: Record<string, string>;
  keepAliveOnUnmount?: boolean;
  replayBufferedEventsOnMount?: boolean;
  restartKey?: string;
  telemetryContext?: DatadogLogContext;
}

/**
 * @cc [owner:id13,label:react;reliability] long-polling-feature-activation
 * A long-poll URL MUST make a stream eligible for fallback when SSE is degraded in every workspace.
 * The agent_stream_long_polling feature flag MUST start eligible streams with long polling.
 */
export function useEventSource(
  buildURL: (lastEvent: string | null) => string | null,
  onEventCallback: (event: string) => void,
  streamId: string,
  {
    workspaceId,
    buildLongPollURL,
    isReadyToConsumeStream = true,
    isPauseEvent,
    isTerminalEvent,
    onTerminalError,
    headers,
    keepAliveOnUnmount = false,
    replayBufferedEventsOnMount = false,
    restartKey = streamId,
    telemetryContext,
  }: UseEventSourceOptions
) {
  const hasLongPollFallback = Boolean(buildLongPollURL);
  const { hasFeature } = useFeatureFlags();
  const longPollActivation =
    hasLongPollFallback && hasFeature("agent_stream_long_polling")
      ? "immediate"
      : "fallback";
  const [connectionState, setConnectionState] =
    useState<EventSourceConnectionState>({ kind: "idle" });
  const [isError, setIsError] = useState<Error | null>(null);
  const buildURLRef = useRef(buildURL);
  const buildLongPollURLRef = useRef(buildLongPollURL);
  const onEventCallbackRef = useRef(onEventCallback);
  const isPauseEventRef = useRef(isPauseEvent);
  const isTerminalEventRef = useRef(isTerminalEvent);
  const onTerminalErrorRef = useRef(onTerminalError);
  const headersRef = useRef(headers);
  const telemetryContextRef = useRef(telemetryContext);

  useEffect(() => {
    buildURLRef.current = buildURL;
    buildLongPollURLRef.current = buildLongPollURL;
    onEventCallbackRef.current = onEventCallback;
    isPauseEventRef.current = isPauseEvent;
    isTerminalEventRef.current = isTerminalEvent;
    onTerminalErrorRef.current = onTerminalError;
    headersRef.current = headers;
    telemetryContextRef.current = telemetryContext;
  }, [
    buildURL,
    buildLongPollURL,
    headers,
    isPauseEvent,
    isTerminalEvent,
    onEventCallback,
    onTerminalError,
    telemetryContext,
  ]);

  useEffect(() => {
    if (!isReadyToConsumeStream || !streamId) {
      setConnectionState({ kind: "idle" });
      setIsError(null);
      return;
    }

    return eventSourceManager.subscribe({
      streamId,
      config: {
        workspaceId,
        buildLongPollURL: hasLongPollFallback
          ? (lastEvent) => buildLongPollURLRef.current?.(lastEvent) ?? null
          : undefined,
        buildURL: (lastEvent) => buildURLRef.current(lastEvent),
        headers: headersRef.current,
        isPauseEvent: (event) => isPauseEventRef.current?.(event) ?? false,
        isTerminalEvent: (event) =>
          isTerminalEventRef.current?.(event) ?? false,
        longPollActivation,
        replayBufferedEventsOnSubscribe: replayBufferedEventsOnMount,
        restartKey,
        telemetryContext: telemetryContextRef.current,
      },
      subscriber: {
        onEvent: (event) => onEventCallbackRef.current(event),
        onStateChange: (state) => {
          setConnectionState(state);
          setIsError(state.kind === "failed" ? state.error : null);
        },
        onTerminalError: (error) => onTerminalErrorRef.current?.(error),
      },
      keepAliveWithoutSubscribers: keepAliveOnUnmount,
    });
  }, [
    hasLongPollFallback,
    isReadyToConsumeStream,
    keepAliveOnUnmount,
    longPollActivation,
    replayBufferedEventsOnMount,
    restartKey,
    streamId,
    workspaceId,
  ]);

  return { connectionState, isError };
}
