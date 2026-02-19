import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeGetDocument } from "@app/pages/api/poke/workspaces/[wId]/data_sources/[dsId]/document";
import type { LightWorkspaceType } from "@app/types/user";
import type { Fetcher } from "swr";

interface UsePokeDocumentProps {
  disabled?: boolean;
  owner: LightWorkspaceType;
  dsId: string;
  documentId: string | null;
}

export function usePokeDocument({
  disabled,
  owner,
  dsId,
  documentId,
}: UsePokeDocumentProps) {
  const documentFetcher: Fetcher<PokeGetDocument> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    documentId
      ? `/api/poke/workspaces/${owner.sId}/data_sources/${dsId}/document?documentId=${encodeURIComponent(documentId)}`
      : null,
    documentFetcher,
    { disabled: disabled ?? !documentId }
  );

  return {
    data: data ?? null,
    isLoading: !error && !data && !disabled && !!documentId,
    isError: error,
    mutate,
  };
}
