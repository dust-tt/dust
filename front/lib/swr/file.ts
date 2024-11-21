import type { LightWorkspaceType } from "@dust-tt/types";
import type { SWRConfiguration } from "swr";

import { useSWRWithDefaults } from "@app/lib/swr/swr";

export function useFileProcessedContent(
  owner: LightWorkspaceType,
  fileId: string,
  config?: SWRConfiguration & {
    disabled?: boolean;
  }
) {
  const {
    data: response,
    error,
    mutate,
  } = useSWRWithDefaults(
    `/api/w/${owner.sId}/files/${fileId}?action=view&version=processed`,
    // Stream fetcher -> don;t try to parse the stream
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
    content: () => (response ? response : null),
    isContentLoading: config?.disabled ? false : !error && !response,
    isContentError: config?.disabled ? false : error,
    mutateFileProcessedContent: mutate,
  };
}
