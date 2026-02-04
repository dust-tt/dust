import { isSupportedAudioContentType } from "@app/types";

/**
 * Content types compatible with Microsoft Office Online viewer.
 * These files can be previewed using the Office viewer iframe.
 */
const OFFICE_VIEWER_CONTENT_TYPES = [
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

const CSV_CONTENT_TYPES = [
  "text/csv",
  "text/comma-separated-values",
  "text/tsv",
  "text/tab-separated-values",
] as const;

export function isOfficeViewerCompatible(contentType: string): boolean {
  return OFFICE_VIEWER_CONTENT_TYPES.includes(
    contentType as (typeof OFFICE_VIEWER_CONTENT_TYPES)[number]
  );
}

function isCsvContentType(contentType: string): boolean {
  return CSV_CONTENT_TYPES.includes(
    contentType as (typeof CSV_CONTENT_TYPES)[number]
  );
}

function isPdfContentType(contentType: string): boolean {
  return contentType === "application/pdf";
}

function isMarkdownContentType(contentType: string): boolean {
  return contentType === "text/markdown";
}

export type ProcessedContent = {
  text: string;
  format: "markdown" | "text" | "audio";
};

export type FilePreviewCategory =
  | "pdf"
  | "office"
  | "audio"
  | "markdown"
  | "csv"
  | "text";

export interface FilePreviewConfig {
  category: FilePreviewCategory;
  needsProcessedVersion: boolean;
  supportsExternalViewer: boolean;
}

export function getFilePreviewConfig(contentType: string): FilePreviewConfig {
  if (isPdfContentType(contentType)) {
    return {
      category: "pdf",
      needsProcessedVersion: true,
      supportsExternalViewer: true,
    };
  }

  if (isOfficeViewerCompatible(contentType)) {
    return {
      category: "office",
      needsProcessedVersion: true,
      supportsExternalViewer: true,
    };
  }

  if (isSupportedAudioContentType(contentType)) {
    return {
      category: "audio",
      needsProcessedVersion: true,
      supportsExternalViewer: false,
    };
  }

  if (isMarkdownContentType(contentType)) {
    return {
      category: "markdown",
      needsProcessedVersion: false,
      supportsExternalViewer: false,
    };
  }

  if (isCsvContentType(contentType)) {
    return {
      category: "csv",
      needsProcessedVersion: false,
      supportsExternalViewer: false,
    };
  }

  return {
    category: "text",
    needsProcessedVersion: false,
    supportsExternalViewer: false,
  };
}

function csvToMarkdownTable(content: string, isTsv: boolean): string {
  const delimiter = isTsv ? "\t" : ",";
  const lines = content.split("\n").filter((line) => line.trim());

  if (lines.length === 0) {
    return "";
  }

  const rows = lines.map((line) =>
    line.split(delimiter).map((cell) => cell.trim())
  );

  const markdownRows = rows.map((row) => `| ${row.join(" | ")} |`);

  if (markdownRows.length > 0) {
    const columnCount = rows[0].length;
    const separator = `| ${Array(columnCount).fill("---").join(" | ")} |`;
    markdownRows.splice(1, 0, separator);
  }

  return markdownRows.join("\n");
}

function tableMarkersToMarkdown(content: string): string {
  const sections = content.split(/(?=TABLE:)/);
  const markdownSections: string[] = [];

  for (const section of sections) {
    if (!section.trim()) {
      continue;
    }

    const lines = section.trim().split("\n");
    let title = "";
    let startIndex = 0;

    if (lines[0]?.startsWith("TABLE:")) {
      title = lines[0].replace("TABLE:", "").trim();
      startIndex = 1;
    }

    const csvContent = lines.slice(startIndex).join("\n");
    const markdownTable = csvToMarkdownTable(csvContent, false);

    if (markdownTable) {
      if (title) {
        markdownSections.push(`**${title}**\n\n${markdownTable}`);
      } else {
        markdownSections.push(markdownTable);
      }
    }
  }

  return markdownSections.join("\n\n");
}

export function processFileContent(
  content: string,
  contentType: string
): ProcessedContent {
  const trimmed = content.trim();

  if (isSupportedAudioContentType(contentType)) {
    return {
      text: trimmed,
      format: "audio",
    };
  }

  if (isCsvContentType(contentType)) {
    const isTsv =
      contentType === "text/tsv" || contentType === "text/tab-separated-values";
    return {
      text: csvToMarkdownTable(trimmed, isTsv),
      format: "markdown",
    };
  }

  if (trimmed.startsWith("TABLE:") || trimmed.includes("\nTABLE:")) {
    return {
      text: tableMarkersToMarkdown(trimmed),
      format: "markdown",
    };
  }

  if (isMarkdownContentType(contentType)) {
    return {
      text: trimmed,
      format: "markdown",
    };
  }

  return {
    text: trimmed,
    format: "text",
  };
}
