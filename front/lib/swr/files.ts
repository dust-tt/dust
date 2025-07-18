import type { FileType } from "@dust-tt/client";

import { useSWRWithDefaults } from "@app/lib/swr/swr";
import type { LightWorkspaceType } from "@app/types";

export function useFileMetadata({
  fileId,
  owner,
}: {
  fileId: string | null;
  owner: LightWorkspaceType;
}) {
  const { data, error, mutate } = useSWRWithDefaults<string, FileType>(
    `/api/w/${owner.sId}/files/${fileId}/metadata`,
    async (url: string) => {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(
          `Failed to fetch file metadata: ${response.statusText}`
        );
      }

      return response.json();
    }
  );

  return {
    fileMetadata: data,
    isFileMetadataLoading: !error && !data,
    isFileMetadataError: error,
    mutateFileMetadata: mutate,
  };
}

export function useFileContent({
  fileId,
  owner,
}: {
  fileId: string;
  owner: LightWorkspaceType;
}) {
  const { data, error, mutate } = useSWRWithDefaults<string, string>(
    `/api/w/${owner.sId}/files/${fileId}?action=view`,
    async (url: string) => {
      const response = await fetch(url);

      return response.text();
    }
  );

  return {
    error,
    fileContent: data,
    isFileContentLoading: !error && !data,
    mutateFileContent: mutate,
  };
}
