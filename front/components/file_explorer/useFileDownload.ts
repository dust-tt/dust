import type { FileEntry } from "@app/components/file_explorer/types";
import { useSendNotification } from "@app/hooks/useNotification";
import logger from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { useCallback, useRef } from "react";

export function useFileDownload({
  getFileResponse,
}: {
  getFileResponse: (path: string) => Promise<Response>;
}): (entry: FileEntry) => Promise<void> {
  const sendNotification = useSendNotification();
  const blobUrlRef = useRef<string | null>(null);

  return useCallback(
    async (entry: FileEntry) => {
      try {
        const res = await getFileResponse(entry.path);

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
    [getFileResponse, sendNotification]
  );
}
