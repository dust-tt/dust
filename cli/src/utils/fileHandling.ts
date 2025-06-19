import { stat } from "fs/promises";
import { basename, extname } from "path";

export interface FileInfo {
  path: string;
  name: string;
  size: number;
  type: string;
  extension: string;
}

// Supported file types for Dust CLI
export const SUPPORTED_IMAGE_TYPES = [
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".heic",
] as const;

export const SUPPORTED_DOCUMENT_TYPES = [
  ".pdf",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
  ".xls",
  ".xlsx",
  ".csv",
  ".txt",
  ".md",
  ".json",
  ".xml",
  ".yaml",
  ".yml",
] as const;

export const SUPPORTED_CODE_TYPES = [
  ".js",
  ".ts",
  ".tsx",
  ".jsx",
  ".py",
  ".java",
  ".cpp",
  ".c",
  ".h",
  ".php",
  ".rb",
  ".go",
  ".rs",
  ".swift",
  ".kt",
  ".scala",
  ".sql",
  ".html",
  ".css",
  ".sh",
  ".pl",
  ".pm",
] as const;

export const ALL_SUPPORTED_TYPES = [
  ...SUPPORTED_IMAGE_TYPES,
  ...SUPPORTED_DOCUMENT_TYPES,
  ...SUPPORTED_CODE_TYPES,
] as const;

// Maximum file size (50MB)
export const MAX_FILE_SIZE = 50 * 1024 * 1024;

/**
 * Check if a file type is supported
 */
export function isSupportedFileType(extension: string): boolean {
  return ALL_SUPPORTED_TYPES.includes(extension.toLowerCase() as any);
}

/**
 * Check if a file type is an image
 */
export function isImageFile(extension: string): boolean {
  return SUPPORTED_IMAGE_TYPES.includes(extension.toLowerCase() as any);
}

/**
 * Get MIME type from file extension
 */
export function getMimeType(extension: string): string {
  const ext = extension.toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".heic": "image/heic",
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx":
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx":
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".xls": "application/vnd.ms-excel",
    ".xlsx":
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".csv": "text/csv",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".json": "application/json",
    ".xml": "application/xml",
    ".yaml": "application/x-yaml",
    ".yml": "application/x-yaml",
    ".js": "text/javascript",
    ".ts": "text/typescript",
    ".tsx": "text/typescript",
    ".jsx": "text/javascript",
    ".py": "text/x-python",
    ".java": "text/x-java-source",
    ".cpp": "text/x-c++src",
    ".c": "text/x-csrc",
    ".h": "text/x-chdr",
    ".php": "text/x-php",
    ".rb": "text/x-ruby",
    ".go": "text/x-go",
    ".rs": "text/x-rust",
    ".swift": "text/x-swift",
    ".kt": "text/x-kotlin",
    ".scala": "text/x-scala",
    ".sql": "application/sql",
    ".html": "text/html",
    ".css": "text/css",
    ".sh": "application/x-sh",
    ".pl": "text/x-perl",
    ".pm": "text/x-perl",
  };

  return mimeTypes[ext] || "application/octet-stream";
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
        `Unsupported file type: ${extension}. Supported types: ${ALL_SUPPORTED_TYPES.join(
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
