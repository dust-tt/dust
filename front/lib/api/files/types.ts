import type { SupportedFileContentType } from "@dust-tt/types";
import {
  isSupportedImageContenType,
  isSupportedPlainTextContentType,
} from "@dust-tt/types";

// Define max sizes for each category.
const MAX_SIZES: Record<"plainText" | "image", number> = {
  plainText: 1 * 1024 * 1024, // 1 MB
  image: 5 * 1024 * 1024, // 5 MB
};

// Function to ensure file size is within max limit for given content type.
export function ensureFileSize(
  contentType: SupportedFileContentType,
  fileSize: number
): boolean {
  if (isSupportedPlainTextContentType(contentType)) {
    return fileSize <= MAX_SIZES.plainText;
  }

  if (isSupportedImageContenType(contentType)) {
    return fileSize <= MAX_SIZES.image;
  }

  return false;
}
