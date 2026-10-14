import type { FileEntry } from "@app/components/file_explorer/types";
import { useFileMetadataFromPath } from "@app/lib/swr/files";
import { contentTypeFromFileName } from "@app/types/files";
import type { LightWorkspaceType } from "@app/types/user";
import { useMemo } from "react";

/**
 * The file explorer entry of a conversation or pod file known only by its path, typed from its
 * metadata, or from its file name until the metadata loads; null once the file is not found.
 */
export function useFileEntryFromPath({
  owner,
  filePath,
}: {
  owner: LightWorkspaceType;
  filePath: string;
}): { entry: FileEntry | null; isLoading: boolean; isNotFound: boolean } {
  const { metadata, isFileMetadataLoading, isFileMetadataNotFound } =
    useFileMetadataFromPath({ owner, filePath });

  const fileName = filePath.split("/").pop() ?? filePath;
  const contentType =
    metadata?.contentType ??
    contentTypeFromFileName(fileName) ??
    "application/octet-stream";

  const entry: FileEntry | null = useMemo(() => {
    if (isFileMetadataNotFound) {
      return null;
    }
    return {
      kind: "file",
      isDirectory: false,
      fileName,
      path: filePath,
      contentType,
      fileId: metadata?.fileId ?? null,
      thumbnailUrl: null,
      sizeBytes: metadata?.sizeBytes ?? 0,
      lastModifiedMs: 0,
    };
  }, [
    contentType,
    fileName,
    filePath,
    isFileMetadataNotFound,
    metadata?.fileId,
    metadata?.sizeBytes,
  ]);

  return {
    entry,
    isLoading: isFileMetadataLoading,
    isNotFound: isFileMetadataNotFound,
  };
}
