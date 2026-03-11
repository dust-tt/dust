import type { AllSupportedFileContentType } from "@app/types/files";

const SUPPORTED_CONTENT_TYPES: Set<AllSupportedFileContentType> = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/bmp",
]);

export function isSupportedForAvatar(
  contentType: AllSupportedFileContentType
): boolean {
  return SUPPORTED_CONTENT_TYPES.has(contentType);
}
