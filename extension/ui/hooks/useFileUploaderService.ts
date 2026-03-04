import { useFileUploaderService as useFrontFileUploaderService } from "@app/hooks/useFileUploaderService";
import { useAuth } from "@app/lib/auth/AuthContext";
import type { ConversationPublicType } from "@dust-tt/client";
// biome-ignore lint/plugin/noDirectSparkleNotification: existing usage
import { useSendNotification } from "@dust-tt/sparkle";
import type {
  CaptureOptions,
  CaptureService,
} from "@extension/shared/services/capture";
import { useCallback, useMemo, useState } from "react";

export const MAX_FILE_SIZES: Record<"plainText" | "image", number> = {
  plainText: 30 * 1024 * 1024, // 30MB.
  image: 5 * 1024 * 1024, // 5 MB
};

export function useFileUploaderService(
  captureService: CaptureService,
  conversationId: string | null
) {
  const [isCapturing, setIsCapturing] = useState(false);
  const sendNotification = useSendNotification();
  const { workspace } = useAuth();

  const useCaseMetadata = useMemo(() => {
    if (!conversationId) {
      return undefined;
    }
    return {
      conversationId,
    };
  }, [conversationId]);

  const {
    handleFilesUpload,
    resetUpload,
    fileBlobs,
    handleFileChange,
    removeFile,
    addUploadedFile,
    getFileBlob,
    getFileBlobs,
    isProcessingFiles,
  } = useFrontFileUploaderService({
    owner: workspace,
    useCase: "conversation",
    useCaseMetadata,
  });

  const findAvailableTitle = useCallback(
    (baseTitle: string, ext: string, existingTitles: string[]) => {
      let count = 1;
      let title = `${baseTitle}.${ext}`;
      while (existingTitles.includes(title)) {
        title = `${baseTitle}-${count++}.${ext}`;
      }
      existingTitles.push(title);
      return title;
    },
    []
  );

  const uploadContentTab = useCallback(
    async ({
      conversation,
      includeContent,
      includeSelectionOnly,
      includeCapture,
      onUpload,
    }: {
      conversation?: ConversationPublicType;
      onUpload?: () => void;
    } & CaptureOptions) => {
      setIsCapturing(includeCapture ?? false);

      try {
        const contentRes = await captureService.handleOperation(
          "capture-page-content",
          {
            includeContent,
            includeSelectionOnly,
            includeCapture,
          }
        );
        setIsCapturing(false);

        if (contentRes && contentRes.isErr()) {
          sendNotification({
            title: "Cannot get page content",
            description: contentRes.error.message,
            type: "error",
          });
          return;
        }

        const tabContent =
          contentRes && contentRes.isOk() ? contentRes.value : null;

        const existingTitles = fileBlobs.map((f) => f.filename);

        if (includeContent) {
          if (!tabContent?.content) {
            sendNotification({
              title: "Cannot get page content",
              description: "No content found.",
              type: "error",
            });
            return;
          }

          const title = findAvailableTitle(
            includeSelectionOnly
              ? `[selection] ${tabContent.title}`
              : `[text] ${tabContent.title}`,
            "txt",
            existingTitles
          );

          // Check if the content is already uploaded - compare the title and the size of the content.
          const messages =
            conversation?.content.map((m) => m[m.length - 1]) || [];
          const alreadyUploaded = messages.some(
            (m) =>
              m.type === "content_fragment" &&
              m.contentFragmentType === "file" &&
              m.title === title &&
              m.textBytes === new Blob([tabContent.content ?? ""]).size
          );

          if (tabContent && tabContent.content && !alreadyUploaded) {
            const file = new File([tabContent.content], title, {
              type: "text/plain",
            });

            if (onUpload) {
              onUpload();
            }

            const fragments = await handleFilesUpload([file]);
            if (fragments) {
              fragments.forEach((f) => {
                f.publicUrl = tabContent.url;
              });
            }

            return fragments;
          }
        }

        if (includeCapture) {
          if (!tabContent?.captures) {
            sendNotification({
              title: "Cannot get page content",
              description: "No content found.",
              type: "error",
            });
            return;
          }

          const blobs = await Promise.all(
            tabContent.captures.map(async (c) => {
              const response = await fetch(c);
              return response.blob();
            })
          );

          const files = blobs.map(
            (blob) =>
              new File(
                [blob],
                findAvailableTitle(
                  `[screenshot] ${tabContent.title}`,
                  "jpg",
                  existingTitles
                ),
                {
                  type: blob.type,
                }
              )
          );

          if (onUpload) {
            onUpload();
          }

          return await handleFilesUpload(files);
        }
      } catch (err) {
        console.log(err);
        sendNotification({
          title: "Cannot get page content",
          description: "Something wrong happened.",
          type: "error",
        });
        setIsCapturing(false);
      }
    },
    [
      captureService.handleOperation,
      fileBlobs.map,
      findAvailableTitle,
      handleFilesUpload,
      sendNotification,
    ]
  );

  const value = useMemo(
    () => ({
      isCapturing,
      fileBlobs,
      handleFileChange,
      removeFile,
      addUploadedFile,
      getFileBlob,
      getFileBlobs,
      handleFilesUpload,
      isProcessingFiles,
      resetUpload,
      uploadContentTab,
    }),
    [
      isCapturing,
      fileBlobs,
      handleFileChange,
      removeFile,
      addUploadedFile,
      getFileBlob,
      getFileBlobs,
      handleFilesUpload,
      isProcessingFiles,
      resetUpload,
      uploadContentTab,
    ]
  );

  return value;
}

export type FileUploaderService = ReturnType<typeof useFileUploaderService>;
