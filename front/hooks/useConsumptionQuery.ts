import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSWRConfig } from "swr";

const CONSUMPTION_FILTER_DEBOUNCE_MS = 300;

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    if (Object.is(value, debouncedValue)) {
      return;
    }

    const timeout = setTimeout(() => setDebouncedValue(value), delayMs);
    return () => clearTimeout(timeout);
  }, [debouncedValue, delayMs, value]);

  return {
    debouncedValue,
    isDebouncing: !Object.is(value, debouncedValue),
  };
}

// Shared by every consumption analytics widget: the filter travels as a POST
// body instead of a query string, since it can select more values than fit
// in a URL. The filter changes on every checkbox toggle, so requests are
// debounced and a superseded request is aborted before it can race a fresher
// one into the cache.
export function useConsumptionQuery<TBody extends object, TResponse>({
  url,
  body,
  disabled,
}: {
  url: string;
  body: TBody;
  disabled?: boolean;
}) {
  const { fetcherWithBody } = useFetcher();
  const { cache } = useSWRConfig();
  const requestControllerRef = useRef<AbortController | null>(null);
  const previousCacheKeyRef = useRef<string | null>(null);
  const unmountAbortTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const bodyKey = JSON.stringify(body);
  const { debouncedValue: debouncedBodyKey, isDebouncing } = useDebouncedValue(
    bodyKey,
    CONSUMPTION_FILTER_DEBOUNCE_MS
  );
  const cacheKey = JSON.stringify([url, debouncedBodyKey]);

  const fetchData = useCallback(async (): Promise<TResponse> => {
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;

    try {
      return await fetcherWithBody(
        [url, JSON.parse(debouncedBodyKey), "POST"],
        { signal: controller.signal }
      );
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
      }
    }
  }, [debouncedBodyKey, fetcherWithBody, url]);

  useEffect(() => {
    if (disabled || isDebouncing) {
      requestControllerRef.current?.abort();
    }
  }, [disabled, isDebouncing]);

  useEffect(() => {
    const previousCacheKey = previousCacheKeyRef.current;
    if (previousCacheKey && previousCacheKey !== cacheKey) {
      cache.delete(previousCacheKey);
    }
    previousCacheKeyRef.current = cacheKey;
  }, [cache, cacheKey]);

  // Cancels the in-flight request on a real unmount, e.g. when the user
  // switches period/filter fast enough to tear this widget down mid-request:
  // without this, a slow response could still land after the fact and
  // overwrite the cache with data for a view the user already left.
  // Deferred so StrictMode's dev-only mount -> cleanup -> mount replay can
  // cancel the timeout first instead of aborting the request before it
  // reaches the network. Without this, local dev (StrictMode) breaks every
  // request; prod is unaffected. Recreating the controller per-effect (as a
  // plain fetch-in-effect would) isn't an option: SWR treats this request as
  // already cached for the replay's second mount, so it would never fire a
  // second one to replace the one we just aborted.
  useEffect(() => {
    if (unmountAbortTimeoutRef.current !== null) {
      clearTimeout(unmountAbortTimeoutRef.current);
      unmountAbortTimeoutRef.current = null;
    }

    return () => {
      unmountAbortTimeoutRef.current = setTimeout(() => {
        requestControllerRef.current?.abort();
      }, 0);
    };
  }, []);

  const { data, error, isLoading, isValidating, mutate } = useSWRWithDefaults(
    cacheKey,
    fetchData,
    {
      disabled: disabled || isDebouncing,
      errorRetryCount: 0,
      keepPreviousData: true,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );

  return {
    data,
    error,
    mutate,
    isLoading: !disabled && (isLoading || isDebouncing),
    isValidating: isValidating || isDebouncing,
  };
}
