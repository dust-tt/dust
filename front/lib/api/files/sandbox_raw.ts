import type { FileResource } from "@app/lib/resources/file_resource";
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
