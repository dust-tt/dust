import type { GetConversationFilesResponseBody } from "@app/lib/api/assistant/conversation/files";
import type { FileSystemEntry } from "@app/lib/api/file_system/types";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
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
    { keepPreviousData: true, ...options }
  );

  const disabled = options?.disabled;

  return {
    sandboxFiles: data?.files ?? emptyArray<FileSystemEntry>(),
    isSandboxFilesLoading: !disabled && !error && !data,
    isSandboxFilesError: error,
    mutateSandboxFiles: mutate,
  };
}
