import {
  isMarkdownContentType,
  isSupportedAudioContentType,
  isSupportedDelimitedTextContentType,
} from "@app/types/files";

export type ProcessedContent = {
  text: string;
  format: "markdown" | "text" | "audio";
};

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

  if (isSupportedDelimitedTextContentType(contentType)) {
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
