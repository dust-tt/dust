import type { AllSupportedFileContentType } from "@app/types/files";

// SVG is accepted but rasterized to PNG during processing to neutralize XSS risk.
const SUPPORTED_CONTENT_TYPES: Set<AllSupportedFileContentType> = new Set([
  "image/jpeg",
  "image/png",
  "image/svg+xml",
  "image/webp",
]);

export function isSupportedForWorkspaceBranding(
  contentType: AllSupportedFileContentType
): boolean {
  return SUPPORTED_CONTENT_TYPES.has(contentType);
}
