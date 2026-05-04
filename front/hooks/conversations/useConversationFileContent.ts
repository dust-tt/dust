import { parseScopedFilePath } from "@app/lib/api/files/mount_path";
import { clientFetch } from "@app/lib/egress/client";
import { useSWRWithDefaults } from "@app/lib/swr/swr";
import type { LightWorkspaceType } from "@app/types/user";
import { normalizeError } from "@app/types/shared/utils/error_utils";

export function useConversationFileContent({
  owner,
  conversationId,
  filePath,
  disabled,
}: {
  owner: LightWorkspaceType;
  conversationId: string;
  filePath: string | null;
  disabled?: boolean;
}) {
  const isDisabled = disabled || !filePath;
  const scoped = filePath ? parseScopedFilePath(filePath) : null;
  const rel = scoped ? scoped.rel : filePath;
  const url = rel
    ? `/api/w/${owner.sId}/assistant/conversations/${conversationId}/files/${rel}`
    : null;

  const { data, error } = useSWRWithDefaults<string | null, string>(
    url,
    async (u: string) => {
      const response = await clientFetch(u);
      if (!response.ok) {
        throw new Error("Failed to fetch file content");
      }
      return response.text();
    },
    { disabled: isDisabled }
  );

  return {
    fileContent: data ?? null,
    isFileContentLoading: !error && data === undefined && !isDisabled,
    fileContentError: error ? normalizeError(error) : null,
  };
}
