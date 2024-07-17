import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const activeEventSources = new Map<string, EventSource>();

const RECONNECT_DELAY = 5000; // 5 seconds

// export function useEventSource(
//   buildURL: (lastMessage: string | null) => string | null,
//   onEventCallback: (event: string) => void,
//   { isReadyToConsumeStream }: { isReadyToConsumeStream: boolean } = {
//     isReadyToConsumeStream: true,
//   },
//   uniqueId: string
// ) {
//   // State used to re-connect to the events stream; this is a hack to re-trigger
//   // the useEffect that set-up the EventSource to the streaming endpoint.
//   const [reconnectCounter, setReconnectCounter] = useState(0);
//   const lastEvent = useRef<string | null>(null);
//   const errorCount = useRef(0);
//   const [isError, setIsError] = useState<Error | null>(null);

//   const es = useMemo(() => {
//     const url = buildURL(lastEvent.current);
//     if (!url) {
//       return null;
//     }

//     const activeEventSourceForUniqueId = activeEventSources.get(uniqueId);

//     if (
//       !activeEventSourceForUniqueId ||
//       activeEventSourceForUniqueId.readyState === EventSource.CLOSED
//     ) {
//       console.log(">> creating new event source", uniqueId);
//       const newEventSource = new EventSource(url);
//       activeEventSources.set(uniqueId, newEventSource);
//       return newEventSource;
//     } else {
//       console.log(">> getting active event source", uniqueId);
//       return activeEventSourceForUniqueId;
//     }
//   }, [buildURL, uniqueId, reconnectCounter]); // Dependency on uniqueId only

//   useEffect(() => {
//     if (!isReadyToConsumeStream || !es) {
//       return;
//     }

//     let reconnectTimeout: NodeJS.Timeout | null = null;

//     es.onopen = () => {
//       errorCount.current = 0;
//     };

//     es.onmessage = (event: MessageEvent<string>) => {
//       if (event.data === "done") {
//         console.log("useEventSource.onmessage() done");
//         setReconnectCounter((c) => c + 1);
//         es.close();
//         return;
//       }
//       onEventCallback(event.data);
//       lastEvent.current = event.data;
//     };

//     es.onerror = (event) => {
//       console.error("useEventSource.onerror()", event);
//       errorCount.current += 1;
//       if (errorCount.current >= 3) {
//         console.log("too many errors, not reconnecting..");
//         setIsError(new Error("Too many errors, closing connection."));
//         es.close();
//         return;
//       }
//       reconnectTimeout = setTimeout(() => {
//         setReconnectCounter((c) => c + 1);
//       }, 1000);
//     };

//     return () => {
//       if (reconnectTimeout) {
//         clearTimeout(reconnectTimeout);
//       }
//     };
//   }, [buildURL, onEventCallback, reconnectCounter, isReadyToConsumeStream, es]);

//   // Cleanup function to remove the EventSource when the component unmounts
//   useEffect(() => {
//     return () => {
//       if (uniqueId.startsWith("message-")) {
//         return;
//       }

//       console.log(">> cleaning up event source", uniqueId);
//       const activeEventSource = activeEventSources.get(uniqueId);
//       if (activeEventSource) {
//         activeEventSource.close();
//         activeEventSources.delete(uniqueId);
//       }
//     };
//   }, [uniqueId]);

//   return { isError };
// }

const useEventSourceManager = () => {
  const sources = useRef(new Map<string, EventSource>());

  const create = useCallback((url: string, uniqueId: string) => {
    const newSource = new EventSource(url);
    sources.current.set(uniqueId, newSource);
    return newSource;
  }, []);

  const get = useCallback(
    (uniqueId: string) => sources.current.get(uniqueId),
    []
  );

  const remove = useCallback((uniqueId: string) => {
    const source = sources.current.get(uniqueId);
    if (source) {
      source.close();
      sources.current.delete(uniqueId);
    }
  }, []);

  return { create, get, remove };
};

export function useEventSource(
  buildURL: (lastEvent: string | null) => string | null,
  onEventCallback: (event: string) => void,
  { isReadyToConsumeStream = true }: { isReadyToConsumeStream?: boolean } = {},
  uniqueId: string
) {
  const [isError, setIsError] = useState<Error | null>(null);
  const lastEvent = useRef<string | null>(null);
  const reconnectAttempts = useRef(0);
  const sourceManager = useEventSourceManager();

  const connect = useCallback(() => {
    const url = buildURL(lastEvent.current);
    if (!url) {
      return null;
    }

    let source = sourceManager.get(uniqueId);
    if (!source || source.readyState === EventSource.CLOSED) {
      source = sourceManager.create(url, uniqueId);
    }

    source.onopen = () => {
      console.log("EventSource connection opened (1)", uniqueId);
      reconnectAttempts.current = 0;
    };

    source.onmessage = (event: MessageEvent<string>) => {
      if (event.data === "done") {
        source.close();
        setTimeout(connect, RECONNECT_DELAY);
        return;
      }
      onEventCallback(event.data);
      lastEvent.current = event.data;
    };

    source.onerror = (event: Event) => {
      console.error("EventSource error", event);
      source.close();
      reconnectAttempts.current++;

      console.error(
        `Connection error. Attempting to reconnect in ${RECONNECT_DELAY}ms`
      );

      setTimeout(connect, RECONNECT_DELAY);
      setIsError(new Error("Connection error. Attempting to reconnect."));
    };

    return source;
  }, [buildURL, onEventCallback, uniqueId, sourceManager]);

  useEffect(() => {
    if (!isReadyToConsumeStream) {
      return;
    }

    connect();
    // No cleanup function needed here
  }, [isReadyToConsumeStream, connect]);

  // useEffect(() => {
  //   return () => sourceManager.remove(uniqueId);
  // }, [uniqueId, sourceManager]);

  return { isError };
}
