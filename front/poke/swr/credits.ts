import type { Fetcher } from "swr";

import type {
  GetWorkspaceProgrammaticCostResponse,
  GroupByType,
} from "@app/lib/api/analytics/programmatic_cost";
import { emptyArray, fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeListCreditsResponseBody } from "@app/pages/api/poke/workspaces/[wId]/credits";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";

export function usePokeCredits({ disabled, owner }: PokeConditionalFetchProps) {
  const creditsFetcher: Fetcher<PokeListCreditsResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/credits`,
    creditsFetcher,
    { disabled }
  );

  return {
    data: data?.credits ?? emptyArray(),
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}

export function usePokeProgrammaticCost({
  owner,
  groupBy,
  selectedMonth,
  filter,
  disabled,
}: PokeConditionalFetchProps & {
  groupBy?: GroupByType;
  selectedMonth?: string;
  filter?: Partial<Record<GroupByType, string[]>>;
}) {
  const fetcherFn: Fetcher<GetWorkspaceProgrammaticCostResponse> = fetcher;

  const queryParams = new URLSearchParams();
  if (selectedMonth) {
    queryParams.set("selectedMonth", selectedMonth);
  }
  if (groupBy) {
    queryParams.set("groupBy", groupBy);
  }
  if (filter && Object.keys(filter).length > 0) {
    queryParams.set("filter", JSON.stringify(filter));
  }
  const queryString = queryParams.toString();
  const key = `/api/poke/workspaces/${owner.sId}/analytics/programmatic-cost${queryString ? `?${queryString}` : ""}`;

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
