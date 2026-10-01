import { getFileFormat, normalizeMimeType } from "@app/types/files";

export function isContentTypeSafeToDisplay(contentType: string): boolean {
  return (
    getFileFormat(normalizeMimeType(contentType))?.isSafeToDisplay ?? false
  );
}

export function contentDispositionAttachment(fileName: string): string {
  const asciiFallback = fileName.replace(/[^\x20-\x7E\/\\]/g, "_");
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
