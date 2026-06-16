import { useFileUploaderService as useFrontFileUploaderService } from "@app/hooks/useFileUploaderService";
import type { LightWorkspaceType } from "@app/types/user";
// biome-ignore lint/plugin/noDirectSparkleNotification: extension notification provider setup follows this pattern.
import { useSendNotification } from "@dust-tt/sparkle";
import { usePlatform } from "@extension/shared/context/PlatformContext";
import { useCallback, useMemo, useState } from "react";

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[\\/:*?"<>|]/g, "-").trim() || "page";
}

export function useSavePageToPod({ owner }: { owner: LightWorkspaceType }) {
  const platform = usePlatform();
  const sendNotification = useSendNotification();
  const [isCapturing, setIsCapturing] = useState(false);

  const { handleFilesUpload, isProcessingFiles, resetUpload } =
    useFrontFileUploaderService({
      hasSandboxTools: false,
      owner,
      useCase: "project_context",
    });

  const savePageToPod = useCallback(
    async (podId: string) => {
      if (!platform.capture) {
        return false;
      }

      setIsCapturing(true);

      try {
        const contentRes = await platform.capture.handleOperation(
          "capture-page-content",
          {
            includeContent: true,
            includeCapture: false,
          }
        );
        setIsCapturing(false);

        if (contentRes && contentRes.isErr()) {
          sendNotification({
            title: "Cannot get page content",
            description: contentRes.error.message,
            type: "error",
          });
          return false;
        }

        const tabContent =
          contentRes && contentRes.isOk() ? contentRes.value : null;

        if (!tabContent?.content) {
          sendNotification({
            title: "Cannot get page content",
            description: "No content found.",
            type: "error",
          });
          return false;
        }

        const parts = [];
        if (tabContent.title) {
          parts.push(`Title: ${tabContent.title}`);
        }
        if (tabContent.url) {
          parts.push(`URL: ${tabContent.url}`);
        }
        if (parts.length > 0) {
          parts.push("");
        }
        parts.push(tabContent.content);

        const file = new File(
          [parts.join("\n")],
          `${sanitizeFileName(tabContent.title || "page")}.md`,
          {
            type: "text/markdown",
          }
        );

        const uploadedFiles = await handleFilesUpload([file], {
          useCaseMetadata: { spaceId: podId },
        });

        resetUpload();

        if (!uploadedFiles || uploadedFiles.length === 0) {
          return false;
        }

        sendNotification({
          title: "Page saved",
          description: `Saved "${tabContent.title || "page"}" to the selected Pod.`,
          type: "success",
        });

        return true;
      } catch {
        sendNotification({
          title: "Cannot save page",
          description: "Something wrong happened.",
          type: "error",
        });
        setIsCapturing(false);
        return false;
      }
    },
    [handleFilesUpload, platform.capture, resetUpload, sendNotification]
  );

  return useMemo(
    () => ({
      isSaving: isCapturing || isProcessingFiles,
      savePageToPod,
    }),
    [isCapturing, isProcessingFiles, savePageToPod]
  );
}
