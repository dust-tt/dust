import type { Fetcher } from "swr";
import useSWR from "swr";

import { emptyArray, fetcher } from "@app/lib/swr/swr";
import type { GetProductionChecksResponseBody } from "@app/pages/api/poke/production-checks";
import type { GetCheckHistoryResponseBody } from "@app/pages/api/poke/production-checks/[checkName]/history";

const REFRESH_INTERVAL_MS = 30000;

export function usePokeProductionChecks() {
  const productionChecksFetcher: Fetcher<GetProductionChecksResponseBody> =
    fetcher;

  const { data, error, mutate } = useSWR(
    "/api/poke/production-checks",
    productionChecksFetcher,
    { refreshInterval: REFRESH_INTERVAL_MS }
  );

  return {
    checks: data?.checks ?? emptyArray(),
    isProductionChecksLoading: !error && !data,
    isProductionChecksError: error,
    mutateProductionChecks: mutate,
  };
}

export function usePokeCheckHistory(checkName: string, enabled: boolean) {
  const checkHistoryFetcher: Fetcher<GetCheckHistoryResponseBody> = fetcher;

  const { data, error, mutate } = useSWR(
    enabled
      ? `/api/poke/production-checks/${encodeURIComponent(checkName)}/history`
      : null,
    checkHistoryFetcher
  );

  return {
    runs: data?.runs ?? emptyArray(),
    isCheckHistoryLoading: enabled && !error && !data,
    isCheckHistoryError: error,
    mutateCheckHistory: mutate,
  };
}
