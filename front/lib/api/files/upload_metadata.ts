import { shouldSkipDataSourceIndexing } from "@app/lib/api/files/should_skip_indexing";
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
  const skipDataSourceIndexing = shouldSkipDataSourceIndexing({
    contentType,
    fileName,
  });
  const category = getFileFormatCategory(contentType);
  const isSandboxRaw =
    category !== null &&
    allowsSandboxRawUpload({
      category,
      hasSandboxTools: flags.hasSandboxTools,
      useCase,
    });

  if (!skipDataSourceIndexing && !isSandboxRaw) {
    return providedMetadata;
  }

  return {
    ...(providedMetadata ?? {}),
    ...(skipDataSourceIndexing ? { skipDataSourceIndexing: true } : {}),
    ...(isSandboxRaw
      ? {
          skipDataSourceIndexing: true,
          skipFileProcessing: true,
        }
      : {}),
  };
}
