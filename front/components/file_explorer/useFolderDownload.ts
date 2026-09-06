import type { FolderDownloadEntry } from "@app/components/file_explorer/types";
import { useSendNotification } from "@app/hooks/useNotification";
import { prepareFolderArchiveDownload } from "@app/lib/swr/files";
import logger from "@app/logger/logger";
import { assertNever } from "@app/types/shared/utils/assert_never";
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
      let canonicalPath: string;
      let folderName: string;
      switch (entry.kind) {
        case "folder":
          canonicalPath = entry.path;
          folderName = entry.name;
          break;
        case "frame_package":
          canonicalPath = entry.sourceFolderCanonicalPath;
          folderName = entry.fileName;
          break;
        default:
          assertNever(entry);
      }

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
