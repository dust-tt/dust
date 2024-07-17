import { useEffect, useMemo, useRef, useState } from "react";

const activeEventSources = new Map<string, EventSource>();

export function useEventSource(
  buildURL: (lastMessage: string | null) => string | null,
  onEventCallback: (event: string) => void,
  { isReadyToConsumeStream }: { isReadyToConsumeStream: boolean } = {
    isReadyToConsumeStream: true,
  },
  uniqueId: string
) {
  // State used to re-connect to the events stream; this is a hack to re-trigger
  // the useEffect that set-up the EventSource to the streaming endpoint.
  const [reconnectCounter, setReconnectCounter] = useState(0);
  const lastEvent = useRef<string | null>(null);
  const errorCount = useRef(0);
  const [isError, setIsError] = useState<Error | null>(null);

  const es = useMemo(() => {
    const url = buildURL(lastEvent.current);
    if (!url) {
      return null;
    }

    const activeEventSourceForUniqueId = activeEventSources.get(uniqueId);

    if (
      !activeEventSourceForUniqueId ||
      activeEventSourceForUniqueId.readyState === EventSource.CLOSED
    ) {
      console.log(">> creating new event source", uniqueId);
      const newEventSource = new EventSource(url);
      activeEventSources.set(uniqueId, newEventSource);
      return newEventSource;
    } else {
      console.log(">> getting active event source", uniqueId);
      return activeEventSourceForUniqueId;
    }
  }, [buildURL, uniqueId]); // Dependency on uniqueId only

  useEffect(() => {
    if (!isReadyToConsumeStream || !es) {
      return;
    }

    let reconnectTimeout: NodeJS.Timeout | null = null;

    es.onopen = () => {
      errorCount.current = 0;
    };

    es.onmessage = (event: MessageEvent<string>) => {
      if (event.data === "done") {
        setReconnectCounter((c) => c + 1);
        es.close();
        return;
      }
      onEventCallback(event.data);
      lastEvent.current = event.data;
    };

    es.onerror = (event) => {
      console.error("useEventSource.onerror()", event);
      errorCount.current += 1;
      if (errorCount.current >= 3) {
        console.log("too many errors, not reconnecting..");
        setIsError(new Error("Too many errors, closing connection."));
        es.close();
        return;
      }
      reconnectTimeout = setTimeout(() => {
        setReconnectCounter((c) => c + 1);
      }, 1000);
    };

    return () => {
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      es.close();
    };
  }, [buildURL, onEventCallback, reconnectCounter, isReadyToConsumeStream, es]);

  return { isError };
}
