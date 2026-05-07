import { shouldStampSandboxRawDelimited } from "@app/lib/api/files/sandbox_raw";
import { shouldSkipDataSourceIndexing } from "@app/lib/api/files/should_skip_indexing";
import type {
  AllSupportedFileContentType,
  FileUseCase,
  FileUseCaseMetadata,
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
  const isSandboxRawDelimited = shouldStampSandboxRawDelimited({
    contentType,
    flags,
    useCase,
  });

  if (!skipDataSourceIndexing && !isSandboxRawDelimited) {
    return providedMetadata;
  }

  return {
    ...(providedMetadata ?? {}),
    ...(skipDataSourceIndexing ? { skipDataSourceIndexing: true } : {}),
    ...(isSandboxRawDelimited
      ? {
          skipDataSourceIndexing: true,
          skipFileProcessing: true,
        }
      : {}),
  };
}
