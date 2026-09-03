import type { MarkdownFilePreviewViewMode } from "@app/components/file_explorer/MarkdownFilePreview";
import { MarkdownFilePreview } from "@app/components/file_explorer/MarkdownFilePreview";
import type { FileEntry } from "@app/components/file_explorer/types";
import type { FilePreviewCategory } from "@app/components/file_explorer/utils";
import { getFilePreviewConfig } from "@app/components/file_explorer/utils";
import type { ProcessedContent } from "@app/lib/file_content_utils";
import { processFileContent } from "@app/lib/file_content_utils";
import { getFileProcessedUrl, useFileContentByUrl } from "@app/lib/swr/files";
import { stripMimeParameters } from "@app/types/files";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";
import {
  CodeBlock,
  cn,
  DataTable,
  Markdown,
  ScrollableDataTable,
  Spinner,
} from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { lazy, Suspense } from "react";

// react-pdf (and pdfjs) is only needed when an actual PDF is being previewed;
// keep it out of the chunk shared by every other file-preview category.
const PDFViewer = lazy(() =>
  import("@app/components/file_explorer/PDFViewer").then((m) => ({
    default: m.PDFViewer,
  }))
);

export const MAX_CSV_ROWS = 200;
const MAX_TEXT_CHARS = 100_000;

const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  py: "python",
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  json: "json",
  sh: "bash",
  bash: "bash",
  html: "html",
  css: "css",
  sql: "sql",
  yaml: "yaml",
  yml: "yaml",
  rs: "rust",
  go: "go",
  rb: "ruby",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  cpp: "cpp",
  c: "c",
  cs: "csharp",
  php: "php",
  r: "r",
  md: "markdown",
  xml: "xml",
  toml: "toml",
};

function getCodeLanguage(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";

  return EXTENSION_TO_LANGUAGE[ext] ?? "text";
}

function getDelimitedRecordCount({
  content,
}: {
  content: string;
}): { displayed: number; total: number } | null {
  const lines = content.split("\n").filter((l) => l.trim());
  if (lines.length < 2) {
    return null;
  }

  const [, ...dataLines] = lines;
  const total = dataLines.length;

  return { displayed: Math.min(total, MAX_CSV_ROWS), total };
}

interface DelimitedPreviewProps {
  content: string;
  mimeType: string;
}

type Row = Record<string, string>;

function DelimitedPreview({ content, mimeType }: DelimitedPreviewProps) {
  const isTsv =
    mimeType === "text/tsv" || mimeType === "text/tab-separated-values";

  const delimiter = isTsv ? "\t" : ",";
  const lines = content.split("\n").filter((l) => l.trim());

  if (lines.length < 2) {
    return (
      <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
        No data to preview.
      </p>
    );
  }

  const [headerLine, ...dataLines] = lines;
  const headers = headerLine!
    .split(delimiter)
    .map((c) => c.trim().replace(/^"|"$/g, ""));
  const allRows = dataLines.map((line) =>
    line.split(delimiter).map((c) => c.trim().replace(/^"|"$/g, ""))
  );
  const displayed = allRows.slice(0, MAX_CSV_ROWS);

  const baseRatio = Math.floor(100 / headers.length);
  const columns: ColumnDef<Row>[] = headers.map((header, idx) => ({
    id: header,
    accessorFn: (row: Row) => row[header] ?? "",
    header,
    cell: (info: CellContext<Row, unknown>) => (
      <DataTable.BasicCellContent label={String(info.getValue() ?? "")} />
    ),
    meta: {
      // Last column absorbs rounding remainder so ratios always sum to 100.
      sizeRatio:
        idx < headers.length - 1
          ? baseRatio
          : 100 - baseRatio * (headers.length - 1),
    },
  }));

  const data: Row[] = displayed.map((row) =>
    Object.fromEntries(headers.map((h, i) => [h, row[i] ?? ""]))
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScrollableDataTable data={data} columns={columns} maxHeight={true} />
    </div>
  );
}

interface AudioPreviewProps {
  fileUrl: string;
  fileId: string | null;
  owner?: LightWorkspaceType;
}

function AudioPreview({ fileUrl, fileId, owner }: AudioPreviewProps) {
  const transcriptUrl =
    fileId && owner ? getFileProcessedUrl(owner, fileId) : null;
  const { fileContent: transcript } = useFileContentByUrl({
    url: transcriptUrl,
    disabled: !transcriptUrl,
  });

  return (
    <div className="flex flex-col gap-4">
      <audio controls className="w-full" src={fileUrl}>
        Your browser does not support the audio element.
      </audio>
      {transcript ? (
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-semibold text-muted-foreground dark:text-muted-foreground-night">
            Transcript
          </h4>
          <Markdown content={transcript} isStreaming={false} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          No transcript available.
        </p>
      )}
    </div>
  );
}

interface UseFilePreviewContentParams {
  entry: FileEntry | null;
  fileUrl: string | null;
  // Visibility flag: the text content fetch is skipped while the preview is
  // hidden (closed dialog, no file selected in the panel).
  enabled: boolean;
}

interface FilePreviewContentData {
  category: FilePreviewCategory;
  mimeType: string;
  truncatedContent: string | null;
  processedContent: ProcessedContent | null;
  recordCounts: { displayed: number; total: number } | null;
  hasError: boolean;
  isContentLoading: boolean;
}

/**
 * Shared data-fetching/processing for file previews, used by both the
 * FilePreviewDialog (modal) and the FilePreviewPanel (conversation side panel).
 * It fetches text content when the file category requires it and derives the
 * processed/markdown/record-count views.
 */
export function useFilePreviewContent({
  entry,
  fileUrl,
  enabled,
}: UseFilePreviewContentParams): FilePreviewContentData {
  const mimeType = stripMimeParameters(entry?.contentType ?? "");
  const { category } = getFilePreviewConfig(mimeType);

  const needsTextContent =
    category === "code" ||
    category === "text" ||
    category === "markdown" ||
    category === "delimited";

  const { fileContent, isNotFound, isFileContentLoading, fileContentError } =
    useFileContentByUrl({
      url: fileUrl,
      disabled: !enabled || !entry || !needsTextContent,
    });

  const hasError = needsTextContent && (!!fileContentError || isNotFound);
  const isContentLoading =
    enabled && !!entry && !hasError && needsTextContent && isFileContentLoading;

  const truncatedContent = fileContent?.slice(0, MAX_TEXT_CHARS) ?? null;

  const processedContent =
    category === "markdown" && truncatedContent
      ? processFileContent(truncatedContent, mimeType)
      : null;

  const recordCounts =
    category === "delimited" && truncatedContent
      ? getDelimitedRecordCount({ content: truncatedContent })
      : null;

  return {
    category,
    mimeType,
    truncatedContent,
    processedContent,
    recordCounts,
    hasError,
    isContentLoading,
  };
}

interface FilePreviewContentProps {
  category: FilePreviewCategory;
  entry: FileEntry;
  fileContent: string | null;
  fileUrl: string;
  isContentLoading: boolean;
  // Render PDF/viewer previews at container width (used by the narrow side
  // panel so slides/PDFs fill the available space).
  isFullWidth?: boolean;
  markdownCanEdit?: boolean;
  markdownContent?: string;
  markdownViewMode?: MarkdownFilePreviewViewMode;
  onMarkdownContentChange?: (content: string) => void;
  onMarkdownViewModeChange?: (mode: MarkdownFilePreviewViewMode) => void;
  owner?: LightWorkspaceType;
  processedContent: ProcessedContent | null;
}

export function FilePreviewContent({
  category,
  entry,
  fileContent,
  fileUrl,
  isContentLoading,
  isFullWidth = false,
  markdownCanEdit,
  markdownContent,
  markdownViewMode,
  onMarkdownContentChange,
  onMarkdownViewModeChange,
  owner,
  processedContent,
}: FilePreviewContentProps) {
  if (isContentLoading) {
    return (
      <div
        className={cn(
          "flex items-center justify-center",
          category === "markdown" ? "min-h-0 flex-1" : "h-48"
        )}
      >
        <Spinner />
      </div>
    );
  }

  switch (category) {
    case "frame":
      return null;

    case "image":
      return (
        <img
          src={entry.thumbnailUrl ?? fileUrl}
          alt={entry.fileName}
          className="w-full rounded-lg object-contain"
        />
      );

    case "pdf": {
      const sep = fileUrl.includes("?") ? "&" : "?";
      const pdfUrl = entry.lastModifiedMs
        ? `${fileUrl}${sep}v=${entry.lastModifiedMs}`
        : fileUrl;
      return (
        <Suspense fallback={<Spinner />}>
          <PDFViewer key={fileUrl} url={pdfUrl} isFullWidth={isFullWidth} />
        </Suspense>
      );
    }

    case "viewer": {
      const sep = fileUrl.includes("?") ? "&" : "?";
      const viewerUrl = entry.lastModifiedMs
        ? `${fileUrl}${sep}preview=pdf&v=${entry.lastModifiedMs}`
        : `${fileUrl}${sep}preview=pdf`;
      return (
        <Suspense fallback={<Spinner />}>
          <PDFViewer key={fileUrl} url={viewerUrl} isFullWidth={isFullWidth} />
        </Suspense>
      );
    }

    case "audio":
      return (
        <AudioPreview fileUrl={fileUrl} fileId={entry.fileId} owner={owner} />
      );

    case "delimited":
      if (fileContent) {
        return (
          <DelimitedPreview
            content={fileContent.slice(0, MAX_TEXT_CHARS)}
            mimeType={stripMimeParameters(entry.contentType)}
          />
        );
      }
      return null;

    case "markdown":
      if (
        processedContent &&
        markdownContent !== undefined &&
        markdownViewMode
      ) {
        return (
          <MarkdownFilePreview
            content={markdownContent}
            canEdit={markdownCanEdit}
            showToolbar={false}
            viewMode={markdownViewMode}
            onContentChange={onMarkdownContentChange}
            onViewModeChange={onMarkdownViewModeChange}
          />
        );
      }
      return null;

    case "code":
    case "text": {
      const lang = getCodeLanguage(entry.fileName);
      const raw = fileContent?.slice(0, MAX_TEXT_CHARS) ?? "";
      let displayContent = raw;
      if (lang === "json") {
        try {
          displayContent = JSON.stringify(JSON.parse(raw), null, 2);
        } catch {
          // keep raw if not valid JSON
        }
      }
      return (
        <div className="rounded-lg bg-muted-background dark:bg-muted-background-night">
          <CodeBlock className={`language-${lang}`} wrapLongLines={true}>
            {displayContent}
          </CodeBlock>
        </div>
      );
    }

    case "unsupported":
      return null;

    default:
      assertNeverAndIgnore(category);
      return null;
  }
}
