import type { ChangeEvent } from "react";
import { useState } from "react";

import { useSendNotification } from "@app/hooks/useNotification";
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
  DEFAULT_FILE_CONTENT_TYPE,
  ensureFileSizeByFormatCategory,
  Err,
  getFileFormatCategory,
  isAPIErrorResponse,
  isSupportedFileContentType,
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
  sourceUrl?: string;
  size: number;
  publicUrl?: string;
}
export type FileBlobWithFileId = FileBlob & { fileId: string };

class FileBlobUploadError extends Error {
  constructor(
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
  const [numFilesProcessing, setNumFilesProcessing] = useState(0);

  const isProcessingFiles = numFilesProcessing > 0;

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
    setNumFilesProcessing((prev) => prev + files.length);

    const categoryToSize: Map<FileFormatCategory, number> = new Map();

    for (const f of [...fileBlobs, ...files]) {
      const contentType = f instanceof File ? f.type : f.contentType;

      const category = getFileFormatCategory(contentType) ?? "data";
      // The fallback should never happen, but let's avoid a crash.

      categoryToSize.set(
        category,
        (categoryToSize.get(category) ?? 0) + f.size
      );
    }

    const oversizedCategories = [...categoryToSize].filter(([cat, size]) => {
      return !ensureFileSizeByFormatCategory(cat, size);
    });

    for (const cat of oversizedCategories) {
      sendNotification({
        type: "error",
        title: "Files too large.",
        description: `Combined ${cat[0]} file sizes exceed the limit of ${MAX_FILE_SIZES[cat[0]] / 1024 / 1024}MB. Please upload smaller files.`,
      });
    }

    if (oversizedCategories.length > 0) {
      setNumFilesProcessing((prev) => prev - files.length);
      return;
    }
    const previewResults = processSelectedFiles(files);
    const newFileBlobs = processResults(previewResults, true);

    const uploadResults = await uploadFiles(newFileBlobs);
    const finalFileBlobs = processResults(uploadResults);

    setNumFilesProcessing((prev) => prev - files.length);

    return finalFileBlobs;
  };

  const handleFileChange = async (e: ChangeEvent) => {
    const selectedFiles = Array.from(
      (e?.target as HTMLInputElement).files ?? []
    );

    return handleFilesUpload(selectedFiles);
  };

  const processSelectedFiles = (
    selectedFiles: File[]
  ): Result<FileBlob, FileBlobUploadError>[] => {
    const getRenamedFile = (file: File, fileType: string): File => {
      let currentFile = file;
      while (fileBlobs.some((f) => f.id === currentFile.name)) {
        const [base, ext] = currentFile.name.split(/\.(?=[^.]+$)/);
        const name = findAvailableTitle(base, ext, [
          ...fileBlobs.map((f) => f.filename),
        ]);
        if (name !== currentFile.name) {
          currentFile = new File([currentFile], name, { type: fileType });
        }
      }
      return currentFile;
    };

    return selectedFiles.reduce<Result<FileBlob, FileBlobUploadError>[]>(
      (acc, file) => {
        const fileType = file.type || DEFAULT_FILE_CONTENT_TYPE;

        // File objects are immutable - we can't modify their properties directly.
        // When we need to change the name or type, we must create a new File object.
        const renamedFile = getRenamedFile(file, fileType);

        if (!isSupportedFileContentType(fileType)) {
          acc.push(
            new Err(
              new FileBlobUploadError(
                renamedFile,
                `File "${renamedFile.name}" is not supported (${fileType}).`
              )
            )
          );
          return acc;
        }

        acc.push(new Ok(createFileBlob(renamedFile, fileType)));
        return acc;
      },
      []
    );
  };

  const uploadFiles = async (
    newFileBlobs: FileBlob[]
  ): Promise<Result<FileBlob, FileBlobUploadError>[]> => {
    // Browsers have a limit on the number of concurrent network operations.
    // We have a limit of the allowed time to upload the content of a file once the file object has been created.
    // If we start a large number of uploads at the same time and the network is somewhat slow, it's possible that we'll
    // have created the file objects long before the upload of the content finishes.
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
                fileBlob.file,
                isAPIErrorResponse(res) ? res.error.message : undefined
              )
            );
          } catch (err) {
            return new Err(new FileBlobUploadError(fileBlob.file));
          }
        }

        const { file } =
          (await uploadResponse.json()) as FileUploadRequestResponseBody;

        const formData = new FormData();
        formData.append("file", fileBlob.file);

        // Upload a file to the obtained URL.
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
              fileBlob.file,
              err instanceof Error ? err.message : undefined
            )
          );
        }

        if (!uploadResult.ok) {
          const { error } = await uploadResult.json();
          return new Err(
            new FileBlobUploadError(
              fileBlob.file,
              error?.message ?? "An unknown error happened."
            )
          );
        }

        const { file: fileUploaded } =
          (await uploadResult.json()) as FileUploadedRequestResponseBody;

        return new Ok({
          ...fileBlob,
          fileId: file.sId,
          isUploading: false,
          sourceUrl: fileUploaded.downloadUrl,
          publicUrl: file.publicUrl,
        });
      },
      { concurrency: 4 }
    );
  };

  const processResults = (
    results: Result<FileBlob, FileBlobUploadError>[],
    previewMode: boolean = false
  ) => {
    const successfulBlobs: FileBlob[] = [];
    const erroredBlobs: FileBlobUploadError[] = [];

    results.forEach((result) => {
      if (result.isErr()) {
        erroredBlobs.push(result.error);
        const maybeTruncatedFilename =
          result.error.file.name.length > 50
            ? result.error.file.name.slice(0, 47) + "..."
            : result.error.file.name;
        sendNotification({
          type: "error",
          title: `Failed to upload file${previewMode ? " preview" : ""}`,
          description: result.error.message
            ? `${result.error.message} (${maybeTruncatedFilename})`
            : `Error uploading ${maybeTruncatedFilename}`,
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
    setFileBlobs((prevFiles) => {
      const fileBlob = prevFiles.find((f) => f.id === fileId);

      if (!fileBlob) {
        return prevFiles;
      }

      // Delete from server if file has been uploaded
      if (fileBlob.fileId) {
        void fetch(`/api/w/${owner.sId}/files/${fileBlob.fileId}`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
        });
      }

      const filtered = prevFiles.filter((f) => f.id !== fileBlob.id);

      const allFilesReady = filtered.every((f) => !f.isUploading);
      if (allFilesReady && isProcessingFiles) {
        setNumFilesProcessing(0);
      }

      return filtered;
    });
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

  const getFileBlob = (blobId: string | null | undefined) => {
    if (!blobId) {
      return undefined;
    }
    return getFileBlobs().find((blob) => blob.id === blobId);
  };

  return {
    fileBlobs,
    getFileBlob,
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
  contentType: SupportedFileContentType
): FileBlob => ({
  contentType,
  file,
  filename: file.name,
  id: file.name,
  // Will be set once the file has been uploaded.
  fileId: null,
  isUploading: true,
  size: file.size,
});
