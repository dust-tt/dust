/**
 * Derive a user-facing title for a frame file.
 * Prefers an in-frame heading when present, otherwise humanizes the file name.
 */
export function getFrameDisplayTitle(
  fileName: string,
  frameSource?: string | null
): string {
  if (frameSource) {
    const metadataTitle = frameSource.match(
      /\btitle\s*:\s*["']([^"']+)["']/
    )?.[1];
    if (metadataTitle?.trim()) {
      return metadataTitle.trim();
    }

    const headingTagMatch = frameSource.match(
      /<h[12][^>]*>\s*([^<]+?)\s*<\/h[12]>/i
    );
    if (headingTagMatch?.[1]?.trim()) {
      return headingTagMatch[1].trim();
    }

    const headingClassMatch = frameSource.match(
      /className=["'][^"']*heading-(?:2xl|xl|lg)[^"']*["'][^>]*>\s*([^<{]+?)\s*</
    );
    if (headingClassMatch?.[1]?.trim()) {
      return headingClassMatch[1].trim();
    }
  }

  return humanizeFrameFileName(fileName);
}

function humanizeFrameFileName(fileName: string): string {
  const base = fileName.replace(/\.(html|tsx|jsx)$/i, "");
  const words = base.replace(/[-_]+/g, " ").trim();
  if (!words) {
    return fileName;
  }
  return words.replace(/\b\w/g, (char) => char.toUpperCase());
}
