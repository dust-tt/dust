import { useEffect, useRef, useState } from "react";

export function useEventSource(
  buildURL: (lastMessage: string | null) => string | null,
  onEventCallback: (event: string) => void
) {
  // State used to re-connect to the events stream; this is a hack to re-trigger
  // the useEffect that set-up the EventSource to the streaming endpoint.
  const [reconnectCounter, setReconnectCounter] = useState(0);
  const [lastEvent, setLastEvent] = useState<string | null>(null);
  const errorCount = useRef(0);
  const [isError, setIsError] = useState<Error | null>(null);

  useEffect(() => {
    const url = buildURL(lastEvent);
    if (!url) {
      return;
    }
    let reconnectTimeout: NodeJS.Timeout | null = null;

    const es = new EventSource(url);

    es.onopen = () => {
      errorCount.current = 0;
    };

    es.onmessage = (event: MessageEvent<string>) => {
      onEventCallback(event.data);
      setLastEvent(event.data);
    };

    es.onerror = () => {
      reconnectTimeout = setTimeout(() => {
        setReconnectCounter((c) => c + 1);
      }, Math.min(1000 * errorCount.current, 3000));
      errorCount.current += 1;
      if (errorCount.current > 1) {
        setIsError(new Error("Error connecting to the events stream"));
      }
    };

    return () => {
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      es.close();
    };
  }, [buildURL, lastEvent, onEventCallback, reconnectCounter]);

  return { isError };
}
