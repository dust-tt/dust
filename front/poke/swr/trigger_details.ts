import type { PokeGetTriggerDetails } from "@app/lib/api/poke/triggers";
import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { LightWorkspaceType } from "@app/types/user";
import type { Fetcher } from "swr";

interface UsePokeTriggerDetailsProps {
  disabled?: boolean;
  owner: LightWorkspaceType;
  triggerId: string;
}

export function usePokeTriggerDetails({
  disabled,
  owner,
  triggerId,
}: UsePokeTriggerDetailsProps) {
  const { fetcher } = useFetcher();
  const triggerDetailsFetcher: Fetcher<PokeGetTriggerDetails> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/triggers/${triggerId}/details`,
    triggerDetailsFetcher,
    { disabled }
  );

  return {
    data: data ?? null,
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}
