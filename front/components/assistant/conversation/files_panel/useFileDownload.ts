import { useSendNotification } from "@app/hooks/useNotification";
import { downloadSandboxFile } from "@app/lib/swr/files";
import logger from "@app/logger/logger";
import type { GCSMountFileEntry } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/files";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useRef } from "react";

/**
 * Returns a stable `download(entry)` callback that fetches the file, triggers a browser download,
 * and surfaces failures as a toast.
 */
export function useFileDownload({
  owner,
  conversationId,
}: {
  owner: LightWorkspaceType;
  conversationId: string;
}): (entry: GCSMountFileEntry) => Promise<void> {
  const sendNotification = useSendNotification();
  const blobUrlRef = useRef<string | null>(null);

  return useCallback(
    async (entry: GCSMountFileEntry) => {
      try {
        const res = await downloadSandboxFile(
          owner,
          conversationId,
          entry.path
        );

        const blob = await res.blob();

        if (blobUrlRef.current) {
          URL.revokeObjectURL(blobUrlRef.current);
        }

        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;

        const a = document.createElement("a");
        a.href = url;
        a.download = entry.fileName;
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
    [owner, conversationId, sendNotification]
  );
}
