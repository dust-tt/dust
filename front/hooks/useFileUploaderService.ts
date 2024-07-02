import type {
  FileUploadedRequestResponseBody,
  FileUploadRequestResponseBody,
  LightWorkspaceType,
  Result,
  SupportedFileContentType,
} from "@dust-tt/types";
import {
  Err,
  isSupportedFileContentType,
  isSupportedImageContentType,
  MAX_FILE_SIZES,
  Ok,
} from "@dust-tt/types";
import { useContext, useState } from "react";

import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { extractTextFromPDF } from "@app/lib/client/handle_file_upload";
import { getMimeTypeFromFile } from "@app/lib/file";

interface FileContent {
  content: string;
  contentType: SupportedFileContentType;
  file: File;
  filename: string;
  id: string;
  internalId: string | null;
  isUploading: boolean;
  preview?: string;
  size: number;
  url: string | null;
}

type FileBlobUploadErrorCode =
  | "combined_size_exceeded"
  | "failed_to_read_file"
  | "failed_to_upload_file"
  | "file_too_large"
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

const COMBINED_MAX_TEXT_FILES_SIZE = MAX_FILE_SIZES["plainText"] * 2;

const COMBINED_MAX_IMAGE_FILES_SIZE = MAX_FILE_SIZES["image"] * 5;

export function useFileUploaderService({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const [fileBlobs, setFileBlobs] = useState<FileContent[]>([]);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);

  const sendNotification = useContext(SendNotificationsContext);

  const handleFileChange = async (e: React.ChangeEvent) => {
    const selectedFiles = Array.from(
      (e?.target as HTMLInputElement).files ?? []
    );

    setIsProcessingFiles(true);

    const { totalTextualSize, totalImageSize } = [
      ...fileBlobs,
      ...selectedFiles,
    ].reduce(
      (acc, content) => {
        if (
          isSupportedImageContentType(
            content instanceof File ? content.type : content.contentType
          )
        ) {
          acc.totalImageSize += content.size;
        } else {
          acc.totalTextualSize += content.size;
        }
        return acc;
      },
      {
        totalTextualSize: 0,
        totalImageSize: 0,
      }
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

    // Create the file blobs so the UI can display them.
    const previewPromises: Promise<Result<FileContent, FileBlobUploadError>>[] =
      selectedFiles.map(async (file) => {
        const contentType = getMimeTypeFromFile(file);

        if (!isSupportedFileContentType(contentType)) {
          return new Err(
            new FileBlobUploadError(
              "file_type_not_supported",
              file,
              `File "${file.name}" is not supported.`
            )
          );
        }

        if (isSupportedImageContentType(contentType)) {
          return new Ok(createFileBlob(file, "", contentType));
        }

        // TODO(2024-07-02 flav) Remove once this is handled in the BE.
        const text =
          contentType === "application/pdf"
            ? await getTextFromPDF(file)
            : await file.text();

        return new Ok(createFileBlob(file, text, contentType));
      });

    const results = await Promise.all(previewPromises);

    const failedResults = results.filter((result) => result.isErr());
    if (failedResults.length > 0) {
      failedResults.forEach((r) => {
        if (r.isErr()) {
          sendNotification({
            type: "error",
            title: "Failed to upload file.",
            description: r.error.message,
          });

          setFileBlobs((prevFiles) =>
            prevFiles.filter((f) => f.id !== r.error.file.name)
          );
        }
      });
    }

    const newFileBlobs = results
      .filter((r): r is Ok<FileContent> => r.isOk()) // Type guard to filter only Ok results.
      .map((r) => r.value);

    setFileBlobs([...fileBlobs, ...newFileBlobs]);

    const uploadFiles = async (newFileBlobs: FileContent[]) => {
      const uploadPromises = newFileBlobs.map(async (fileBlob) => {
        // Get upload URL from server.
        let uploadResponse;
        try {
          uploadResponse = await fetch(`/api/w/${owner.sId}/files`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              contentType: fileBlob.contentType,
              fileName: fileBlob.filename,
              fileSize: fileBlob.size,
              useCase: "conversation",
            }),
          });
        } catch (err) {
          console.error("Error uploading files:", err);
          return;
        }

        if (!uploadResponse.ok) {
          sendNotification({
            type: "error",
            title: "Failed to upload file.",
            description: "Failed to get upload URL from server.",
          });

          return;
        }

        const { file } =
          (await uploadResponse.json()) as FileUploadRequestResponseBody;

        const formData = new FormData();
        formData.append("file", fileBlob.file);

        // Upload file to the obtained URL.
        let uploadResult;
        try {
          uploadResult = await fetch(file.uploadUrl, {
            method: "POST",
            body: formData,
          });
        } catch (err) {
          console.error("Error uploading files:", err);
          return;
        }

        if (!uploadResult.ok) {
          sendNotification({
            type: "error",
            title: "Failed to upload file.",
            description: "Failed to upload file to server.",
          });
        }

        const { file: fileUploaded } =
          (await uploadResult.json()) as FileUploadedRequestResponseBody;

        // Update state to show the proper file status.
        setFileBlobs((prevBlobs) => {
          return prevBlobs.map((b) => {
            if (b.id === fileBlob.id) {
              b.internalId = file.id;
              b.isUploading = false;
              b.url = fileUploaded.downloadUrl ?? null;
              b.preview = isSupportedImageContentType(b.contentType)
                ? `${fileUploaded.downloadUrl}?action=view`
                : undefined;
            }

            return b;
          });
        });
      });

      await Promise.all(uploadPromises); // Run all uploads in parallel.
    };

    await uploadFiles(newFileBlobs);

    setIsProcessingFiles(false);
  };

  const getTextFromPDF: (file: File) => Promise<string> = async (
    file: File
  ) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onloadend = async () => {
        const { result } = reader;
        const res = await extractTextFromPDF(file, result);

        if (res.isErr()) {
          return reject(res.error);
        }

        return resolve(res.value.content);
      };

      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  const removeFile = (fileId: string) => {
    const fileBlob = fileBlobs.find((f) => f.id === fileId);

    if (fileBlob) {
      setFileBlobs((prevFiles) =>
        prevFiles.filter((f) => f.internalId !== fileBlob?.internalId)
      );

      // Intentionally not awaiting the fetch call to allow it to run asynchronously.
      void fetch(`/api/w/${owner.sId}/files/${fileBlob.internalId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const allFilesReady = fileBlobs.every((f) => !!f.url);
      if (allFilesReady && isProcessingFiles) {
        setIsProcessingFiles(false);
      }
    }
  };

  const resetUpload = () => {
    setFileBlobs([]);
  };

  return {
    fileBlobs,
    removeFile,
    isProcessingFiles,
    handleFileChange,
    resetUpload,
  };
}

export type FileUploaderService = ReturnType<typeof useFileUploaderService>;

const createFileBlob = (
  file: File,
  content: string,
  contentType: SupportedFileContentType,
  preview?: string
): FileContent => ({
  content,
  contentType,
  file,
  filename: file.name,
  id: file.name,
  // Will be set once the file has been uploaded.
  internalId: null,
  isUploading: true,
  preview,
  size: file.size,
  url: null,
});
