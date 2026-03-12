import type { AllSupportedFileContentType } from "@app/types/files";

const SUPPORTED_CONTENT_TYPES: Set<AllSupportedFileContentType> = new Set([
  // Spreadsheets (Excel: text extracted; CSV/TSV: used as-is).
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "text/tab-separated-values",
]);

export function isSupportedForUpsertTable(
  contentType: AllSupportedFileContentType
): boolean {
  return SUPPORTED_CONTENT_TYPES.has(contentType);
}
