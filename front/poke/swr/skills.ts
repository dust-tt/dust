import type { Fetcher } from "swr";

import { emptyArray, fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetPokeSkillsResponseBody } from "@app/pages/api/poke/workspaces/[wId]/skills";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";

export function usePokeSkills({ disabled, owner }: PokeConditionalFetchProps) {
  const skillsFetcher: Fetcher<GetPokeSkillsResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/skills`,
    skillsFetcher,
    { disabled }
  );

  return {
    data: data?.skills ?? emptyArray(),
    isLoading: !error && !data,
    isError: error,
    mutate,
  };
}
