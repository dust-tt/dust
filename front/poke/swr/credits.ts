import type { Fetcher } from "swr";

import type {
  GetWorkspaceProgrammaticCostResponse,
  GroupByType,
} from "@app/lib/api/analytics/programmatic_cost";
import { emptyArray, fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeListCreditsResponseBody } from "@app/pages/api/poke/workspaces/[wId]/credits";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";

export type PokeCreditsData = {
  credits: PokeListCreditsResponseBody["credits"];
  excessCreditsLast30DaysMicroUsd: number;
};

export function usePokeCredits({ disabled, owner }: PokeConditionalFetchProps) {
  const creditsFetcher: Fetcher<PokeListCreditsResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/credits`,
    creditsFetcher,
    { disabled }
  );

  const creditsData: PokeCreditsData = {
    credits: data?.credits ?? emptyArray(),
    excessCreditsLast30DaysMicroUsd: data?.excessCreditsLast30DaysMicroUsd ?? 0,
  };

  return {
    data: creditsData,
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}

export function usePokeProgrammaticCost({
  owner,
  groupBy,
  selectedPeriod,
  billingCycleStartDay,
  filter,
  disabled,
}: PokeConditionalFetchProps & {
  groupBy?: GroupByType;
  selectedPeriod?: string;
  billingCycleStartDay: number;
  filter?: Partial<Record<GroupByType, string[]>>;
}) {
  const fetcherFn: Fetcher<GetWorkspaceProgrammaticCostResponse> = fetcher;

  const queryParams = new URLSearchParams();
  queryParams.set("billingCycleStartDay", billingCycleStartDay.toString());
  if (selectedPeriod) {
    queryParams.set("selectedPeriod", selectedPeriod);
  }
  if (groupBy) {
    queryParams.set("groupBy", groupBy);
  }
  if (filter && Object.keys(filter).length > 0) {
    queryParams.set("filter", JSON.stringify(filter));
  }
  const queryString = queryParams.toString();
  const key = `/api/poke/workspaces/${owner.sId}/analytics/programmatic-cost?${queryString}`;

  const { data, error, isValidating } = useSWRWithDefaults(
    disabled ? null : key,
    fetcherFn
  );

  return {
    programmaticCostData: data,
    isProgrammaticCostLoading: !error && !data && !disabled,
    isProgrammaticCostError: error,
    isProgrammaticCostValidating: isValidating,
  };
}
