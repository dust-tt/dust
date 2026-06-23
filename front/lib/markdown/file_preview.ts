import {
  contentTypeFromFileName,
  extensionsForContentType,
  isAllSupportedFileContentType,
  stripMimeParameters,
} from "@app/types/files";
import { escape } from "html-escaper";

export const FILE_PREVIEW_DIRECTIVE_NAME = "preview_file";
export const FILE_PREVIEW_COMPONENT_NAME = "file_preview";
export const FILE_PREVIEW_DIRECTIVE_EXAMPLE =
  ':preview_file{path="conversation-<id>/report.pdf" title="report.pdf" contentType="application/pdf"}';

function fileExtensionLabel(fileName: string): string | null {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === fileName.length - 1) {
    return null;
  }

  return fileName.slice(lastDot + 1).toUpperCase();
}

function contentTypeExtensionLabel(contentType: string | null): string | null {
  if (!contentType || !isAllSupportedFileContentType(contentType)) {
    return null;
  }

  const primaryExtension = extensionsForContentType(contentType)[0];
  if (!primaryExtension) {
    return null;
  }

  return primaryExtension.replace(/^\./, "").toUpperCase();
}

function quoteDirectiveAttribute(value: string): string {
  return `"${escape(value.replaceAll("\r", " ").replaceAll("\n", " "))}"`;
}

export function getFileNameFromScopedPath(filePath: string): string {
  const trimmed = filePath.trim().replace(/\/+$/, "");
  const lastSlash = trimmed.lastIndexOf("/");
  const fileName = lastSlash >= 0 ? trimmed.slice(lastSlash + 1) : trimmed;

  return fileName || filePath;
}

export function getFilePreviewContentType({
  contentType,
  fileName,
}: {
  contentType?: string;
  fileName: string;
}): string {
  if (contentType) {
    return stripMimeParameters(contentType);
  }

  return contentTypeFromFileName(fileName) ?? "application/octet-stream";
}

export function getFilePreviewTypeLabel({
  contentType,
  fileName,
}: {
  contentType?: string;
  fileName: string;
}): string {
  const fileContentType = contentType
    ? stripMimeParameters(contentType)
    : contentTypeFromFileName(fileName);

  const extensionLabel = fileExtensionLabel(fileName);
  if (extensionLabel) {
    return extensionLabel;
  }

  const contentTypeLabel = contentTypeExtensionLabel(fileContentType);
  if (contentTypeLabel) {
    return contentTypeLabel;
  }

  return "File";
}

export function getFilePreviewMarkdownDirective({
  contentType,
  path,
  title,
}: {
  contentType?: string;
  path: string;
  title?: string;
}): string {
  const fileName = title || getFileNameFromScopedPath(path);
  const attributes = [
    `path=${quoteDirectiveAttribute(path)}`,
    `title=${quoteDirectiveAttribute(fileName)}`,
  ];
  if (contentType) {
    attributes.push(`contentType=${quoteDirectiveAttribute(contentType)}`);
  }

  return `:${FILE_PREVIEW_DIRECTIVE_NAME}{${attributes.join(" ")}}`;
}

export function getFilePreviewDirectiveInstruction({
  contentType,
  path,
  title,
}: {
  contentType?: string;
  path: string;
  title?: string;
}): string {
  return (
    "To show a previewable file citation in your response, output this markdown directive exactly on its own line:\n" +
    `${getFilePreviewMarkdownDirective({ contentType, path, title })}\n` +
    "Do not invent a URL for this file."
  );
}
