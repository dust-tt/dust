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
  flags,
  providedMetadata,
  useCase,
}: {
  contentType: AllSupportedFileContentType;
  fileName: string;
  flags: { hasSandboxTools: boolean };
  providedMetadata: FileUseCaseMetadata | undefined;
  useCase: FileUseCase;
}): FileUseCaseMetadata | undefined {
  const category = getFileFormatCategory(contentType);
  const isSandboxRaw =
    category !== null &&
    allowsSandboxRawUpload({
      category,
      hasSandboxTools: flags.hasSandboxTools,
      useCase,
    });

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
