import { useEffect, useRef, useState } from "react";

export function useEventSource(
  buildURL: (lastMessage: string | null) => string | null,
  onEventCallback: (event: string) => void,
  { isReadyToConsumeStream }: { isReadyToConsumeStream: boolean } = {
    isReadyToConsumeStream: true,
  }
) {
  // State used to re-connect to the events stream; this is a hack to re-trigger
  // the useEffect that set-up the EventSource to the streaming endpoint.
  const [reconnectCounter, setReconnectCounter] = useState(0);
  const lastEvent = useRef<string | null>(null);
  const errorCount = useRef(0);
  const [isError, setIsError] = useState<Error | null>(null);

  useEffect(() => {
    if (!isReadyToConsumeStream) {
      return;
    }

    const url = buildURL(lastEvent.current);
    if (!url) {
      return;
    }
    let reconnectTimeout: NodeJS.Timeout | null = null;

    const es = new EventSource(url);

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
  }, [buildURL, onEventCallback, reconnectCounter, isReadyToConsumeStream]);

  return { isError };
}
