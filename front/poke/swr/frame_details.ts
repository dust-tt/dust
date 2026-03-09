import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetPokeFileResponseBody } from "@app/pages/api/poke/workspaces/[wId]/files/[sId]";
import type { LightWorkspaceType } from "@app/types/user";
import type { Fetcher } from "swr";

export function usePokeFileDetails({
  owner,
  sId,
  disabled,
}: {
  owner: LightWorkspaceType;
  sId: string | null;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
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
