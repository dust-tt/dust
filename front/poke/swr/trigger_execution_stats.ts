import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeGetTriggerExecutionStats } from "@app/pages/api/poke/workspaces/[wId]/triggers/[tId]/execution_stats";
import type { LightWorkspaceType } from "@app/types/user";

interface UsePokeTriggerStatsProps {
  disabled?: boolean;
  owner: LightWorkspaceType;
  triggerId: string;
}

export function usePokeTriggerExecutionStats({
  disabled,
  owner,
  triggerId,
}: UsePokeTriggerStatsProps) {
  const statsFetcher: Fetcher<PokeGetTriggerExecutionStats> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/triggers/${triggerId}/execution_stats`,
    statsFetcher,
    { disabled }
  );

  return {
    data: data ?? null,
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}
