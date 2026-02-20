import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetConversationFilesResponseBody } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/files";
import type { LightWorkspaceType } from "@app/types/user";
import { useMemo } from "react";
import type { Fetcher } from "swr";

export function useConversationFiles({
  conversationId,
  options,
  owner,
}: {
  conversationId?: string | null;
  options?: { disabled?: boolean };
  owner: LightWorkspaceType;
}) {
  const { fetcher } = useFetcher();
  const conversationFilesFetcher: Fetcher<GetConversationFilesResponseBody> =
    fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    conversationId
      ? `/api/w/${owner.sId}/assistant/conversations/${conversationId}/files`
      : null,
    conversationFilesFetcher,
    options
  );

  return {
    conversationFiles: useMemo(() => data?.files ?? [], [data]),
    isConversationFilesLoading: !error && !data,
    isConversationFilesError: error,
    mutateConversationFiles: mutate,
  };
}
