import type { Result, SupportedFileContentType } from "@dust-tt/client";
import {
  Err,
  isSupportedFileContentType,
  Ok,
  supportedFileExtensions,
  supportedImageFileFormats,
  supportedOtherFileFormats,
} from "@dust-tt/client";
import fs from "fs";
import { stat } from "fs/promises";
import mime from "mime-types";
import path, { basename, extname } from "path";

export const MAX_LINES_TEXT_FILE = 2000;
export const MAX_LINE_LENGTH_TEXT_FILE = 2000;

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
): Promise<Result<FileInfo, Error>> {
  const stats = await stat(filePath);

  if (!stats.isFile()) {
    return new Err(new Error(`Path is not a file: ${filePath}`));
  }

  const name = basename(filePath);
  const extension = extname(filePath);
  const size = stats.size;

  if (!isSupportedFileType(extension)) {
    return new Err(
      new Error(
        `Unsupported file type: ${extension}. Supported types: ${supportedFileExtensions.join(
          ", "
        )}`
      )
    );
  }

  if (size > MAX_FILE_SIZE) {
    return new Err(
      new Error(
        `File too large: ${formatFileSize(
          size
        )}. Maximum size: ${formatFileSize(MAX_FILE_SIZE)}`
      )
    );
  }

  return new Ok({
    path: filePath,
    name,
    size,
    type: getMimeType(extension),
    extension,
    fileType: detectFileType(filePath),
  });
}

/**
 * Get file extension with leading dot
 */
export function getFileExtension(filename: string): string {
  return extname(filename).toLowerCase();
}

export function detectFileType(
  filePath: string
): "text" | "image" | "pdf" | "audio" | "video" | "binary" {
  const fileExtension = path.extname(filePath).toLowerCase();

  // Handle TypeScript files specifically (mime library treats .ts as video)
  if (fileExtension === ".ts") {
    return "text";
  }

  // Check against known binary file extensions first
  const binaryExtensions = new Set([
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
  ]);

  if (binaryExtensions.has(fileExtension)) {
    return "binary";
  }

  // Use mime type detection for remaining files
  const mimeType = mime.lookup(filePath);
  if (!mimeType) {
    return "text"; // Default to text if no mime type found
  }

  // Map mime types to file categories
  const mimeTypeMap = {
    "image/": "image",
    "audio/": "audio",
    "video/": "video",
  } as const;

  // Check for mime type prefixes
  for (const [prefix, category] of Object.entries(mimeTypeMap)) {
    if (mimeType.startsWith(prefix)) {
      return category;
    }
  }

  // Handle PDF specifically
  if (mimeType === "application/pdf") {
    return "pdf";
  }

  // Default fallback
  return "text";
}

export async function processFile(
  filePath: string,
  offset: number = 0,
  limit: number = MAX_LINES_TEXT_FILE
): Promise<Result<{ data: string }, Error>> {
  // check for existence
  if (!fs.existsSync(filePath)) {
    return new Err(new Error(`File at ${filePath} does not exist.`));
  }

  // get stats, checks for file size and for whether it actually is a file and not a directory
  const fileInfoRes = await validateAndGetFileInfo(filePath);
  if (fileInfoRes.isErr()) {
    return fileInfoRes;
  }

  switch (fileInfoRes.value.fileType) {
    case "binary":
      return new Err(new Error("Cannot handle binary files."));
    case "image":
    case "pdf":
      const contentBuffer = await fs.promises.readFile(filePath);
      const base64Data = contentBuffer.toString("base64");
      return new Ok({
        data: base64Data,
      });
    case "text":
      const content = await fs.promises.readFile(filePath, "utf-8");
      const lines = content.split("\n");
      const oldLineCount = lines.length;

      const startLine = Math.min(offset, oldLineCount);
      const endLine = Math.min(startLine + limit, oldLineCount);

      const selectedLines = lines.slice(startLine, endLine);

      const totalCut = endLine < oldLineCount;
      let linesCut = false;
      // Compute line number padding width for alignment
      const maxLineNum = startLine + selectedLines.length;
      const padWidth = String(maxLineNum).length;
      const formattedLines = selectedLines.map((line, idx) => {
        const lineNum = String(startLine + idx + 1).padStart(padWidth, " ");
        if (line.length > MAX_LINE_LENGTH_TEXT_FILE) {
          linesCut = true;
          return `${lineNum}\t${line.substring(0, MAX_LINE_LENGTH_TEXT_FILE)}... [cut]`;
        }
        return `${lineNum}\t${line}`;
      });

      let cutMessage = "";
      if (totalCut) {
        cutMessage = `[File content cut: showing lines ${
          startLine + 1
        }-${endLine} of ${oldLineCount} total lines. Use offset/limit parameters to view more.]\n`;
      } else if (linesCut) {
        cutMessage = `[File content partially cut: some lines exceeded maximum length of ${MAX_LINE_LENGTH_TEXT_FILE} characters.]\n`;
      }

      const resContent = cutMessage + formattedLines.join("\n");

      return new Ok({
        data: resContent,
      });
    case "audio":
    case "video":
      return new Err(
        new Error("Video and audio content is not yet supported.")
      );
    default:
      return new Err(new Error("We should not have reached this statement."));
  }
}
