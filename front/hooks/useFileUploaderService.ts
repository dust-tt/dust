import type {
  LightWorkspaceType,
  SupportedUploadableContentFragmentType,
} from "@dust-tt/types";
import {
  getMaximumFileSizeForContentType,
  isSupportedImageContentFragmentType,
  isSupportedUploadableContentFragmentType,
} from "@dust-tt/types";
import { useContext, useState } from "react";

import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { extractTextFromPDF } from "@app/lib/client/handle_file_upload";
// TODO(2024-06-28 flav) Rename file.
import { getMimeTypeFromFile } from "@app/lib/file";

interface FileContent {
  content: string;
  // TODO(2024-06-26 flav) Make this configurable.
  contentType: SupportedUploadableContentFragmentType;
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

const COMBINED_MAX_TEXT_FILES_SIZE = 30 * 1024 * 1024; // 30MB in bytes.

const COMBINED_MAX_IMAGE_FILES_SIZE = 20 * 1024 * 1024; // 15MB in bytes.

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
          isSupportedImageContentFragmentType(
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

    if (totalTextualSize > COMBINED_MAX_TEXT_FILES_SIZE) {
      sendNotification({
        type: "error",
        title: "Files too large.",
        description:
          "Combined text exceeds 500,000 characters, overflowing assistant context. Please upload smaller files.",
      });
      return;
    }

    if (totalImageSize > COMBINED_MAX_IMAGE_FILES_SIZE) {
      sendNotification({
        type: "error",
        title: "Files too large.",
        description:
          "The total size of the image files you selected exceeds 20MB. Please upload smaller images or reduce the number of images.",
      });
      return;
    }

    try {
      const previewPromises: Promise<FileContent>[] = selectedFiles.map(
        async (file) => {
          const contentType = getMimeTypeFromFile(file);

          if (!isSupportedUploadableContentFragmentType(contentType)) {
            return Promise.reject(
              new FileBlobUploadError("file_type_not_supported", file)
            );
          }

          const maxFileSize = getMaximumFileSizeForContentType(contentType);
          if (file.size > maxFileSize) {
            return Promise.reject(
              new FileBlobUploadError("file_too_large", file)
            );
          }

          if (isSupportedImageContentFragmentType(contentType)) {
            // No content for image-like files.
            return createFileBlob(file, "", contentType);
          }

          if (contentType === "application/pdf") {
            const text = await getTextFromPDF(file);

            return createFileBlob(file, text, contentType);
          } else {
            const text = await file.text();

            return createFileBlob(file, text, contentType);
          }
        }
      );

      const results = await Promise.all(previewPromises);

      setFileBlobs([...fileBlobs, ...results]);

      for (const fileBlob of results) {
        // Get upload URL from server.
        const uploadResponse = await fetch(`/api/w/${owner.sId}/files`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contentType: fileBlob.contentType,
            fileName: fileBlob.filename,
            fileSize: fileBlob.size,
          }),
        });

        if (!uploadResponse.ok) {
          throw new FileBlobUploadError("failed_to_upload_file", fileBlob.file);
        }

        const { fileId, uploadUrl } = await uploadResponse.json();

        const formData = new FormData();
        formData.append("file", fileBlob.file);

        // Upload file to the obtained URL.
        const uploadResult = await fetch(uploadUrl, {
          method: "POST",
          body: formData,
        });

        if (!uploadResult.ok) {
          throw new FileBlobUploadError("failed_to_upload_file", fileBlob.file);
        }

        const { downloadUrl } = await uploadResult.json();

        // Update state to show the proper file status.
        setFileBlobs((prevBlobs) => {
          return prevBlobs.map((b) => {
            if (b.id === fileBlob.id) {
              b.internalId = fileId;
              b.isUploading = false;
              b.url = downloadUrl;
              b.preview = b.contentType.startsWith("image/")
                ? `${downloadUrl}?action=view`
                : undefined;
            }

            return b;
          });
        });
      }

      setIsProcessingFiles(false);
    } catch (err) {
      if (err instanceof FileBlobUploadError) {
        const { name: filename } = err.file;

        if (err.code === "file_type_not_supported") {
          sendNotification({
            type: "error",
            title: "File type not supported.",
            description: `File "${filename}" is not supported.`,
          });
        } else if (err.code === "file_too_large") {
          // Even though we don't display the file size limit in the UI, we still check it here to prevent
          // processing files that are too large.
          sendNotification({
            type: "error",
            title: "File too large.",
            description: `Uploads are limited to 100Mb per file. File "${filename}" is too large.`,
          });
        } else {
          sendNotification({
            type: "error",
            title: "File upload failed.",
            description: `There was an issue uploading the file "${filename}".`,
          });
        }

        // Remove the file from the blobs.
        setFileBlobs((prevFiles) => prevFiles.filter((f) => f.id !== filename));
      }
    }
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
  contentType: SupportedUploadableContentFragmentType,
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
