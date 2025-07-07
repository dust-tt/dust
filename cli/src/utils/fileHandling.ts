// The logic, prompts and api from this file is largely inspired from Google's Gemini cli code
import type { SupportedFileContentType } from "@dust-tt/client";
import {
  isSupportedFileContentType,
  supportedFileExtensions,
  supportedImageFileFormats,
  supportedOtherFileFormats,
} from "@dust-tt/client";
import fs from "fs";
import { stat } from "fs/promises";
import mime from "mime-types";
import path, { basename, extname } from "path";

const MAX_LINES_TEXT_FILE = 2000;
const MAX_LINE_LENGTH_TEXT_FILE = 2000;

export interface FileInfo {
  path: string;
  name: string;
  size: number;
  type: SupportedFileContentType;
  extension: string;
  fileType: string;
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
export function getMimeType(extension: string): SupportedFileContentType {
  const ext = extension.toLowerCase();
  for (const [mime, exts] of Object.entries({
    ...supportedOtherFileFormats,
    ...supportedImageFileFormats,
  })) {
    if (
      !exts ||
      !Array.isArray(exts) ||
      exts.length === 0 ||
      mime.includes("dust") ||
      !isSupportedFileContentType(mime)
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
      fileType: detectFileType(filePath),
    };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Failed to validate file: ${String(error)}`);
  }
}

// robbed from google
export function detectFileType(
  filePath: string
): "text" | "image" | "pdf" | "audio" | "video" | "binary" {
  const ext = path.extname(filePath).toLowerCase();

  // The mimetype for "ts" is MPEG transport stream (a video format) but we want
  // to assume these are typescript files instead.
  if (ext === ".ts") {
    return "text";
  }

  const lookedUpMimeType = mime.lookup(filePath); // Returns false if not found, or the mime type string
  if (lookedUpMimeType) {
    if (lookedUpMimeType.startsWith("image/")) {
      return "image";
    }
    if (lookedUpMimeType.startsWith("audio/")) {
      return "audio";
    }
    if (lookedUpMimeType.startsWith("video/")) {
      return "video";
    }
    if (lookedUpMimeType === "application/pdf") {
      return "pdf";
    }
  }

  // Stricter binary check for common non-text extensions before content check
  // These are often not well-covered by mime-types or might be misidentified.
  if (
    [
      ".zip",
      ".tar",
      ".gz",
      ".exe",
      ".dll",
      ".so",
      ".class",
      ".jar",
      ".war",
      ".7z",
      ".doc",
      ".docx",
      ".xls",
      ".xlsx",
      ".ppt",
      ".pptx",
      ".odt",
      ".ods",
      ".odp",
      ".bin",
      ".dat",
      ".obj",
      ".o",
      ".a",
      ".lib",
      ".wasm",
      ".pyc",
      ".pyo",
    ].includes(ext)
  ) {
    return "binary";
  }

  // Fallback to content-based check if mime type wasn't conclusive for image/pdf
  // and it's not a known binary extension.
  // if (isBinaryFile(filePath)) {
  //   return "binary";
  // }

  return "text";
}

/**
 * Get file extension with leading dot
 */
export function getFileExtension(filename: string): string {
  return extname(filename).toLowerCase();
}

export async function processFile(
  filePath: string,
  offset: number = 0,
  limit: number = MAX_LINES_TEXT_FILE
) {
  // check for existence
  if (!fs.existsSync(filePath)) {
    throw new Error("");
  }

  // get stats, checks for file size and for whether it actually is a file and not a directory
  const { fileType } = await validateAndGetFileInfo(filePath);

  switch (fileType) {
    case "binary":
      throw new Error("cannot handle binary files");
    case "text":
      // TODO: code below was heavily inspired from google's gemini
      const content = await fs.promises.readFile(filePath, "utf-8");
      const lines = content.split("\n");
      const oldLineCount = lines.length;

      const startLine = Math.min(offset, oldLineCount);
      const endLine = Math.min(startLine + limit, oldLineCount);

      const selectedLines = lines.slice(startLine, endLine);

      const totalTruncated = endLine < oldLineCount;
      let linesTruncated = false;
      const formattedLines = selectedLines.map((line) => {
        if (line.length > MAX_LINE_LENGTH_TEXT_FILE) {
          linesTruncated = true;
          return (
            line.substring(0, MAX_LINE_LENGTH_TEXT_FILE) + "... [truncated]"
          );
        }
        return line;
      });

      let truncMessage = "";
      // both messages below are copied from google
      if (totalTruncated) {
        truncMessage = `[File content truncated: showing lines ${
          startLine + 1
        }-${endLine} of ${oldLineCount} total lines. Use offset/limit parameters to view more.]\n`;
      } else if (linesTruncated) {
        truncMessage = `[File content partially truncated: some lines exceeded maximum length of ${MAX_LINE_LENGTH_TEXT_FILE} characters.]\n`;
      }

      const resContent = truncMessage + formattedLines.join("\n");

      return {
        data: resContent,
      };
    case "image":
    case "pdf":
    case "audio":
    case "video":
      const contentBuffer = await fs.promises.readFile(filePath);
      const base64Data = contentBuffer.toString("base64");
      return {
        data: base64Data,
        // mimeType: mime.lookup(filePath) || "application/octet-stream", // wtf does this line do?
      };
    default:
      throw new Error("We should now have reached this statement");
  }
  // handle depending on file types, specifically be ready to handle file lines in text content
}
