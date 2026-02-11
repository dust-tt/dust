import fs from "fs";
import { stat } from "fs/promises";
import path from "path";

export const MAX_LINES_TEXT_FILE = 2000;
export const MAX_LINE_LENGTH_TEXT_FILE = 2000;
export const MAX_FILE_SIZE = 50 * 1024 * 1024;

export function formatFileSize(bytes: number): string {
  if (bytes === 0) {
    return "0 Bytes";
  }

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function detectFileType(
  filePath: string
): "text" | "image" | "pdf" | "binary" {
  const fileExtension = path.extname(filePath).toLowerCase();

  if (fileExtension === ".ts" || fileExtension === ".tsx") {
    return "text";
  }

  const binaryExtensions = new Set([
    ".zip", ".tar", ".gz", ".exe", ".dll", ".so", ".class", ".jar", ".war",
    ".7z", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".odt", ".ods",
    ".odp", ".bin", ".dat", ".obj", ".o", ".a", ".lib", ".wasm", ".pyc", ".pyo",
  ]);

  if (binaryExtensions.has(fileExtension)) {
    return "binary";
  }

  const imageExtensions = new Set([
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp",
  ]);

  if (imageExtensions.has(fileExtension)) {
    return "image";
  }

  if (fileExtension === ".pdf") {
    return "pdf";
  }

  return "text";
}

export async function processFile(
  filePath: string,
  offset: number = 0,
  limit: number = MAX_LINES_TEXT_FILE
): Promise<{ data: string } | { error: string }> {
  if (!fs.existsSync(filePath)) {
    return { error: `File at ${filePath} does not exist.` };
  }

  const stats = await stat(filePath);

  if (!stats.isFile()) {
    return { error: `Path is not a file: ${filePath}` };
  }

  if (stats.size > MAX_FILE_SIZE) {
    return { error: `File too large: ${formatFileSize(stats.size)}. Max: ${formatFileSize(MAX_FILE_SIZE)}` };
  }

  const fileType = detectFileType(filePath);

  switch (fileType) {
    case "binary":
      return { error: "Cannot handle binary files." };
    case "image":
    case "pdf": {
      const contentBuffer = await fs.promises.readFile(filePath);
      const base64Data = contentBuffer.toString("base64");
      return { data: base64Data };
    }
    case "text": {
      const content = await fs.promises.readFile(filePath, "utf-8");
      const lines = content.split("\n");
      const oldLineCount = lines.length;

      const startLine = Math.min(offset, oldLineCount);
      const endLine = Math.min(startLine + limit, oldLineCount);

      const selectedLines = lines.slice(startLine, endLine);

      const totalCut = endLine < oldLineCount;
      let linesCut = false;
      const formattedLines = selectedLines.map((line) => {
        if (line.length > MAX_LINE_LENGTH_TEXT_FILE) {
          linesCut = true;
          return line.substring(0, MAX_LINE_LENGTH_TEXT_FILE) + "... [cut]";
        }
        return line;
      });

      let cutMessage = "";
      if (totalCut) {
        cutMessage = `[File content cut: showing lines ${startLine + 1}-${endLine} of ${oldLineCount} total lines. Use offset/limit parameters to view more.]\n`;
      } else if (linesCut) {
        cutMessage = `[File content partially cut: some lines exceeded maximum length of ${MAX_LINE_LENGTH_TEXT_FILE} characters.]\n`;
      }

      const resContent = cutMessage + formattedLines.join("\n");
      return { data: resContent };
    }
    default:
      return { error: "Unsupported file type." };
  }
}
