import { useSendNotification } from "@dust-tt/sparkle";
import { useState } from "react";

import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { FileUploadRequestResponseBody } from "@app/pages/api/w/[wId]/files";
import type { FileUploadedRequestResponseBody } from "@app/pages/api/w/[wId]/files/[fileId]";
import type {
  FileFormatCategory,
  FileUseCase,
  FileUseCaseMetadata,
  LightWorkspaceType,
  Result,
  SupportedFileContentType,
} from "@app/types";
import {
  Err,
  getFileFormatCategory,
  isAPIErrorResponse,
  isSupportedFileContentType,
  isSupportedImageContentType,
  MAX_FILE_SIZES,
  Ok,
} from "@app/types";

export interface FileBlob {
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
export type FileBlobWithFileId = FileBlob & { fileId: string };
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

export function useFileUploaderService({
  owner,
  useCase,
  useCaseMetadata,
}: {
  owner: LightWorkspaceType;
  useCase: FileUseCase;
  useCaseMetadata?: FileUseCaseMetadata;
}) {
  const [fileBlobs, setFileBlobs] = useState<FileBlob[]>([]);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);

  const sendNotification = useSendNotification();

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

  const handleFilesUpload = async (files: File[]) => {
    setIsProcessingFiles(true);

    const categoryToSize: Map<FileFormatCategory, number> = new Map();

    for (const f of [...fileBlobs, ...files]) {
      const contentType = f instanceof File ? f.type : f.contentType;

      const category = getFileFormatCategory(contentType) || "data";
      // The fallback should never happen but let's avoid a crash.

      categoryToSize.set(
        category,
        (categoryToSize.get(category) || 0) + f.size
      );
    }

    const isTooBig = [...categoryToSize].some(([cat, size]) => {
      const multiplier = cat === "image" ? 5 : 2;
      return size > MAX_FILE_SIZES[cat] * multiplier;
    });

    if (isTooBig) {
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
        while (fileBlobs.some((f) => f.id === file.name)) {
          const [base, ext] = file.name.split(/\.(?=[^.]+$)/);
          const name = findAvailableTitle(base, ext, [
            ...fileBlobs.map((f) => f.filename),
          ]);
          file = new File([file], name, { type: file.type });
        }

        if (!isSupportedFileContentType(file.type)) {
          acc.push(
            new Err(
              new FileBlobUploadError(
                "file_type_not_supported",
                file,
                `File "${file.name}" is not supported (${file.type}).`
              )
            )
          );
          return acc;
        }

        acc.push(new Ok(createFileBlob(file, file.type)));
        return acc;
      },
      [] as (Ok<FileBlob> | Err<FileBlobUploadError>)[]
    );
  };

  const uploadFiles = async (
    newFileBlobs: FileBlob[]
  ): Promise<Result<FileBlob, FileBlobUploadError>[]> => {
    // Browsers have a limit on the number of concurrent network operations.
    // We have a limit of the allowed time to upload the content of a file once the file object has been created.
    // If we start a large amount of uploads at the same time and the network is somewhat slow, it's possible that we'll
    // have created the file objects long before the upload of the content will finish.
    return concurrentExecutor(
      newFileBlobs,
      async (fileBlob) => {
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
              useCaseMetadata,
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
          fileId: file.sId,
          isUploading: false,
          preview: isSupportedImageContentType(fileBlob.contentType)
            ? `${fileUploaded.downloadUrl}?action=view`
            : undefined,
          publicUrl: file.publicUrl,
        });
      },
      { concurrency: 4 }
    );
  };

  const processResults = (results: Result<FileBlob, FileBlobUploadError>[]) => {
    const successfulBlobs: FileBlob[] = [];
    const erroredBlobs: FileBlobUploadError[] = [];

    results.forEach((result) => {
      if (result.isErr()) {
        erroredBlobs.push(result.error);
        sendNotification({
          type: "error",
          title: `Failed to upload file`,
          description: `error uploading  ${result.error.file.name} ${result.error.message ? ": " + result.error.message : ""}`,
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
