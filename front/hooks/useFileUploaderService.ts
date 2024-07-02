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

interface FileBlob {
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

const COMBINED_MAX_TEXT_FILES_SIZE = MAX_FILE_SIZES["plainText"] * 2;

const COMBINED_MAX_IMAGE_FILES_SIZE = MAX_FILE_SIZES["image"] * 5;

export function useFileUploaderService({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const [fileBlobs, setFileBlobs] = useState<FileBlob[]>([]);
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

    const previewResults = await processSelectedFiles(selectedFiles);
    const newFileBlobs = processResults(previewResults);

    const uploadResults = await uploadFiles(newFileBlobs);
    processResults(uploadResults);

    setIsProcessingFiles(false);
  };

  const processSelectedFiles = async (
    selectedFiles: File[]
  ): Promise<Result<FileBlob, FileBlobUploadError>[]> => {
    const previewPromises = selectedFiles.map(async (file) => {
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

      const text =
        contentType === "application/pdf"
          ? await getTextFromPDF(file)
          : await file.text();

      return new Ok(createFileBlob(file, text, contentType));
    });

    return Promise.all(previewPromises);
  };

  const uploadFiles = async (
    newFileBlobs: FileBlob[]
  ): Promise<Result<FileBlob, FileBlobUploadError>[]> => {
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

        return new Err(
          new FileBlobUploadError("failed_to_upload_file", fileBlob.file)
        );
      }

      if (!uploadResponse.ok) {
        return new Err(
          new FileBlobUploadError("failed_to_upload_file", fileBlob.file)
        );
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

        return new Err(
          new FileBlobUploadError("failed_to_upload_file", fileBlob.file)
        );
      }

      if (!uploadResult.ok) {
        return new Err(
          new FileBlobUploadError("failed_to_upload_file", fileBlob.file)
        );
      }

      const { file: fileUploaded } =
        (await uploadResult.json()) as FileUploadedRequestResponseBody;

      return new Ok({
        ...fileBlob,
        internalId: file.id,
        isUploading: false,
        url: fileUploaded.downloadUrl ?? null,
        preview: isSupportedImageContentType(fileBlob.contentType)
          ? `${fileUploaded.downloadUrl}?action=view`
          : undefined,
      });
    });

    return Promise.all(uploadPromises); // Run all uploads in parallel.
  };

  const processResults = (results: Result<FileBlob, FileBlobUploadError>[]) => {
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

    if (erroredBlobs.length > 0) {
      setFileBlobs((prevFiles) =>
        prevFiles.filter((f) => !erroredBlobs.some((e) => e.file.name === f.id))
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

    return successfulBlobs;
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
): FileBlob => ({
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
