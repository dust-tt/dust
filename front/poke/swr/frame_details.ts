import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetPokeFileResponseBody } from "@app/pages/api/poke/workspaces/[wId]/files/[sId]";
import type { LightWorkspaceType } from "@app/types/user";

export function usePokeFileDetails({
  owner,
  sId,
  disabled,
}: {
  owner: LightWorkspaceType;
  sId: string | null;
  disabled?: boolean;
}) {
  const fileFetcher: Fetcher<GetPokeFileResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    sId && !disabled ? `/api/poke/workspaces/${owner.sId}/files/${sId}` : null,
    fileFetcher
  );

  return {
    file: data?.file ?? null,
    content: data?.content ?? null,
    isFileLoading: !error && !data && !disabled && !!sId,
    isFileError: error,
    mutateFile: mutate,
  };
}
