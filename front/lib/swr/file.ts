import type { LightWorkspaceType } from "@dust-tt/types";
import type { SWRConfiguration } from "swr";

import { useSWRWithDefaults } from "@app/lib/swr/swr";

export const getFileProcessedUrl = (
  owner: LightWorkspaceType,
  fileId: string
) => `/api/w/${owner.sId}/files/${fileId}?action=view&version=processed`;

export function useFileProcessedContent(
  owner: LightWorkspaceType,
  fileId: string | null,
  config?: SWRConfiguration & {
    disabled?: boolean;
  }
) {
  const isDisabled = config?.disabled || fileId === null;

  const {
    data: response,
    error,
    mutate,
  } = useSWRWithDefaults(
    isDisabled ? null : getFileProcessedUrl(owner, fileId),
    // Stream fetcher -> don't try to parse the stream
    // Wait for initial response to trigger swr error handling
    async (...args) => {
      const response = await fetch(...args);
      if (!response.ok) {
        throw new Error(`Error reading the file content: ${response.status}`);
      }
      return response;
    },
    config
  );

  return {
    // Do not extract text from the response -> Allows streaming on client side
    content: () => response ?? null,
    isContentLoading: isDisabled ? false : !error && !response,
    isContentError: isDisabled ? false : error,
    mutateFileProcessedContent: mutate,
  };
}
