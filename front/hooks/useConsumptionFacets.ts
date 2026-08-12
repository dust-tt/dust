import type {
  UsageFilterAgentOption,
  UsageFilterCategory,
  UsageFilterGroupOption,
  UsageFilterMemberOption,
  UsageFilterModelOption,
  UsageFilterOptionForCategory,
  UsageFilterSkillOption,
  UsageFilterSourceOption,
  UsageFilterToolOption,
} from "@app/components/workspace/analytics/usageFilter";
import { usageModelTierFromModelsTierName } from "@app/components/workspace/analytics/usageFilter";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import type { GetConsumptionFacetsResponse } from "@app/lib/api/analytics/consumption/facets";
import type { ConsumptionFacetsBody } from "@app/lib/api/analytics/consumption/schema";
import { DEFAULT_CONSUMPTION_PERIOD_DAYS } from "@app/lib/api/analytics/consumption/schema";
import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import { CONSUMPTION_SCOPE_FILTER_KEYS } from "@app/lib/api/analytics/consumption/scope";
import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import { isConnectorProvider } from "@app/types/data_source";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSWRConfig } from "swr";

export type ConsumptionFacetOptions = {
  [C in UsageFilterCategory]: UsageFilterOptionForCategory<C>[];
};

const EMPTY_FACET_OPTIONS: ConsumptionFacetOptions = {
  agent: [],
  member: [],
  group: [],
  model: [],
  tool: [],
  skill: [],
  source: [],
};

const FACET_FILTER_DEBOUNCE_MS = 300;

function normalizedFilter(
  filter: ConsumptionScopeFilter | undefined
): ConsumptionScopeFilter | undefined {
  if (!filter) {
    return undefined;
  }

  const normalized: ConsumptionScopeFilter = {};
  for (const key of CONSUMPTION_SCOPE_FILTER_KEYS) {
    const values = filter[key];
    if (values && values.length > 0) {
      normalized[key] = [...values].sort();
    }
  }
  return normalized;
}

function useDebouncedValue<T>(value: T, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    if (Object.is(value, debouncedValue)) {
      return;
    }

    const timeout = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timeout);
  }, [debouncedValue, delay, value]);

  return {
    debouncedValue,
    isDebouncing: !Object.is(value, debouncedValue),
  };
}

function baseOption(facet: {
  value: string;
  label: string;
  documentCount: number;
  disabled: boolean;
}) {
  return {
    id: facet.value,
    name: facet.label,
    documentCount: facet.documentCount,
    disabled: facet.disabled,
  };
}

function toFacetOptions(
  data: GetConsumptionFacetsResponse
): ConsumptionFacetOptions {
  return {
    agent: data.facets.agent.map<UsageFilterAgentOption>((facet) => ({
      ...baseOption(facet),
      kind: "agent",
      image: facet.pictureUrl,
      scope: facet.scope,
    })),
    member: data.facets.user.map<UsageFilterMemberOption>((facet) => ({
      ...baseOption(facet),
      kind: "member",
      image: facet.pictureUrl,
    })),
    group: data.facets.group.map<UsageFilterGroupOption>((facet) => ({
      ...baseOption(facet),
      kind: "group",
    })),
    model: data.facets.model.map<UsageFilterModelOption>((facet) => ({
      ...baseOption(facet),
      kind: "model",
      lab: facet.maker,
      tier: usageModelTierFromModelsTierName(facet.tier),
    })),
    tool: data.facets.tool.map<UsageFilterToolOption>((facet) => ({
      ...baseOption(facet),
      kind: "tool",
      icon: facet.icon ?? null,
    })),
    skill: data.facets.skill.map<UsageFilterSkillOption>((facet) => ({
      ...baseOption(facet),
      kind: "skill",
      icon: facet.icon ?? null,
    })),
    source: data.facets.source.map<UsageFilterSourceOption>((facet) => ({
      ...baseOption(facet),
      kind: "source",
      connectorProvider: isConnectorProvider(facet.value)
        ? facet.value
        : undefined,
    })),
  };
}

export function useConsumptionFacets({
  workspaceId,
  period,
  filter,
  disabled,
}: {
  workspaceId: string;
  period: ConsumptionPeriodSelection;
  filter?: ConsumptionScopeFilter;
  disabled?: boolean;
}) {
  const { fetcherWithBody } = useFetcher();
  const { cache } = useSWRConfig();
  const requestControllerRef = useRef<AbortController | null>(null);
  const previousCacheKeyRef = useRef<string | null>(null);
  const url = `/api/w/${workspaceId}/analytics/consumption/facets`;
  const bodyKey = JSON.stringify({
    period: period.kind,
    days:
      period.kind === "days" ? period.days : DEFAULT_CONSUMPTION_PERIOD_DAYS,
    filter: normalizedFilter(filter),
  } satisfies ConsumptionFacetsBody);
  const { debouncedValue: debouncedBodyKey, isDebouncing } = useDebouncedValue(
    bodyKey,
    FACET_FILTER_DEBOUNCE_MS
  );
  const cacheKey = JSON.stringify([url, debouncedBodyKey]);

  const fetchFacets =
    useCallback(async (): Promise<GetConsumptionFacetsResponse> => {
      requestControllerRef.current?.abort();
      const controller = new AbortController();
      requestControllerRef.current = controller;

      try {
        const body = JSON.parse(debouncedBodyKey) as ConsumptionFacetsBody;
        return await fetcherWithBody([url, body, "POST"], {
          signal: controller.signal,
        });
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

  useEffect(
    () => () => {
      requestControllerRef.current?.abort();
    },
    []
  );

  const { data, error, isValidating } = useSWRWithDefaults(
    cacheKey,
    fetchFacets,
    {
      disabled: disabled || isDebouncing,
      errorRetryCount: 0,
      keepPreviousData: true,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );

  const options = useMemo(
    () => (data ? toFacetOptions(data) : EMPTY_FACET_OPTIONS),
    [data]
  );

  return {
    options,
    isFacetsLoading: !error && !data && !disabled,
    isFacetsError: error,
    isFacetsValidating: isValidating || isDebouncing,
  };
}
