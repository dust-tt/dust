import { eventSourceManager } from "@app/lib/client/event_source_manager";
import type { DatadogLogContext } from "@app/logger/logger";
import type { EventSourceConnectionState } from "@app/types/event_source";
import { useEffect, useRef, useState } from "react";

interface UseEventSourceOptions {
  workspaceId: string;
  buildLongPollURL?: (lastEvent: string | null) => string | null;
  isReadyToConsumeStream?: boolean;
  isTerminalEvent?: (event: string) => boolean;
  onTerminalError?: (error: Error) => void;
  headers?: Record<string, string>;
  keepAliveOnUnmount?: boolean;
  replayBufferedEventsOnMount?: boolean;
  restartKey?: string;
  telemetryContext?: DatadogLogContext;
}

export function useEventSource(
  buildURL: (lastEvent: string | null) => string | null,
  onEventCallback: (event: string) => void,
  streamId: string,
  {
    workspaceId,
    buildLongPollURL,
    isReadyToConsumeStream = true,
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
  const [connectionState, setConnectionState] =
    useState<EventSourceConnectionState>({ kind: "idle" });
  const [isError, setIsError] = useState<Error | null>(null);
  const buildURLRef = useRef(buildURL);
  const buildLongPollURLRef = useRef(buildLongPollURL);
  const onEventCallbackRef = useRef(onEventCallback);
  const isTerminalEventRef = useRef(isTerminalEvent);
  const onTerminalErrorRef = useRef(onTerminalError);
  const headersRef = useRef(headers);
  const telemetryContextRef = useRef(telemetryContext);

  useEffect(() => {
    buildURLRef.current = buildURL;
    buildLongPollURLRef.current = buildLongPollURL;
    onEventCallbackRef.current = onEventCallback;
    isTerminalEventRef.current = isTerminalEvent;
    onTerminalErrorRef.current = onTerminalError;
    headersRef.current = headers;
    telemetryContextRef.current = telemetryContext;
  }, [
    buildURL,
    buildLongPollURL,
    headers,
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
        isTerminalEvent: (event) =>
          isTerminalEventRef.current?.(event) ?? false,
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
    replayBufferedEventsOnMount,
    restartKey,
    streamId,
    workspaceId,
  ]);

  return { connectionState, isError };
}
