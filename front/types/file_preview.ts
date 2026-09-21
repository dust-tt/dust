import {
  getFileFormatCategory,
  isInteractiveContentType,
  isMarkdownContentType,
  isPdfContentType,
  isSandboxFunctionContentType,
  stripMimeParameters,
} from "@app/types/files";

const VIEWER_CONTENT_TYPES = new Set<string>([
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const CODE_PREVIEW_CONTENT_TYPES = new Set<string>([
  "application/javascript",
  "application/typescript",
]);

const TEXT_PREVIEW_CONTENT_TYPES = new Set<string>([
  "application/json",
  "application/vnd.dust.section.json",
  "application/x-ndjson",
  "application/xml",
  "application/yaml",
  "message/rfc822",
]);

export type FilePreviewCategory =
  | "frame"
  | "code"
  | "text"
  | "pdf"
  | "viewer"
  | "audio"
  | "markdown"
  | "delimited"
  | "image"
  | "unsupported";

interface FilePreviewConfig {
  category: FilePreviewCategory;
  needsProcessedVersion: boolean;
  supportsExternalViewer: boolean;
  supportsCopyContent: boolean;
}

function isViewerCompatible(contentType: string): boolean {
  return VIEWER_CONTENT_TYPES.has(contentType);
}

function isTextPreviewContentType(contentType: string): boolean {
  return (
    contentType.startsWith("text/") ||
    contentType.endsWith("+json") ||
    contentType.endsWith("+xml") ||
    TEXT_PREVIEW_CONTENT_TYPES.has(contentType)
  );
}

/**
 * @cc [owner:adrsimon,label:react] delimited-before-generic-text
 * CSV/TSV content types MUST resolve to the `delimited` category even though they match the
 * generic `text/` prefix, so they render as a table rather than as raw text.
 */
export function getFilePreviewConfig(
  rawContentType: string
): FilePreviewConfig {
  const contentType = stripMimeParameters(rawContentType);
  const category = getFileFormatCategory(contentType);

  if (isInteractiveContentType(contentType)) {
    return {
      category: "frame",
      needsProcessedVersion: false,
      supportsExternalViewer: false,
      supportsCopyContent: false,
    };
  }

  if (isPdfContentType(contentType)) {
    return {
      category: "pdf",
      needsProcessedVersion: true,
      supportsExternalViewer: true,
      supportsCopyContent: false,
    };
  }

  if (isViewerCompatible(contentType)) {
    return {
      category: "viewer",
      needsProcessedVersion: true,
      supportsExternalViewer: true,
      supportsCopyContent: false,
    };
  }

  if (isMarkdownContentType(contentType)) {
    return {
      category: "markdown",
      needsProcessedVersion: false,
      supportsExternalViewer: false,
      supportsCopyContent: true,
    };
  }

  if (
    category === "code" ||
    isSandboxFunctionContentType(contentType) ||
    CODE_PREVIEW_CONTENT_TYPES.has(contentType)
  ) {
    return {
      category: "code",
      needsProcessedVersion: false,
      supportsExternalViewer: false,
      supportsCopyContent: true,
    };
  }

  if (category === "delimited") {
    return {
      category: "delimited",
      needsProcessedVersion: false,
      supportsExternalViewer: false,
      supportsCopyContent: false,
    };
  }

  if (isTextPreviewContentType(contentType)) {
    return {
      category: "text",
      needsProcessedVersion: false,
      supportsExternalViewer: false,
      supportsCopyContent: true,
    };
  }

  if (category === "audio") {
    return {
      category: "audio",
      needsProcessedVersion: true,
      supportsExternalViewer: false,
      supportsCopyContent: false,
    };
  }

  if (category === "image") {
    return {
      category: "image",
      needsProcessedVersion: false,
      supportsExternalViewer: false,
      supportsCopyContent: false,
    };
  }

  return {
    category: "unsupported",
    needsProcessedVersion: false,
    supportsExternalViewer: false,
    supportsCopyContent: false,
  };
}

export function isFilePreviewableContentType(contentType: string): boolean {
  return getFilePreviewConfig(contentType).category !== "unsupported";
}
