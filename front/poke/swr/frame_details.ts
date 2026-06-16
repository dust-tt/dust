import type { GetPokeFileResponseBody } from "@app/lib/api/poke/files";
import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
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
    shareInfo: data?.shareInfo ?? null,
    sharingGrants: data?.sharingGrants ?? [],
    isFileLoading: !error && !data && !disabled && !!sId,
    isFileError: error,
    mutateFile: mutate,
  };
}
