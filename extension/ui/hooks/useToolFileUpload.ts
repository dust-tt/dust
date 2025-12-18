import { useDustAPI } from "@app/shared/lib/dust_api";
import type { FileUploaderService } from "@app/ui/hooks/useFileUploaderService";
import type { ToolSearchResult } from "@app/ui/hooks/useUnifiedSearch";
import type { SupportedFileContentType } from "@dust-tt/client";
import { useSendNotification } from "@dust-tt/sparkle";
import { useCallback, useState } from "react";

export function useToolFileUpload({
  fileUploaderService,
  conversationId,
}: {
  fileUploaderService: FileUploaderService;
  conversationId?: string;
}) {
  const [uploadingFileKeys, setUploadingFileKeys] = useState<Set<string>>(
    new Set()
  );
  const sendNotification = useSendNotification();
  const dustAPI = useDustAPI();

  const getFileKey = useCallback(
    (file: ToolSearchResult) => `${file.serverViewId}-${file.externalId}`,
    []
  );

  const isToolFileAttached = useCallback(
    (file: ToolSearchResult) => {
      return fileUploaderService.fileBlobs.some(
        (blob) => blob.id === `tool-${getFileKey(file)}`
      );
    },
    [fileUploaderService.fileBlobs, getFileKey]
  );

  const isToolFileUploading = useCallback(
    (file: ToolSearchResult) => {
      return uploadingFileKeys.has(getFileKey(file));
    },
    [uploadingFileKeys, getFileKey]
  );

  const uploadToolFile = useCallback(
    async (toolFile: ToolSearchResult) => {
      const fileKey = getFileKey(toolFile);

      setUploadingFileKeys((prev) => new Set(prev).add(fileKey));

      try {
        const response = await dustAPI.request({
          method: "POST",
          path: `search/tools/upload`,
          body: {
            serverViewId: toolFile.serverViewId,
            externalId: toolFile.externalId,
            conversationId,
            serverName: toolFile.serverName,
            serverIcon: toolFile.serverIcon,
          },
        });

        if (response.isErr()) {
          throw new Error(response.error.message ?? "Failed to upload file");
        }

        // Parse the response body (which is a string for non-stream responses)
        const responseBody = response.value.response.body;
        if (typeof responseBody !== "string") {
          throw new Error("Unexpected response format");
        }

        const data = JSON.parse(responseBody) as {
          file: {
            sId: string;
            fileName: string;
            contentType: string;
            fileSize: number;
          };
        };
        const { file } = data;

        fileUploaderService.addUploadedFile({
          id: `tool-${fileKey}`,
          fileId: file.sId,
          filename: toolFile.title,
          contentType: file.contentType as SupportedFileContentType,
          size: file.fileSize,
          sourceUrl: toolFile.sourceUrl ?? undefined,
          iconName: toolFile.serverIcon,
          provider: toolFile.serverName,
        });
      } catch (error) {
        sendNotification({
          type: "error",
          title: "Failed to attach file",
          description:
            error instanceof Error ? error.message : "Unknown error occurred",
        });
      } finally {
        setUploadingFileKeys((prev) => {
          const next = new Set(prev);
          next.delete(fileKey);
          return next;
        });
      }
    },
    [fileUploaderService, sendNotification, getFileKey, conversationId, dustAPI]
  );

  const removeToolFile = useCallback(
    (file: ToolSearchResult) => {
      fileUploaderService.removeFile(`tool-${getFileKey(file)}`);
    },
    [fileUploaderService, getFileKey]
  );

  return {
    getToolFileKey: getFileKey,
    isToolFileAttached,
    isToolFileUploading,
    uploadToolFile,
    removeToolFile,
  };
}
