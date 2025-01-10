import { useMemo } from "react";
import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeListSpaces } from "@app/pages/api/poke/workspaces/[wId]/spaces";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";

export function usePokeSpaces({ disabled, owner }: PokeConditionalFetchProps) {
  const spacesFetcher: Fetcher<PokeListSpaces> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/spaces`,
    spacesFetcher,
    { disabled }
  );

  return {
    data: useMemo(() => (data ? data.spaces : []), [data]),
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}
