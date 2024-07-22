import { useCallback, useEffect, useRef, useState } from "react";

import { COMMIT_HASH } from "@app/lib/commit-hash";

const RECONNECT_DELAY = 5000; // 5 seconds.

/**
 * Stable EventSource Manager
 *
 * This singleton object manages EventSource instances across the entire application.
 * It provides methods to create, retrieve, and remove EventSource connections,
 * ensuring that each unique connection is properly managed and can be accessed
 * or closed as needed.
 *
 * Key features:
 * - Maintains a single source of truth for all EventSource instances.
 * - Prevents duplicate EventSource creations for the same unique identifier.
 * - Allows for centralized management of EventSource lifecycle.
 * - Improves performance by reusing existing connections when possible.
 *
 * Usage:
 * - Create a new EventSource: stableEventSourceManager.create(url, uniqueId)
 * - Retrieve an existing EventSource: stableEventSourceManager.get(uniqueId)
 * - Close and remove an EventSource: stableEventSourceManager.remove(uniqueId)
 *
 * This manager is designed to be used in conjunction with the useEventSource hook
 * to provide stable and efficient EventSource handling across React component lifecycles.
 */
const stableEventSourceManager = {
  // Map to store active EventSource instances, keyed by unique identifiers
  sources: new Map<string, EventSource>(),

  /**
   * Creates a new EventSource instance and stores it in the sources map.
   * @param url The URL to connect the EventSource to
   * @param uniqueId A unique identifier for this EventSource instance
   * @returns The newly created EventSource instance
   */
  create(url: string, uniqueId: string) {
    // EventSource does not support custom headers
    // so we append the commit hash as a query parameter.
    const urlWithCommitHash = new URL(url, document.baseURI);
    urlWithCommitHash.searchParams.append("commitHash", COMMIT_HASH);

    // Extract everything except the origin.
    const pathWithQueryAndHash =
      urlWithCommitHash.pathname +
      urlWithCommitHash.search +
      urlWithCommitHash.hash;

    const newSource = new EventSource(pathWithQueryAndHash);
    this.sources.set(uniqueId, newSource);

    return newSource;
  },

  /**
   * Retrieves an existing EventSource instance by its unique identifier.
   * @param uniqueId The unique identifier of the EventSource to retrieve
   * @returns The EventSource instance if found, undefined otherwise
   */
  get(uniqueId: string) {
    return this.sources.get(uniqueId);
  },

  /**
   * Closes and removes an EventSource instance from the sources map.
   * @param uniqueId The unique identifier of the EventSource to remove
   */
  remove(uniqueId: string) {
    const source = this.sources.get(uniqueId);
    if (source) {
      source.close();
      this.sources.delete(uniqueId);
    }
  },
};

export function useEventSource(
  buildURL: (lastEvent: string | null) => string | null,
  onEventCallback: (event: string) => void,
  uniqueId: string,
  { isReadyToConsumeStream = true }: { isReadyToConsumeStream?: boolean } = {}
) {
  const [isError, setIsError] = useState<Error | null>(null);
  const lastEvent = useRef<string | null>(null);
  const reconnectAttempts = useRef(0);

  // We use a counter to trigger reconnects when the counter changes.
  const [reconnectCounter, setReconnectCounter] = useState(0);

  // Store the reconnect timeout reference to clear it when needed.
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Use the stable event source manager to ensure consistent EventSource management
  // across renders and component lifecycles.
  const sourceManager = stableEventSourceManager;

  const connect = useCallback(() => {
    const url = buildURL(lastEvent.current);
    if (!url) {
      // If the url is empty, it means streaming is done.
      // Close any previous connections for this uniqueId and remove it from the manager.
      sourceManager.remove(uniqueId);

      return null;
    }

    let source = sourceManager.get(uniqueId);
    // If the source is closed or doesn't exist, create a new one.
    if (!source || source.readyState === EventSource.CLOSED) {
      source = sourceManager.create(url, uniqueId);
    }

    source.onopen = () => {
      // If connected, reset the reconnect attempts and clear the reconnect timeout.
      reconnectAttempts.current = 0;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };

    source.onmessage = (event: MessageEvent<string>) => {
      if (event.data === "done") {
        source.close();

        // Reconnect to the stream right away.
        setReconnectCounter((c) => c + 1);
        return;
      }

      onEventCallback(event.data);
      lastEvent.current = event.data;
    };

    source.onerror = (event: Event) => {
      console.error("EventSource error", event);
      source.close();

      reconnectAttempts.current++;

      if (reconnectAttempts.current >= 10) {
        console.log(
          "Too many errors, not reconnecting. Please refresh the page."
        );
        setIsError(new Error("Too many errors, closing connection."));

        return;
      }

      console.error(
        `Connection error. Attempting to reconnect in ${RECONNECT_DELAY}ms`
      );

      // Set timeout to reconnect after a delay.
      reconnectTimeoutRef.current = setTimeout(() => {
        setReconnectCounter((c) => c + 1);
      }, RECONNECT_DELAY);
    };

    return source;
  }, [buildURL, onEventCallback, uniqueId, sourceManager]);

  useEffect(() => {
    if (!isReadyToConsumeStream) {
      return;
    }

    connect();

    return () => {
      sourceManager.remove(uniqueId);

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [
    isReadyToConsumeStream,
    connect,
    reconnectCounter,
    sourceManager,
    uniqueId,
  ]);

  return { isError };
}
