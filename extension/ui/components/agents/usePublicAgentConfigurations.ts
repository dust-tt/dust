import { useDustAPI } from "@app/shared/lib/dust_api";
import { createAgentConfigurationsFetcher } from "@app/shared/lib/fetchers";
import { useSWRWithDefaults } from "@app/shared/lib/swr";
import type { AgentConfigurationViewType } from "@dust-tt/client";
import { useMemo } from "react";

export function usePublicAgentConfigurations(
  view?: AgentConfigurationViewType,
  includes: "authors"[] = []
) {
  const dustAPI = useDustAPI();

  const fetcher = useMemo(
    () => createAgentConfigurationsFetcher(dustAPI, view, includes),
    [dustAPI, view, includes]
  );

  const { data, error, mutate, mutateRegardlessOfQueryParams } =
    useSWRWithDefaults(
      dustAPI ? ["getAgentConfigurations", dustAPI.workspaceId(), view] : null,
      fetcher
    );

  return {
    agentConfigurations: useMemo(() => data ?? [], [data]),
    isAgentConfigurationsLoading: !error && !data,
    isAgentConfigurationsError: error,
    mutate,
    mutateRegardlessOfQueryParams,
  };
}
