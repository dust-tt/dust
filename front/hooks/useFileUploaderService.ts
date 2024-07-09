import type {
  FileUploadedRequestResponseBody,
  FileUploadRequestResponseBody,
  FileUseCase,
  LightWorkspaceType,
  Result,
  SupportedFileContentType,
} from "@dust-tt/types";
import {
  Err,
  isAPIErrorResponse,
  isSupportedFileContentType,
  isSupportedImageContentType,
  MAX_FILE_SIZES,
  Ok,
} from "@dust-tt/types";
import { useContext, useState } from "react";

import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { getMimeTypeFromFile } from "@app/lib/file";

interface FileBlob {
  contentType: SupportedFileContentType;
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

const COMBINED_MAX_TEXT_FILES_SIZE = MAX_FILE_SIZES["plainText"] * 2;
const COMBINED_MAX_IMAGE_FILES_SIZE = MAX_FILE_SIZES["image"] * 5;

export function useFileUploaderService({
  owner,
  useCase,
}: {
  owner: LightWorkspaceType;
  useCase: FileUseCase;
}) {
  const [fileBlobs, setFileBlobs] = useState<FileBlob[]>([]);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);

  const sendNotification = useContext(SendNotificationsContext);

  const handleFilesUpload = async (files: File[]) => {
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

    const previewResults = processSelectedFiles(files);
    const newFileBlobs = processResults(previewResults);

    const uploadResults = await uploadFiles(newFileBlobs);
    const finalFileBlobs = processResults(uploadResults);

    setIsProcessingFiles(false);

    return finalFileBlobs;
  };

  const handleFileChange = async (e: React.ChangeEvent) => {
    const selectedFiles = Array.from(
      (e?.target as HTMLInputElement).files ?? []
    );

    return handleFilesUpload(selectedFiles);
  };

  const processSelectedFiles = (
    selectedFiles: File[]
  ): Result<FileBlob, FileBlobUploadError>[] => {
    return selectedFiles.reduce(
      (acc, file) => {
        if (fileBlobs.some((f) => f.id === file.name)) {
          sendNotification({
            type: "error",
            title: "File already exists.",
            description: `File "${file.name}" is already uploaded.`,
          });

          return acc; // Ignore if file already exists.
        }

        const contentType = getMimeTypeFromFile(file);
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

        acc.push(new Ok(createFileBlob(file, contentType)));
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
            useCase,
          }),
        });
      } catch (err) {
        console.error("Error uploading files:", err);

        return new Err(
          new FileBlobUploadError(
            "failed_to_upload_file",
            fileBlob.file,
            err instanceof Error ? err.message : undefined
          )
        );
      }

      if (!uploadResponse.ok) {
        try {
          const res = await uploadResponse.json();

          return new Err(
            new FileBlobUploadError(
              "failed_to_upload_file",
              fileBlob.file,
              isAPIErrorResponse(res) ? res.error.message : undefined
            )
          );
        } catch (err) {
          return new Err(
            new FileBlobUploadError("failed_to_upload_file", fileBlob.file)
          );
        }
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
          new FileBlobUploadError(
            "failed_to_upload_file",
            fileBlob.file,
            err instanceof Error ? err.message : undefined
          )
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
        fileId: file.id,
        isUploading: false,
        preview: isSupportedImageContentType(fileBlob.contentType)
          ? `${fileUploaded.downloadUrl}?action=view`
          : undefined,
        publicUrl: file.publicUrl,
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

  const removeFile = (fileId: string) => {
    const fileBlob = fileBlobs.find((f) => f.id === fileId);

    if (fileBlob) {
      setFileBlobs((prevFiles) =>
        prevFiles.filter((f) => f.fileId !== fileBlob?.fileId)
      );

      // Intentionally not awaiting the fetch call to allow it to run asynchronously.
      void fetch(`/api/w/${owner.sId}/files/${fileBlob.fileId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const allFilesReady = fileBlobs.every((f) => f.isUploading === false);
      if (allFilesReady && isProcessingFiles) {
        setIsProcessingFiles(false);
      }
    }
  };

  const resetUpload = () => {
    setFileBlobs([]);
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
    removeFile,
    resetUpload,
  };
}

export type FileUploaderService = ReturnType<typeof useFileUploaderService>;

const createFileBlob = (
  file: File,
  contentType: SupportedFileContentType,
  preview?: string
): FileBlob => ({
  contentType,
  file,
  filename: file.name,
  id: file.name,
  // Will be set once the file has been uploaded.
  fileId: null,
  isUploading: true,
  preview,
  size: file.size,
});
