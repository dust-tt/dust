import type {
  AllSupportedFileContentType,
  FileUseCase,
  FileUseCaseMetadata,
} from "@app/types/files";
import {
  allowsSandboxRawUpload,
  getFileFormatCategory,
} from "@app/types/files";

export function buildEffectiveUseCaseMetadata({
  contentType,
  fileName,
  providedMetadata,
  useCase,
}: {
  contentType: AllSupportedFileContentType;
  fileName: string;
  providedMetadata: FileUseCaseMetadata | undefined;
  useCase: FileUseCase;
}): FileUseCaseMetadata | undefined {
  const category = getFileFormatCategory(contentType);
  const isSandboxRaw =
    category !== null && allowsSandboxRawUpload({ category, useCase });

  if (!isSandboxRaw) {
    return providedMetadata;
  }

  return {
    ...(providedMetadata ?? {}),
    ...(isSandboxRaw
      ? {
          skipFileProcessing: true,
        }
      : {}),
  };
}
