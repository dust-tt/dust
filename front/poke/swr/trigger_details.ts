import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeGetTriggerDetails } from "@app/pages/api/poke/workspaces/[wId]/triggers/[tId]/details";
import type { LightWorkspaceType } from "@app/types/user";

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
