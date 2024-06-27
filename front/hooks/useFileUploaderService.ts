import type { SupportedContentFragmentType } from "@dust-tt/types";
import { isSupportedTextContentFragmentType } from "@dust-tt/types";
import { useContext, useState } from "react";

import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { extractTextFromPDF } from "@app/lib/client/handle_file_upload";
import { getMimeTypeFromFile } from "@app/lib/file";

interface FileContent {
  content: string;
  file: File;
  filename: string;
  id: string;
  preview?: string;
  size: number;
  // TODO(2024-06-26 flav) Make this configurable.
  contentType: SupportedContentFragmentType;
}

type FileBlobUploadErrorCode =
  | "failed_to_read_file"
  | "file_too_large"
  | "file_type_not_supported"
  | "combined_size_exceeded";

class FileBlobUploadError extends Error {
  constructor(
    readonly code: FileBlobUploadErrorCode,
    readonly file: File,
    msg?: string
  ) {
    super(msg);
  }
}

const COMBINED_MAX_FILES_SIZE = 500_000;
const MAX_FILE_SIZE = 100_000_000;

export function useFileUploaderService() {
  const [fileBlobs, setFileBlobs] = useState<FileContent[]>([]);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);

  const sendNotification = useContext(SendNotificationsContext);

  const handleFileChange = async (e: React.ChangeEvent) => {
    const selectedFiles = Array.from(
      (e?.target as HTMLInputElement).files ?? []
    );

    setIsProcessingFiles(true);

    // TODO(2024-06-26 flav): Handle image's sizes differently.
    const totalSize = [...fileBlobs, ...selectedFiles].reduce(
      (sum, content) => sum + content.size,
      0
    );
    if (totalSize > COMBINED_MAX_FILES_SIZE) {
      sendNotification({
        type: "error",
        title: "Files too large.",
        description:
          "The combined extracted text from the files you selected results in more than 500,000 characters. This will overflow the assistant context. Please consider uploading smaller files.",
      });
      return;
    }

    try {
      const previewPromises: Promise<FileContent>[] = selectedFiles.map(
        async (file) => {
          const contentType = getMimeTypeFromFile(file);
          if (!isSupportedTextContentFragmentType(contentType)) {
            return Promise.reject(
              new FileBlobUploadError("file_type_not_supported", file)
            );
          }

          if (file.size > MAX_FILE_SIZE) {
            return Promise.reject(
              new FileBlobUploadError("file_too_large", file)
            );
          }

          if (contentType.startsWith("image/")) {
            const base64Text = await getPreview(file);

            return createFileBlob(file, base64Text, contentType, base64Text);
          } else if (contentType === "application/pdf") {
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
    } catch (err) {
      if (err instanceof FileBlobUploadError) {
        const { name: filename } = err.file;

        if (err.code === "file_type_not_supported") {
          // Even though we don't display the file size limit in the UI, we still check it here to prevent
          // processing files that are too large.
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
        }
      }
    } finally {
      setIsProcessingFiles(false);
    }
  };

  const getPreview: (file: File) => Promise<string> = async (file: File) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const { result } = reader;

        if (typeof result === "string") {
          return resolve(result);
        }

        return reject(new FileBlobUploadError("file_type_not_supported", file));
      };

      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
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
    setFileBlobs((prevFiles) => prevFiles.filter((file) => file.id !== fileId));
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
  contentType: SupportedContentFragmentType,
  preview?: string
): FileContent => ({
  id: file.name,
  content,
  preview,
  filename: file.name,
  file,
  size: file.size,
  contentType,
});
