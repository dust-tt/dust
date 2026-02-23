import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeGetWorkspaceDatasourceRetrievalResponse } from "@app/pages/api/poke/workspaces/[wId]/observability/datasource-retrieval";
import type { PokeGetWorkspaceInfo } from "@app/pages/api/poke/workspaces/[wId]/workspace-info";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import type { Fetcher } from "swr";

export function usePokeWorkspaceInfo({
  disabled,
  owner,
}: PokeConditionalFetchProps) {
  const { fetcher } = useFetcher();
  const workspaceInfoFetcher: Fetcher<PokeGetWorkspaceInfo> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/workspace-info`,
    workspaceInfoFetcher,
    { disabled }
  );

  return {
    data: data ?? null,
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}

interface UsePokeWorkspaceDatasourceRetrievalProps {
  workspaceId: string;
  days?: number;
  disabled?: boolean;
}

export function usePokeWorkspaceDatasourceRetrieval({
  workspaceId,
  days = DEFAULT_PERIOD_DAYS,
  disabled,
}: UsePokeWorkspaceDatasourceRetrievalProps) {
  const { fetcher } = useFetcher();
  const fetcherFn: Fetcher<PokeGetWorkspaceDatasourceRetrievalResponse> =
    fetcher;
  const params = new URLSearchParams({ days: days.toString() });
  const key = `/api/poke/workspaces/${workspaceId}/observability/datasource-retrieval?${params.toString()}`;

  const { data, error, isValidating } = useSWRWithDefaults(
    disabled ? null : key,
    fetcherFn
  );

  return {
    datasourceRetrieval: data?.datasources ?? emptyArray(),
    totalRetrievals: data?.total ?? 0,
    isDatasourceRetrievalLoading: !error && !data && !disabled,
    isDatasourceRetrievalError: error,
    isDatasourceRetrievalValidating: isValidating,
  };
}
