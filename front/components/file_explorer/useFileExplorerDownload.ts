import type {
  FileEntry,
  FileExplorerDownloadEntry,
} from "@app/components/file_explorer/types";
import { useFileDownload } from "@app/components/file_explorer/useFileDownload";
import { useSendNotification } from "@app/hooks/useNotification";
import { prepareFolderArchiveDownload } from "@app/lib/swr/files";
import logger from "@app/logger/logger";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback } from "react";

type FolderDownloadEntry = Exclude<FileExplorerDownloadEntry, FileEntry>;

/**
 * @cc [owner:davidebbo,label:product] explorer-download-entry-routing
 * `file` entries download their file content, `folder` entries archive `path`, and
 * `frame_package` entries archive `sourceFolderCanonicalPath`.
 */
export function useFileExplorerDownload({
  owner,
  getFileResponse,
}: {
  owner: LightWorkspaceType;
  getFileResponse: (path: string) => Promise<Response>;
}): (entry: FileExplorerDownloadEntry) => Promise<void> {
  const sendNotification = useSendNotification();
  const onFileDownload = useFileDownload({ getFileResponse });

  const onFolderDownload = useCallback(
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
          return assertNeverAndIgnore(entry);
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

  return useCallback(
    async (entry: FileExplorerDownloadEntry) => {
      switch (entry.kind) {
        case "file":
          return onFileDownload(entry);
        case "folder":
        case "frame_package":
          return onFolderDownload(entry);
        default:
          return assertNeverAndIgnore(entry);
      }
    },
    [onFileDownload, onFolderDownload]
  );
}
