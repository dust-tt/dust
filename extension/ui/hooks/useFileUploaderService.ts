import { useDustAPI } from "@app/shared/lib/dust_api";
import type { UploadedFileKind } from "@app/shared/lib/types";
import type {
  CaptureOptions,
  CaptureService,
} from "@app/shared/services/capture";
import type {
  ConversationPublicType,
  Result,
  SupportedFileContentType,
} from "@dust-tt/client";
import {
  Err,
  isSupportedFileContentType,
  isSupportedImageContentType,
  Ok,
} from "@dust-tt/client";
import { useSendNotification } from "@dust-tt/sparkle";
import { useState } from "react";

interface FileBlob {
  contentType: SupportedFileContentType;
  kind: UploadedFileKind;
  file: File;
  filename: string;
  id: string;
  fileId: string | null;
  isUploading: boolean;
  preview?: string;
  size: number;
  publicUrl?: string;
}

type FileBlobUploadErrorCode =
  | "failed_to_upload_file"
  | "file_type_not_supported";

class FileBlobUploadError extends Error {
  constructor(
    readonly code: FileBlobUploadErrorCode,
    readonly file: File,
    msg?: string
  ) {
    super(msg);
  }
}

export const MAX_FILE_SIZES: Record<"plainText" | "image", number> = {
  plainText: 30 * 1024 * 1024, // 30MB.
  image: 5 * 1024 * 1024, // 5 MB
};

const COMBINED_MAX_TEXT_FILES_SIZE = MAX_FILE_SIZES["plainText"] * 2;
const COMBINED_MAX_IMAGE_FILES_SIZE = MAX_FILE_SIZES["image"] * 5;

export function useFileUploaderService(
  captureService: CaptureService,
  conversationId?: string
) {
  const [fileBlobs, setFileBlobs] = useState<FileBlob[]>([]);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const sendNotification = useSendNotification();
  const dustAPI = useDustAPI();

  const findAvailableTitle = (
    baseTitle: string,
    ext: string,
    existingTitles: string[]
  ) => {
    let count = 1;
    let title = `${baseTitle}.${ext}`;
    while (existingTitles.includes(title)) {
      title = `${baseTitle}-${count++}.${ext}`;
    }
    existingTitles.push(title);
    return title;
  };

  const handleFilesUpload = async ({
    files,
    updateBlobs,
    kind,
  }: {
    files: File[];
    updateBlobs?: boolean;
    kind: UploadedFileKind;
  }): Promise<FileBlob[] | undefined> => {
    setIsProcessingFiles(true);

    const { totalTextualSize, totalImageSize } = [
      ...fileBlobs,
      ...files,
    ].reduce(
      (acc, content) => {
        const { size } = content;
        if (
          isSupportedImageContentType(
            content instanceof File ? content.type : content.contentType
          )
        ) {
          acc.totalImageSize += size;
        } else {
          acc.totalTextualSize += size;
        }
        return acc;
      },
      { totalTextualSize: 0, totalImageSize: 0 }
    );

    if (
      totalTextualSize > COMBINED_MAX_TEXT_FILES_SIZE ||
      totalImageSize > COMBINED_MAX_IMAGE_FILES_SIZE
    ) {
      sendNotification({
        type: "error",
        title: "Files too large.",
        description:
          "Combined file sizes exceed the limits. Please upload smaller files.",
      });
      return;
    }

    const previewResults = processSelectedFiles(files, kind);
    const newFileBlobs = processResults(previewResults, updateBlobs);

    const uploadResults = await uploadFiles(newFileBlobs);
    const finalFileBlobs = processResults(uploadResults, updateBlobs);

    setIsProcessingFiles(false);

    return finalFileBlobs;
  };

  const handleFileChange = async (e: React.ChangeEvent) => {
    const selectedFiles = Array.from(
      (e?.target as HTMLInputElement).files ?? []
    );

    return handleFilesUpload({ files: selectedFiles, kind: "attachment" });
  };

  const processSelectedFiles = (
    selectedFiles: File[],
    kind: UploadedFileKind
  ): Result<FileBlob, FileBlobUploadError>[] => {
    return selectedFiles.reduce(
      (acc, file) => {
        while (fileBlobs.some((f) => f.id === file.name)) {
          const [base, ext] = file.name.split(/\.(?=[^.]+$)/);
          const name = findAvailableTitle(base, ext, [
            ...fileBlobs.map((f) => f.filename),
          ]);
          file = new File([file], name, { type: file.type });
        }

        const contentType = file.type;
        if (!isSupportedFileContentType(contentType)) {
          acc.push(
            new Err(
              new FileBlobUploadError(
                "file_type_not_supported",
                file,
                `File "${file.name}" is not supported.`
              )
            )
          );
          return acc;
        }

        acc.push(new Ok(createFileBlob({ file, contentType, kind })));
        return acc;
      },
      [] as (Ok<FileBlob> | Err<FileBlobUploadError>)[]
    );
  };

  const uploadFiles = async (
    newFileBlobs: FileBlob[]
  ): Promise<Result<FileBlob, FileBlobUploadError>[]> => {
    const uploadPromises = newFileBlobs.map(async (fileBlob) => {
      // Get upload URL from server.
      const fileRes = await dustAPI.uploadFile({
        contentType: fileBlob.contentType,
        fileName: fileBlob.filename,
        fileSize: fileBlob.size,
        useCase: "conversation",
        useCaseMetadata: conversationId
          ? {
              conversationId: conversationId,
            }
          : undefined,
        fileObject: fileBlob.file,
      });
      if (fileRes.isErr()) {
        console.error("Error uploading files:", fileRes.error);

        return new Err(
          new FileBlobUploadError(
            "failed_to_upload_file",
            fileBlob.file,
            fileRes.error.message
          )
        );
      }
      const fileUploaded = fileRes.value;

      return new Ok({
        ...fileBlob,
        fileId: fileUploaded.sId,
        isUploading: false,
        preview: isSupportedImageContentType(fileBlob.contentType)
          ? `${fileUploaded.downloadUrl}?action=view`
          : undefined,
        publicUrl: fileUploaded.publicUrl,
      });
    });

    return Promise.all(uploadPromises); // Run all uploads in parallel.
  };

  const processResults = (
    results: Result<FileBlob, FileBlobUploadError>[],
    updateBlobs: boolean = true
  ) => {
    const successfulBlobs: FileBlob[] = [];
    const erroredBlobs: FileBlobUploadError[] = [];

    results.forEach((result) => {
      if (result.isErr()) {
        erroredBlobs.push(result.error);
        sendNotification({
          type: "error",
          title: "Failed to upload file.",
          description: result.error.message,
        });
      } else {
        successfulBlobs.push(result.value);
      }
    });

    if (updateBlobs) {
      if (erroredBlobs.length > 0) {
        setFileBlobs((prevFiles) =>
          prevFiles.filter(
            (f) => !erroredBlobs.some((e) => e.file.name === f.id)
          )
        );
      }

      if (successfulBlobs.length > 0) {
        setFileBlobs((prevFiles) => {
          const fileBlobMap = new Map(prevFiles.map((blob) => [blob.id, blob]));
          successfulBlobs.forEach((blob) => {
            fileBlobMap.set(blob.id, blob);
          });
          return Array.from(fileBlobMap.values());
        });
      }
    }

    return successfulBlobs;
  };

  const removeFile = (fileId: string) => {
    const fileBlob = fileBlobs.find((f) => f.id === fileId);

    if (fileBlob) {
      setFileBlobs((prevFiles) =>
        prevFiles.filter((f) => f.fileId !== fileBlob?.fileId)
      );

      if (fileBlob.fileId) {
        // Intentionally not awaiting the fetch call to allow it to run asynchronously.
        void dustAPI.deleteFile({ fileID: fileBlob.fileId });
      }

      const allFilesReady = fileBlobs.every((f) => f.isUploading === false);
      if (allFilesReady && isProcessingFiles) {
        setIsProcessingFiles(false);
      }
    }
  };

  const resetUpload = () => {
    setFileBlobs([]);
  };

  const uploadContentTab = async ({
    conversation,
    updateBlobs,
    includeContent,
    includeSelectionOnly,
    includeCapture,
    onUpload,
  }: {
    conversation?: ConversationPublicType;
    updateBlobs?: boolean;
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

          const fragments = await handleFilesUpload({
            files: [file],
            updateBlobs,
            kind: includeSelectionOnly ? "selection" : "tab_content",
          });
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
            return await response.blob();
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

        return await handleFilesUpload({
          files,
          updateBlobs,
          // TODO(EXT): supersede the screenshot
          kind: "attachment",
        });
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
  };

  type FileBlobWithFileId = FileBlob & { fileId: string };
  function fileBlobHasFileId(
    fileBlob: FileBlob
  ): fileBlob is FileBlobWithFileId {
    return fileBlob.fileId !== null;
  }

  const getFileBlobs: () => FileBlobWithFileId[] = () => {
    return fileBlobs.filter(fileBlobHasFileId);
  };

  return {
    fileBlobs,
    getFileBlobs,
    handleFileChange,
    handleFilesUpload,
    isProcessingFiles,
    isCapturing,
    uploadContentTab,
    removeFile,
    resetUpload,
  };
}

export type FileUploaderService = ReturnType<typeof useFileUploaderService>;

const createFileBlob = ({
  file,
  contentType,
  kind,
  preview,
}: {
  file: File;
  contentType: SupportedFileContentType;
  kind: UploadedFileKind;
  preview?: string;
}): FileBlob => ({
  contentType,
  file,
  filename: file.name,
  id: file.name,
  // Will be set once the file has been uploaded.
  fileId: null,
  isUploading: true,
  kind,
  preview,
  size: file.size,
});
