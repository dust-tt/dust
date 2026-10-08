import {
  useSendApiErrorNotification,
  useSendNotification,
} from "@app/hooks/useNotification";
import { useAuth } from "@app/lib/auth/AuthContext";
import { clientFetch, clientUpload } from "@app/lib/egress/client";
import { formatFileSize } from "@app/lib/i18n/format";
import type { FileUploadedRequestResponseBody } from "@app/lib/resources/file_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { isAudioTranscriptionAvailable } from "@app/lib/workspace_policies";
import logger from "@app/logger/logger";
import type { FileUploadRequestResponseBody } from "@app/types/api/files/upload_metadata";
import { isAPIErrorResponse } from "@app/types/error";
import type {
  FileUseCase,
  FileUseCaseMetadata,
  SupportedFileContentType,
} from "@app/types/files";
import {
  contentTypeFromFileName,
  DEFAULT_FILE_CONTENT_TYPE,
  ensureFileSizeByFormatCategory,
  getFileFormatCategory,
  getSupportedFileExtensions,
  isSupportedAudioContentType,
  isSupportedFileContentType,
  resolveFileContentType,
  resolveMaxFileSizes,
} from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import type { ChangeEvent } from "react";
import { useCallback, useMemo, useState } from "react";

export type FileBlobUploadState =
  | { isUploading: false; uploadProgress: null }
  | { isUploading: true; uploadProgress: number | null };

/**
 * @cc [owner:Nils-Fedrigo,label:react] upload-progress-is-not-a-completion-signal
 * `uploadProgress` MUST be the integer percentage of the file's bytes already sent, and `100` MUST
 * mean they are all sent while the server is still processing the file. It MUST NOT be used to
 * signal that the upload is done: completion is signalled by `isUploading` becoming `false`.
 * `FileBlobUploadState` enforces the rest of the pair's coherence.
 */
export type FileBlob = FileBlobUploadState & {
  contentType: SupportedFileContentType;
  file: File;
  filename: string;
  id: string;
  fileId: string | null;
  sourceUrl?: string;
  size: number;
  publicUrl?: string;
  iconName?: string;
  provider?: string;
  /** Scoped mount path from upload (same as `GCSMountEntryBase.path`). */
  path?: string | null;
};
export type FileBlobWithFileId = FileBlob & { fileId: string };

// `message` is a translated client-side message (unsupported file); `error` is the API or network
// error, displayed through `formatError`.
class FileBlobUploadError extends Error {
  constructor(
    readonly file: File,
    message?: string,
    readonly error?: unknown
  ) {
    super(message);
  }
}

function getFileTooLargeDescription(
  t: (descriptor: MessageDescriptor) => string,
  {
    category,
    fileName,
    fileSize,
    maxFileSize,
  }: {
    category: NonNullable<ReturnType<typeof getFileFormatCategory>>;
    fileName: string;
    fileSize: string;
    maxFileSize: string;
  }
): string {
  switch (category) {
    case "image":
      return t(
        msg`File "${fileName}" (${fileSize}) exceeds the image limit of ${maxFileSize}. Upload a smaller file.`
      );
    case "data":
      return t(
        msg`File "${fileName}" (${fileSize}) exceeds the data limit of ${maxFileSize}. Upload a smaller file.`
      );
    case "code":
      return t(
        msg`File "${fileName}" (${fileSize}) exceeds the code limit of ${maxFileSize}. Upload a smaller file.`
      );
    case "delimited":
      return t(
        msg`File "${fileName}" (${fileSize}) exceeds the delimited limit of ${maxFileSize}. Upload a smaller file.`
      );
    case "audio":
      return t(
        msg`File "${fileName}" (${fileSize}) exceeds the audio limit of ${maxFileSize}. Upload a smaller file.`
      );
    default:
      assertNeverAndIgnore(category);
      return t(
        msg`File "${fileName}" (${fileSize}) exceeds the limit of ${maxFileSize}. Upload a smaller file.`
      );
  }
}

type UploadResult = Result<FileBlob, FileBlobUploadError>;

/**
 * Wraps an upload so `onSettled` runs with a file's result as soon as that file settles, rather
 * than when the whole batch does.
 */
function withOnSettled(
  onSettled: ((result: UploadResult) => void) | undefined,
  upload: (fileBlob: FileBlob) => Promise<UploadResult>
) {
  return async (fileBlob: FileBlob) => {
    const result = await upload(fileBlob);
    onSettled?.(result);

    return result;
  };
}

/**
 * @cc [owner:Nils-Fedrigo,label:react;product] audio-selection-needs-transcription
 * When `isAudioTranscriptionAvailable` is false for the workspace, a selected file whose content
 * type is audio MUST be reported as an error blob and MUST NOT reach `uploadFiles`, whichever entry
 * path produced it (picker, drag-and-drop, paste). `acceptedFileExtensions` MUST NOT list audio
 * extensions in that case so the picker cannot offer them in the first place.
 */
export function useFileUploaderService({
  hasSandboxTools,
  owner,
  useCase,
  useCaseMetadata,
}: {
  hasSandboxTools: boolean;
  owner: LightWorkspaceType;
  useCase: FileUseCase;
  useCaseMetadata?: FileUseCaseMetadata;
}) {
  const [fileBlobs, setFileBlobs] = useState<FileBlob[]>([]);
  const [numFilesProcessing, setNumFilesProcessing] = useState(0);

  const isProcessingFiles = numFilesProcessing > 0;

  const { t } = useLingui();
  const sendNotification = useSendNotification();
  const sendApiErrorNotification = useSendApiErrorNotification();

  const { subscription } = useAuth();
  const isAudioSupported = isAudioTranscriptionAvailable({
    owner,
    plan: subscription.plan,
  });

  const acceptedFileExtensions = useMemo(() => {
    const supported = getSupportedFileExtensions(undefined, useCase);
    if (isAudioSupported) {
      return supported;
    }

    const audioExtensions = new Set(getSupportedFileExtensions("audio"));
    return supported.filter((ext) => !audioExtensions.has(ext));
  }, [isAudioSupported, useCase]);

  const sizeResolverOpts = useMemo(
    () => ({
      hasSandboxTools,
      useCase,
    }),
    [hasSandboxTools, useCase]
  );

  const maxFileSizes = useMemo(
    () => resolveMaxFileSizes(sizeResolverOpts),
    [sizeResolverOpts]
  );

  const resolveSelectedFileContentType = useCallback((file: File): string => {
    const resolvedContentType = resolveFileContentType(file.type, file.name);
    if (isSupportedFileContentType(resolvedContentType)) {
      return resolvedContentType;
    }

    return (
      contentTypeFromFileName(file.name) ??
      (resolvedContentType || DEFAULT_FILE_CONTENT_TYPE)
    );
  }, []);

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

  const processSelectedFiles = useCallback(
    (selectedFiles: File[]): Result<FileBlob, FileBlobUploadError>[] => {
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
          const fileType = resolveSelectedFileContentType(file);

          // File objects are immutable - we can't modify their properties directly.
          // When we need to change the name or type, we must create a new File object.
          const renamedFile = getRenamedFile(file, fileType);
          const renamedFileName = renamedFile.name;

          if (!isSupportedFileContentType(fileType)) {
            acc.push(
              new Err(
                new FileBlobUploadError(
                  renamedFile,
                  t`File "${renamedFileName}" is not supported (${fileType}).`
                )
              )
            );
            return acc;
          }

          if (!isAudioSupported && isSupportedAudioContentType(fileType)) {
            acc.push(
              new Err(
                new FileBlobUploadError(
                  renamedFile,
                  t`Audio attachments require voice transcription, which is unavailable in this workspace. Upload a text transcript instead.`
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
    },
    [
      fileBlobs,
      findAvailableTitle,
      isAudioSupported,
      resolveSelectedFileContentType,
      t,
    ]
  );

  const uploadFiles = useCallback(
    async (
      newFileBlobs: FileBlob[],
      options?: {
        useCaseMetadata?: FileUseCaseMetadata;
        onFileSettled?: (result: UploadResult) => void;
      }
    ): Promise<UploadResult[]> => {
      const effectiveUseCaseMetadata =
        options?.useCaseMetadata ?? useCaseMetadata;
      // Browsers have a limit on the number of concurrent network operations.
      // We have a limit of the allowed time to upload the content of a file once the file object has been created.
      // If we start a large number of uploads at the same time and the network is somewhat slow, it's possible that we'll
      // have created the file objects long before the upload of the content finishes.
      return concurrentExecutor(
        newFileBlobs,
        withOnSettled(options?.onFileSettled, async (fileBlob) => {
          // Get upload URL from server.
          let uploadResponse;
          try {
            uploadResponse = await clientFetch(`/api/w/${owner.sId}/files`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                contentType: fileBlob.contentType,
                fileName: fileBlob.filename,
                fileSize: fileBlob.size,
                useCase,
                useCaseMetadata: effectiveUseCaseMetadata,
              }),
            });
          } catch (err) {
            logger.error({ err }, "Error uploading files");

            return new Err(
              new FileBlobUploadError(fileBlob.file, undefined, err)
            );
          }

          if (!uploadResponse.ok) {
            try {
              const res = await uploadResponse.json();

              return new Err(
                new FileBlobUploadError(
                  fileBlob.file,
                  undefined,
                  isAPIErrorResponse(res) ? res.error : undefined
                )
              );
            } catch {
              return new Err(new FileBlobUploadError(fileBlob.file));
            }
          }

          const { file } =
            (await uploadResponse.json()) as FileUploadRequestResponseBody;

          const formData = new FormData();
          formData.append("file", fileBlob.file);

          // Report the transfer to the attachment card. `clientUpload` already floors the
          // percentage, so this only re-renders on whole-percent changes (at most 101 times per
          // file) even for the very large spreadsheets allowed in conversations.
          let lastReportedProgress: number | null = null;
          const onProgress = (percentSent: number) => {
            if (percentSent === lastReportedProgress) {
              return;
            }
            lastReportedProgress = percentSent;

            setFileBlobs((prevFiles) =>
              prevFiles.map((f) =>
                f.id === fileBlob.id
                  ? { ...f, isUploading: true, uploadProgress: percentSent }
                  : f
              )
            );
          };

          // Upload a file to the obtained URL. `clientUpload` is used over `clientFetch` because
          // `fetch` cannot report request body progress.
          let uploadResult;
          try {
            uploadResult = await clientUpload(file.uploadUrl, formData, {
              onProgress,
            });
          } catch (err) {
            logger.error({ err }, "Error uploading files");

            return new Err(
              new FileBlobUploadError(fileBlob.file, undefined, err)
            );
          }

          if (!uploadResult.ok) {
            const body = await uploadResult.json();
            return new Err(
              new FileBlobUploadError(
                fileBlob.file,
                undefined,
                isAPIErrorResponse(body) ? body.error : undefined
              )
            );
          }

          const { file: fileUploaded } =
            (await uploadResult.json()) as FileUploadedRequestResponseBody;

          return new Ok({
            ...fileBlob,
            fileId: file.sId,
            isUploading: false,
            uploadProgress: null,
            sourceUrl: fileUploaded.downloadUrl,
            publicUrl: file.publicUrl,
            path: fileUploaded.path,
          });
        }),
        { concurrency: 4 }
      );
    },
    [owner.sId, useCase, useCaseMetadata]
  );

  const processResults = useCallback(
    (
      results: Result<FileBlob, FileBlobUploadError>[],
      previewMode: boolean = false
    ) => {
      const successfulBlobs: FileBlob[] = [];
      const erroredBlobs: FileBlobUploadError[] = [];

      results.forEach((result) => {
        if (result.isErr()) {
          const uploadError = result.error;
          erroredBlobs.push(uploadError);
          const maybeTruncatedFilename =
            uploadError.file.name.length > 50
              ? uploadError.file.name.slice(0, 47) + "..."
              : uploadError.file.name;
          if (uploadError.error !== undefined) {
            sendApiErrorNotification({
              title: previewMode
                ? t`Failed to upload the preview of ${maybeTruncatedFilename}`
                : t`Failed to upload ${maybeTruncatedFilename}`,
              error: uploadError.error,
            });
            return;
          }
          sendNotification({
            type: "error",
            title: previewMode
              ? t`Failed to upload file preview`
              : t`Failed to upload file`,
            description: uploadError.message
              ? `${uploadError.message} (${maybeTruncatedFilename})`
              : t`Error uploading ${maybeTruncatedFilename}`,
          });
        } else {
          successfulBlobs.push(result.value);
        }
      });

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

      return successfulBlobs;
    },
    [sendApiErrorNotification, sendNotification, t]
  );

  const handleFilesUpload = useCallback(
    async (
      files: File[],
      options?: { useCaseMetadata?: FileUseCaseMetadata }
    ) => {
      setNumFilesProcessing((prev) => prev + files.length);

      const oversizedFiles = files
        .map((file) => {
          const contentType = resolveSelectedFileContentType(file);
          const category = getFileFormatCategory(contentType) ?? "data";
          return { category, file };
        })
        .filter(({ category, file }) => {
          return !ensureFileSizeByFormatCategory(
            category,
            file.size,
            sizeResolverOpts
          );
        });

      for (const { category, file } of oversizedFiles) {
        sendNotification({
          type: "error",
          title: t`File too large.`,
          description: getFileTooLargeDescription(t, {
            category,
            fileName: file.name,
            fileSize: formatFileSize(file.size, { decimals: 0 }),
            maxFileSize: formatFileSize(maxFileSizes[category], {
              decimals: 0,
            }),
          }),
        });
      }

      if (oversizedFiles.length > 0) {
        setNumFilesProcessing((prev) => prev - files.length);
        return;
      }

      const previewResults = processSelectedFiles(files);
      const newFileBlobs = processResults(previewResults, true);

      // Commit each file as its own upload settles. Processing only the finished batch would
      // hold a file that is already uploaded at `uploadProgress: 100`, and a failed one at
      // `isUploading: true`, until the slowest upload of the batch finishes.
      const uploadResults = await uploadFiles(newFileBlobs, {
        ...options,
        onFileSettled: (result) => processResults([result]),
      });
      const finalFileBlobs = uploadResults.flatMap((result) =>
        result.isOk() ? [result.value] : []
      );

      setNumFilesProcessing((prev) => prev - files.length);

      return finalFileBlobs;
    },
    [
      maxFileSizes,
      processResults,
      processSelectedFiles,
      resolveSelectedFileContentType,
      sendNotification,
      sizeResolverOpts,
      t,
      uploadFiles,
    ]
  );

  const handleFileChange = useCallback(
    async (e: ChangeEvent) => {
      const selectedFiles = Array.from(
        (e?.target as HTMLInputElement).files ?? []
      );

      return handleFilesUpload(selectedFiles);
    },
    [handleFilesUpload]
  );

  const removeFile = useCallback(
    (fileId: string) => {
      setFileBlobs((prevFiles) => {
        const fileBlob = prevFiles.find((f) => f.id === fileId);

        if (!fileBlob) {
          return prevFiles;
        }

        // Delete from server if file has been uploaded
        if (fileBlob.fileId) {
          void clientFetch(`/api/w/${owner.sId}/files/${fileBlob.fileId}`, {
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
    },
    [owner.sId, isProcessingFiles]
  );

  const resetUpload = useCallback(() => {
    setFileBlobs([]);
  }, []);

  const fileBlobHasFileId = useCallback(
    (fileBlob: FileBlob): fileBlob is FileBlobWithFileId => {
      return fileBlob.fileId !== null;
    },
    []
  );

  const getFileBlobs: () => FileBlobWithFileId[] = useCallback(() => {
    return fileBlobs.filter(fileBlobHasFileId);
  }, [fileBlobs, fileBlobHasFileId]);

  const getFileBlob = useCallback(
    (blobId: string | null | undefined) => {
      if (!blobId) {
        return undefined;
      }
      return getFileBlobs().find((blob) => blob.id === blobId);
    },
    [getFileBlobs]
  );

  const addUploadedFile = useCallback(
    (fileData: {
      fileId: string;
      filename: string;
      contentType: SupportedFileContentType;
      size: number;
      id?: string;
      sourceUrl?: string;
      iconName?: string;
      provider?: string;
    }) => {
      const blob: FileBlob = {
        contentType: fileData.contentType,
        file: new File([], fileData.filename, { type: fileData.contentType }),
        filename: fileData.filename,
        id: fileData.id ?? fileData.fileId,
        fileId: fileData.fileId,
        isUploading: false,
        uploadProgress: null,
        size: fileData.size,
        sourceUrl: fileData.sourceUrl,
        iconName: fileData.iconName,
        provider: fileData.provider,
      };

      setFileBlobs((prevFiles) => [...prevFiles, blob]);
    },
    []
  );

  const result = useMemo(() => {
    return {
      acceptedFileExtensions,
      addUploadedFile,
      fileBlobs,
      getFileBlob,
      getFileBlobs,
      handleFileChange,
      handleFilesUpload,
      isProcessingFiles,
      removeFile,
      resetUpload,
    };
  }, [
    acceptedFileExtensions,
    addUploadedFile,
    fileBlobs,
    getFileBlob,
    getFileBlobs,
    handleFileChange,
    handleFilesUpload,
    isProcessingFiles,
    removeFile,
    resetUpload,
  ]);

  return result;
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
  uploadProgress: null,
  size: file.size,
});
