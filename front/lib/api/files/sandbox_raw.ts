import type { FileResource } from "@app/lib/resources/file_resource";
import type {
  AllSupportedFileContentType,
  FileUseCase,
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
