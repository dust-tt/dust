import {
  contentTypeFromFileName,
  extensionsForContentType,
  isAllSupportedFileContentType,
  stripMimeParameters,
} from "@app/types/files";
import { escape, unescape } from "html-escaper";

export const FILE_PREVIEW_DIRECTIVE_NAME = "preview_file";
export const FILE_PREVIEW_COMPONENT_NAME = "file_preview";
export const FILE_PREVIEW_NODE_TYPE = "filePreview";
export const FILE_PREVIEW_DIRECTIVE_EXAMPLE =
  ':preview_file{path="conversation-<id>/report.pdf" title="report.pdf" contentType="application/pdf"}';

export type ParsedFilePreviewDirective = {
  contentType?: string;
  path: string;
  raw: string;
  title?: string;
};

const FILE_PREVIEW_DIRECTIVE_REGEX = new RegExp(
  String.raw`:${FILE_PREVIEW_DIRECTIVE_NAME}(?:\[[^\]\n]*\])?\{([^}\n]*)\}`,
  "g"
);
const FILE_PREVIEW_PATH_ATTRIBUTE_REGEX =
  /\bpath\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s}]+))/;

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

function parseQuotedDirectiveAttributeValue(
  src: string,
  startIndex: number
): { endIndex: number; value: string } | null {
  if (src[startIndex] !== '"') {
    return null;
  }

  let value = "";
  for (let index = startIndex + 1; index < src.length; index += 1) {
    if (src[index] === '"') {
      return {
        endIndex: index + 1,
        value: unescape(value),
      };
    }

    value += src[index];
  }

  return null;
}

export function parseFilePreviewMarkdownDirective(
  src: string
): ParsedFilePreviewDirective | null {
  const prefix = `:${FILE_PREVIEW_DIRECTIVE_NAME}{`;
  if (!src.startsWith(prefix)) {
    return null;
  }

  let index = prefix.length;
  const attributes: Record<string, string> = {};

  while (index < src.length && src[index] !== "}") {
    while (index < src.length && src[index] === " ") {
      index += 1;
    }

    const equalsIndex = src.indexOf("=", index);
    if (equalsIndex === -1) {
      return null;
    }

    const key = src.slice(index, equalsIndex);
    const parsedValue = parseQuotedDirectiveAttributeValue(
      src,
      equalsIndex + 1
    );
    if (!parsedValue) {
      return null;
    }

    attributes[key] = parsedValue.value;
    index = parsedValue.endIndex;
  }

  if (src[index] !== "}") {
    return null;
  }

  const path = attributes.path;
  if (!path) {
    return null;
  }

  return {
    contentType: attributes.contentType,
    path,
    raw: src.slice(0, index + 1),
    title: attributes.title,
  };
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

export function getFilePreviewDirectivePaths(content: string): Set<string> {
  const paths = new Set<string>();

  for (const match of content.matchAll(FILE_PREVIEW_DIRECTIVE_REGEX)) {
    const attributes = match[1];
    const pathMatch = attributes.match(FILE_PREVIEW_PATH_ATTRIBUTE_REGEX);
    const encodedPath = pathMatch?.[1] ?? pathMatch?.[2] ?? pathMatch?.[3];

    if (encodedPath) {
      paths.add(unescape(encodedPath));
    }
  }

  return paths;
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
    "Always place the previewable file directive inline within the sentence that mentions the file, " +
    "rather than as a standalone element at the end of the response. " +
    `For example: "Here is your file ${getFilePreviewMarkdownDirective({ contentType, path, title })}"\n` +
    "The rendered link opens the file preview, where the user can download the file. " +
    "Do not invent a URL for this file."
  );
}
