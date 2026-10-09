import type { FileUploaderService } from "@app/hooks/useFileUploaderService";
import { useSendApiErrorNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import type { ToolUploadRequestBody } from "@app/lib/search/tools/search";
import type { ToolSearchResult } from "@app/lib/search/tools/types";
import { getErrorFromResponse } from "@app/lib/swr/swr";
import type { FileUseCaseMetadata } from "@app/types/files";
import type { LightWorkspaceType } from "@app/types/user";
import { useLingui } from "@lingui/react/macro";
import { useCallback, useState } from "react";

export function useToolFileUpload({
  owner,
  fileUploaderService,
  useCaseMetadata,
  onUploadSuccess,
}: {
  owner: LightWorkspaceType;
  fileUploaderService: FileUploaderService;
  useCaseMetadata: FileUseCaseMetadata;
  onUploadSuccess: (file: File) => void;
}) {
  const [uploadingFileKeys, setUploadingFileKeys] = useState<Set<string>>(
    new Set()
  );
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();

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
          throw await getErrorFromResponse(response);
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
        sendApiErrorNotification({ title: t`Failed to attach file`, error });
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
      sendApiErrorNotification,
      getFileKey,
      useCaseMetadata,
      onUploadSuccess,
      t,
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
