import type { PokeGetTriggerExecutionStats } from "@app/lib/api/poke/triggers";
import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { LightWorkspaceType } from "@app/types/user";
import type { Fetcher } from "swr";

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
  const { fetcher } = useFetcher();
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
