import debounce from "lodash/debounce";
import { useCallback, useEffect, useRef, useState } from "react";

interface UseDebounceOptions {
  delay?: number;
  minLength?: number;
}

export function useDebounce(
  initialValue: string,
  options: UseDebounceOptions = {}
) {
  const { delay = 300, minLength = 0 } = options;

  const [inputValue, setInputValue] = useState<string>(initialValue);
  const [debouncedValue, setDebouncedValue] = useState<string>(initialValue);
  const [isDebouncing, setIsDebouncing] = useState(false);

  // Create debounced function
  // eslint-disable-next-line react-hooks/refs
  const debouncedUpdate = useRef(
    debounce((value: string) => {
      setDebouncedValue(value);
      setIsDebouncing(false);
    }, delay)
  ).current;

  // Update function
  const setValue = useCallback(
    (value: string) => {
      setInputValue(value);

      if (minLength > 0 && value.length < minLength) {
        setDebouncedValue("");
        setIsDebouncing(false);
        debouncedUpdate.cancel();
        return;
      }
      setIsDebouncing(true);
      debouncedUpdate(value);
    },
    [debouncedUpdate, minLength]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      debouncedUpdate.cancel();
    };
  }, [debouncedUpdate]);

  // eslint-disable-next-line react-hooks/refs
  return {
    inputValue,
    debouncedValue,
    isDebouncing,
    setValue,
    // eslint-disable-next-line react-hooks/refs
    flush: debouncedUpdate.flush,
    // eslint-disable-next-line react-hooks/refs
    cancel: debouncedUpdate.cancel,
  };
}

interface UseDebounceWithAbortOptions {
  delayMs?: number;
}

/**
 * Hook that debounces an async function call with AbortController support.
 * Useful for API calls that should be cancelled when a new request is made.
 *
 * @param asyncFn - The async function to debounce. It receives the value and an AbortSignal.
 * @param options - Configuration options (delay)
 * @returns A trigger function that accepts a value and triggers the debounced async call
 *
 * @example
 * const generateFilter = useWebhookFilterGenerator({ workspace });
 * const trigger = useDebounceWithAbort(
 *   async (description: string, signal: AbortSignal) => {
 *     if (description.length < 10) return; // Handle validation in the callback
 *     const result = await generateFilter({
 *       naturalDescription: description,
 *       eventSchema: selectedEventSchema,
 *       signal,
 *     });
 *     // Update state with result
 *   },
 *   { delay: 500 }
 * );
 *
 * // Later, in an onChange handler:
 * trigger(e.target.value);
 */
export function useDebounceWithAbort<T = string>(
  asyncFn: (value: T, signal: AbortSignal) => Promise<void>,
  options: UseDebounceWithAbortOptions = {}
) {
  const { delayMs = 500 } = options;

  const debounceHandle = useRef<NodeJS.Timeout | undefined>(undefined);
  const abortControllerRef = useRef<AbortController | null>(null);

  const trigger = useCallback(
    (value: T) => {
      // Clear existing debounce timeout
      if (debounceHandle.current) {
        clearTimeout(debounceHandle.current);
        debounceHandle.current = undefined;
      }

      // Debounce the async call
      debounceHandle.current = setTimeout(() => {
        // Cancel previous request
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }

        // Create new abort controller
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        // Execute async function
        void asyncFn(value, signal);
      }, delayMs);
    },
    [asyncFn, delayMs]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceHandle.current) {
        clearTimeout(debounceHandle.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return trigger;
}
