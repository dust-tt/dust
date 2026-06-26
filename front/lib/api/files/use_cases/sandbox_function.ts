import type { AllSupportedFileContentType } from "@app/types/files";

const SUPPORTED_CONTENT_TYPES: Set<AllSupportedFileContentType> = new Set([
  "text/typescript",
]);

export function isSupportedForSandboxFunction(
  contentType: AllSupportedFileContentType
): boolean {
  return SUPPORTED_CONTENT_TYPES.has(contentType);
}
