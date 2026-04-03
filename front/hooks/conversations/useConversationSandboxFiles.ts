import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type {
  GCSMountFileEntry,
  GetConversationFilesResponseBody,
} from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/files";
import type { LightWorkspaceType } from "@app/types/user";
import type { Fetcher } from "swr";

export function useConversationSandboxFiles({
  conversationId,
  owner,
  options,
}: {
  conversationId?: string | null;
  owner: LightWorkspaceType;
  options?: { disabled?: boolean };
}) {
  const { fetcher } = useFetcher();
  const sandboxFilesFetcher: Fetcher<GetConversationFilesResponseBody> =
    fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    conversationId
      ? `/api/w/${owner.sId}/assistant/conversations/${conversationId}/files`
      : null,
    sandboxFilesFetcher,
    options
  );

  const disabled = options?.disabled;

  return {
    sandboxFiles: data?.files ?? emptyArray<GCSMountFileEntry>(),
    isSandboxFilesLoading: !disabled && !error && !data,
    isSandboxFilesError: error,
    mutateSandboxFiles: mutate,
  };
}
