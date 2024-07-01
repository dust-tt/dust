import type { SupportedUploadableContentFragmentType } from "@dust-tt/types";
import {
  isSupportedImageContentFragmentType,
  isSupportedUploadableContentFragmentType,
} from "@dust-tt/types";
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
  contentType: SupportedUploadableContentFragmentType;
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

const COMBINED_MAX_TEXT_FILES_SIZE = 30 * 1024 * 1024; // 30MB in bytes.
const MAX_TEXT_FILE_SIZE = 30 * 1024 * 1024; // 30MB in bytes.

const MAX_IMAGE_FILE_SIZE = 3 * 1024 * 1024; // 3MB in bytes.
const COMBINED_MAX_IMAGE_FILES_SIZE = 20 * 1024 * 1024; // 15MB in bytes.

export function useFileUploaderService() {
  const [fileBlobs, setFileBlobs] = useState<FileContent[]>([]);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);

  const sendNotification = useContext(SendNotificationsContext);

  const handleFileChange = async (e: React.ChangeEvent) => {
    const filenames = fileBlobs.map((b) => b.filename);
    const selectedFiles = Array.from(
      (e?.target as HTMLInputElement).files ?? []
    ).filter((f) => !filenames.includes(f.name));

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

          if (isSupportedImageContentFragmentType(contentType)) {
            if (file.size > MAX_IMAGE_FILE_SIZE) {
              return Promise.reject(
                new FileBlobUploadError("file_too_large", file)
              );
            }

            const base64Text = await getPreview(file);

            // No content for image-like files.
            return createFileBlob(file, "", contentType, base64Text);
          }

          if (file.size > MAX_TEXT_FILE_SIZE) {
            return Promise.reject(
              new FileBlobUploadError("file_too_large", file)
            );
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
  contentType: SupportedUploadableContentFragmentType,
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
