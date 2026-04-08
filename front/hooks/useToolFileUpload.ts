import type { FileUploaderService } from "@app/hooks/useFileUploaderService";
import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import type { ToolSearchResult } from "@app/lib/search/tools/types";
import type { ToolUploadRequestBody } from "@app/pages/api/w/[wId]/search/tools/upload";
import type { FileUseCaseMetadata } from "@app/types/files";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useState } from "react";

export function useToolFileUpload({
  owner,
  fileUploaderService,
  useCase,
  useCaseMetadata,
  onUploadSuccess,
}: {
  owner: LightWorkspaceType;
  fileUploaderService: FileUploaderService;
  useCase: "conversation" | "project_context";
  useCaseMetadata: FileUseCaseMetadata;
  onUploadSuccess: (file: File) => void;
}) {
  const [uploadingFileKeys, setUploadingFileKeys] = useState<Set<string>>(
    new Set()
  );
  const sendNotification = useSendNotification();

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

      const body: ToolUploadRequestBody = {
        serverViewId: toolFile.serverViewId,
        externalId: toolFile.externalId,
        useCase,
        useCaseMetadata,
        serverName: toolFile.serverName,
        serverIcon: toolFile.serverIcon,
      };

      try {
        const response = await clientFetch(
          `/api/w/${owner.sId}/search/tools/upload`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          }
        );

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error?.message ?? "Failed to upload file");
        }

        const { file } = await response.json();

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
        onUploadSuccess(file);
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
    [
      owner.sId,
      fileUploaderService,
      sendNotification,
      getFileKey,
      useCase,
      useCaseMetadata,
      onUploadSuccess,
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
    isAnyToolFileUploading: uploadingFileKeys.size > 0,
  };
}
