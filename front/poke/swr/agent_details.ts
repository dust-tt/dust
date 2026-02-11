import type { Fetcher } from "swr";

import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import { emptyArray, fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeGetAgentDetails } from "@app/pages/api/poke/workspaces/[wId]/agent_configurations/[aId]/details";
import type { PokeGetDatasourceRetrievalResponse } from "@app/pages/api/poke/workspaces/[wId]/agent_configurations/[aId]/observability/datasource-retrieval";
import type { LightWorkspaceType } from "@app/types/user";

interface UsePokeAgentDetailsProps {
  disabled?: boolean;
  owner: LightWorkspaceType;
  aId: string;
}

export function usePokeAgentDetails({
  disabled,
  owner,
  aId,
}: UsePokeAgentDetailsProps) {
  const agentDetailsFetcher: Fetcher<PokeGetAgentDetails> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/agent_configurations/${aId}/details`,
    agentDetailsFetcher,
    { disabled }
  );

  return {
    data: data ?? null,
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}

interface UsePokeAgentDatasourceRetrievalProps {
  workspaceId: string;
  agentConfigurationId: string;
  days?: number;
  disabled?: boolean;
}

export function usePokeAgentDatasourceRetrieval({
  workspaceId,
  agentConfigurationId,
  days = DEFAULT_PERIOD_DAYS,
  disabled,
}: UsePokeAgentDatasourceRetrievalProps) {
  const fetcherFn: Fetcher<PokeGetDatasourceRetrievalResponse> = fetcher;
  const params = new URLSearchParams({ days: days.toString() });
  const key = `/api/poke/workspaces/${workspaceId}/agent_configurations/${agentConfigurationId}/observability/datasource-retrieval?${params.toString()}`;

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
