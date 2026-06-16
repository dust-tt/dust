import type { AllSupportedFileContentType } from "@app/types/files";

// SVG and ICO are accepted but rasterized to PNG during processing.
const SUPPORTED_CONTENT_TYPES: Set<AllSupportedFileContentType> = new Set([
  "image/jpeg",
  "image/png",
  "image/svg+xml",
  "image/webp",
  "image/x-icon",
]);

export function isSupportedForWorkspaceBranding(
  contentType: AllSupportedFileContentType
): boolean {
  return SUPPORTED_CONTENT_TYPES.has(contentType);
}
