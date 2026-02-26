import type { FileUploaderService } from "@app/hooks/useFileUploaderService";
import { useSendNotification } from "@app/hooks/useNotification";
import type { ToolSearchResult } from "@app/lib/search/tools/types";
import { useFetcher } from "@app/lib/swr/swr";
import { isAPIErrorResponse } from "@app/types/error";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useState } from "react";

export function useToolFileUpload({
  owner,
  fileUploaderService,
  conversationId,
}: {
  owner: LightWorkspaceType;
  fileUploaderService: FileUploaderService;
  conversationId?: string;
}) {
  const [uploadingFileKeys, setUploadingFileKeys] = useState<Set<string>>(
    new Set()
  );
  const sendNotification = useSendNotification();
  const { fetcherWithBody } = useFetcher();

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
        const { file } = await fetcherWithBody([
          `/api/w/${owner.sId}/search/tools/upload`,
          {
            serverViewId: toolFile.serverViewId,
            externalId: toolFile.externalId,
            conversationId,
            serverName: toolFile.serverName,
            serverIcon: toolFile.serverIcon,
          },
          "POST",
        ]);

        fileUploaderService.addUploadedFile({
          id: `tool-${fileKey}`,
          fileId: file.sId,
          filename: toolFile.title,
          contentType: file.contentType,
          size: file.fileSize,
          sourceUrl: toolFile.sourceUrl ?? undefined,
          iconName: toolFile.serverIcon,
          provider: toolFile.serverName,
        });
      } catch (error) {
        sendNotification({
          type: "error",
          title: "Failed to attach file",
          description: isAPIErrorResponse(error)
            ? error.error.message
            : "Unknown error occurred",
        });
      } finally {
        setUploadingFileKeys((prev) => {
          const next = new Set(prev);
          next.delete(fileKey);
          return next;
        });
      }
    },
    [
      owner.sId,
      fileUploaderService,
      sendNotification,
      getFileKey,
      conversationId,
      fetcherWithBody,
    ]
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
