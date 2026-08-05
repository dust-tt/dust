import type { ConsumptionPeriodSelection } from "@app/components/workspace/analytics/consumption/consumptionPeriod";
import { consumptionQueryString } from "@app/components/workspace/analytics/consumption/consumptionPeriod";
// Type-only: importing a value from `top.ts` would pull the Elasticsearch
// client into the browser bundle (see the note in `series.ts`).
import type {
  ConsumptionTopDimension,
  GetConsumptionTopResponse,
} from "@app/lib/api/analytics/consumption/top";
import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { Fetcher } from "swr";

export function useConsumptionTop({
  workspaceId,
  dimension,
  period,
  limit,
  disabled,
}: {
  workspaceId: string;
  dimension: ConsumptionTopDimension;
  period: ConsumptionPeriodSelection;
  limit: number;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const topFetcher: Fetcher<GetConsumptionTopResponse> = fetcher;

  const params = new URLSearchParams(consumptionQueryString(period));
  params.set("dimension", dimension);
  params.set("limit", String(limit));

  const { data, error, isValidating } = useSWRWithDefaults(
    `/api/w/${workspaceId}/analytics/consumption/top?${params.toString()}`,
    topFetcher,
    { disabled }
  );

  return {
    top: data ?? null,
    isTopLoading: !error && !data && !disabled,
    isTopError: error,
    isTopValidating: isValidating,
  };
}
