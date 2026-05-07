import { shouldSkipDataSourceIndexing } from "@app/lib/api/files/should_skip_indexing";
import type { FileResource } from "@app/lib/resources/file_resource";
import type {
  AllSupportedFileContentType,
  FileUseCase,
  FileUseCaseMetadata,
} from "@app/types/files";
import { isSupportedDelimitedTextContentType } from "@app/types/files";

export function isSandboxRawDelimitedConversationFile(
  file: FileResource
): boolean {
  return (
    file.useCase === "conversation" &&
    file.useCaseMetadata?.skipFileProcessing === true &&
    isSupportedDelimitedTextContentType(file.contentType)
  );
}

export function shouldStampSandboxRawDelimited({
  contentType,
  flags,
  useCase,
}: {
  contentType: AllSupportedFileContentType;
  flags: { hasSandboxTools: boolean };
  useCase: FileUseCase;
}): boolean {
  return (
    flags.hasSandboxTools &&
    useCase === "conversation" &&
    isSupportedDelimitedTextContentType(contentType)
  );
}

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
