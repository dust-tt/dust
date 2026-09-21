import type { ConsumptionAnalyticsScope } from "@app/lib/analytics/consumption_scope";
import { WORKSPACE_CONSUMPTION_ANALYTICS_SCOPE } from "@app/lib/analytics/consumption_scope";
import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSWRConfig } from "swr";

const CONSUMPTION_FILTER_DEBOUNCE_MS = 300;

export function getConsumptionAnalyticsUrl({
  workspaceId,
  analyticsScope = WORKSPACE_CONSUMPTION_ANALYTICS_SCOPE,
  endpoint,
}: {
  workspaceId: string;
  analyticsScope?: ConsumptionAnalyticsScope;
  endpoint: string;
}) {
  let analyticsPath: string;
  switch (analyticsScope.kind) {
    case "workspace":
      analyticsPath = "analytics";
      break;
    case "personal":
      analyticsPath = "me/analytics";
      break;
    case "agent":
      analyticsPath = `assistant/agent_configurations/${analyticsScope.agentId}/analytics`;
      break;
    default:
      assertNever(analyticsScope);
  }
  return `/api/w/${workspaceId}/${analyticsPath}/consumption/${endpoint}`;
}

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

  // No abort on unmount: a remounting widget with the same cache key is
  // deduped by SWR onto the in-flight request, so aborting it would store an
  // error on the shared key (e.g. when a resize across the mobile breakpoint
  // remounts the page). A late response is harmless, SWR writes it under the
  // key it was fetched for.

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
