import type {
  FileEntry,
  FramePackageEntry,
} from "@app/components/file_explorer/types";
import { getParentFolderRelativePath } from "@app/components/file_explorer/utils";
import { useSendNotification } from "@app/hooks/useNotification";
import logger from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { useCallback, useRef } from "react";

export type DownloadableEntry = FileEntry | FramePackageEntry;

/**
 * Files download as-is. A Frame package downloads its whole source folder as a zip, fetched
 * through `getFolderArchiveResponse` with the folder's canonical path.
 */
export function useFileDownload({
  getFileResponse,
  getFolderArchiveResponse,
}: {
  getFileResponse: (path: string) => Promise<Response>;
  getFolderArchiveResponse: (folderPath: string) => Promise<Response>;
}): (entry: DownloadableEntry) => Promise<void> {
  const sendNotification = useSendNotification();
  const blobUrlRef = useRef<string | null>(null);

  return useCallback(
    async (entry: DownloadableEntry) => {
      try {
        const isPackage = entry.kind === "frame_package";
        // The package entry's path is its manifest; the archive covers the manifest's folder.
        const res = isPackage
          ? await getFolderArchiveResponse(
              getParentFolderRelativePath(entry.path)
            )
          : await getFileResponse(entry.path);
        const downloadName = isPackage
          ? `${entry.fileName}.zip`
          : entry.fileName;

        const blob = await res.blob();

        if (blobUrlRef.current) {
          URL.revokeObjectURL(blobUrlRef.current);
        }

        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;

        const a = document.createElement("a");
        a.href = url;
        a.download = downloadName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } catch (err) {
        logger.error({ err: normalizeError(err) }, "Failed to download file");

        sendNotification({
          type: "error",
          title: "Failed to download the file.",
          description: "An error occurred while downloading. Please try again.",
        });
      }
    },
    [getFileResponse, getFolderArchiveResponse, sendNotification]
  );
}
