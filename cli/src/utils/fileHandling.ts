import { stat } from "fs/promises";
import { basename, extname } from "path";
import {
  supportedImageFileFormats,
  supportedOtherFileFormats,
  supportedFileExtensions,
} from "@dust-tt/client";

export interface FileInfo {
  path: string;
  name: string;
  size: number;
  type: string;
  extension: string;
}

// Maximum file size (50MB)
export const MAX_FILE_SIZE = 50 * 1024 * 1024;

/**
 * Check if a file type is supported
 */
export function isSupportedFileType(extension: string): boolean {
  const mime = getMimeType(extension);
  return supportedFileExtensions.includes(mime);
}

/**
 * Check if a file type is an image
 */
export function isImageFile(extension: string): boolean {
  return Object.values(supportedImageFileFormats)
    .flat()
    .some((ext) => ext.toLowerCase() === extension.toLowerCase());
}

/**
 * Get MIME type from file extension
 */
export function getMimeType(extension: string): string {
  const ext = extension.toLowerCase();
  for (const [mime, exts] of Object.entries({
    ...supportedOtherFileFormats,
    ...supportedImageFileFormats,
  })) {
    if (
      !exts ||
      !Array.isArray(exts) ||
      exts.length === 0 ||
      mime.includes("dust")
    ) {
      continue;
    }
    if (exts.includes(ext)) {
      return mime;
    }
  }
  return "application/octet-stream";
}

/**
 * Format file size in human-readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) {
    return "0 Bytes";
  }

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Validate file path and get file information
 */
export async function validateAndGetFileInfo(
  filePath: string
): Promise<FileInfo> {
  try {
    const stats = await stat(filePath);

    if (!stats.isFile()) {
      throw new Error(`Path is not a file: ${filePath}`);
    }

    const name = basename(filePath);
    const extension = extname(filePath);
    const size = stats.size;

    if (!isSupportedFileType(extension)) {
      throw new Error(
        `Unsupported file type: ${extension}. Supported types: ${supportedFileExtensions.join(
          ", "
        )}`
      );
    }

    if (size > MAX_FILE_SIZE) {
      throw new Error(
        `File too large: ${formatFileSize(
          size
        )}. Maximum size: ${formatFileSize(MAX_FILE_SIZE)}`
      );
    }

    return {
      path: filePath,
      name,
      size,
      type: getMimeType(extension),
      extension,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Failed to validate file: ${String(error)}`);
  }
}

/**
 * Get file extension with leading dot
 */
export function getFileExtension(filename: string): string {
  return extname(filename).toLowerCase();
}
