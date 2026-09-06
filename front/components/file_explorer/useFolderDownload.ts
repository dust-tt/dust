import type { FolderDownloadEntry } from "@app/components/file_explorer/types";
import { useSendNotification } from "@app/hooks/useNotification";
import { prepareFolderArchiveDownload } from "@app/lib/swr/files";
import logger from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback } from "react";

export function useFolderDownload({
  owner,
}: {
  owner: LightWorkspaceType;
}): (entry: FolderDownloadEntry) => Promise<void> {
  const sendNotification = useSendNotification();

  return useCallback(
    async (entry: FolderDownloadEntry) => {
      const canonicalPath =
        entry.kind === "folder" ? entry.path : entry.sourceFolderCanonicalPath;
      const folderName = entry.kind === "folder" ? entry.name : entry.fileName;

      try {
        const url = await prepareFolderArchiveDownload({
          owner,
          canonicalPath,
        });
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${folderName}.zip`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      } catch (err) {
        logger.error(
          { err: normalizeError(err), canonicalPath },
          "Failed to download folder"
        );
        sendNotification({
          type: "error",
          title: "Failed to download the folder.",
          description: "An error occurred while downloading. Please try again.",
        });
      }
    },
    [owner, sendNotification]
  );
}
