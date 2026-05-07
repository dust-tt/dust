import {
  type FilePreviewCategory,
  getFilePreviewConfig,
} from "@app/components/spaces/FilePreviewSheet";
import {
  type ProcessedContent,
  processFileContent,
} from "@app/lib/file_content_utils";
import { getFileTypeIcon } from "@app/lib/file_icon_utils";
import { stripMimeParameters } from "@app/types/files";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import {
  ArrowDownOnSquareIcon,
  Button,
  ChevronLeftIcon,
  ChevronRightIcon,
  CodeBlock,
  cn,
  DataTable,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
  Markdown,
  ScrollableDataTable,
  Spinner,
} from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { useEffect, useState } from "react";

const MAX_CSV_ROWS = 200;
const MAX_TEXT_CHARS = 100_000;
const TEXT_CONTENT_PREVIEW_CATEGORIES: FilePreviewCategory[] = [
  "code",
  "markdown",
  "text",
  "delimited",
];

export interface FilePreviewDialogFile {
  content: string | null;
  contentError: Error | null;
  isContentLoading: boolean;
  contentType: string;
  fileName: string;
  thumbnailUrl?: string | null;
  viewUrl: string;
}

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

export function needsFilePreviewTextContent(contentType: string): boolean {
  const { category } = getFilePreviewConfig(stripMimeParameters(contentType));

  return TEXT_CONTENT_PREVIEW_CATEGORIES.includes(category);
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

interface FilePreviewDialogContentProps {
  category: FilePreviewCategory;
  file: FilePreviewDialogFile;
  isContentLoading: boolean;
  processedContent: ProcessedContent | null;
}

function FilePreviewDialogContent({
  category,
  file,
  isContentLoading,
  processedContent,
}: FilePreviewDialogContentProps) {
  if (isContentLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
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
          src={file.thumbnailUrl ?? file.viewUrl}
          alt={file.fileName}
          className="w-full rounded-lg object-contain"
        />
      );

    case "pdf":
      return (
        <iframe
          src={`${file.viewUrl}#navpanes=0`}
          className="h-[70vh] w-full rounded-lg border-0"
          title={file.fileName}
        />
      );

    case "viewer":
      // TODO(20260504 FILE_SYSTEM): add Office viewer preview support.
      return (
        <div className="flex h-48 items-center justify-center">
          <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            Cannot preview this file type. You can download it instead.
          </p>
        </div>
      );

    case "audio":
      return (
        <div className="flex flex-col gap-4">
          <audio controls className="w-full" src={file.viewUrl}>
            Your browser does not support the audio element.
          </audio>
        </div>
      );

    case "delimited":
      if (file.content) {
        return (
          <DelimitedPreview
            content={file.content.slice(0, MAX_TEXT_CHARS)}
            mimeType={stripMimeParameters(file.contentType)}
          />
        );
      }
      return null;

    case "markdown":
    case "text":
      if (processedContent) {
        return (
          <div className="rounded-lg bg-muted-background p-4 dark:bg-muted-background-night">
            <Markdown content={processedContent.text} isStreaming={false} />
          </div>
        );
      }
      return null;

    case "code": {
      const lang = getCodeLanguage(file.fileName);
      const raw = file.content?.slice(0, MAX_TEXT_CHARS) ?? "";
      let displayContent = raw;
      if (lang === "json") {
        try {
          displayContent = JSON.stringify(JSON.parse(raw), null, 2);
        } catch {
          // Keep raw content if the JSON is invalid.
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

    default:
      assertNeverAndIgnore(category);
      return null;
  }
}

interface FilePreviewDialogProps {
  file: FilePreviewDialogFile | null;
  isOpen: boolean;
  onDownload: (file: FilePreviewDialogFile) => Promise<void> | void;
  onNext?: () => void;
  onOpenChange: (open: boolean) => void;
  onPrev?: () => void;
}

export function FilePreviewDialog({
  file,
  isOpen,
  onOpenChange,
  onDownload,
  onPrev,
  onNext,
}: FilePreviewDialogProps) {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    if (!file) {
      return;
    }
    setIsDownloading(true);
    try {
      await onDownload(file);
    } finally {
      setIsDownloading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable
      ) {
        return;
      }
      if (e.key === "ArrowLeft" && onPrev) {
        e.preventDefault();
        onPrev();
      } else if (e.key === "ArrowRight" && onNext) {
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onPrev, onNext]);

  const mimeType = stripMimeParameters(file?.contentType ?? "");
  const { category } = getFilePreviewConfig(mimeType);

  const hasError =
    TEXT_CONTENT_PREVIEW_CATEGORIES.includes(category) && !!file?.contentError;
  const isContentLoading =
    isOpen && !!file && !hasError && file.isContentLoading;

  const truncatedContent = file?.content?.slice(0, MAX_TEXT_CHARS) ?? null;

  const processedContent =
    (category === "markdown" || category === "text") && truncatedContent
      ? processFileContent(truncatedContent, mimeType)
      : null;

  const FileIcon = file
    ? getFileTypeIcon(file.contentType, file.fileName)
    : null;

  const recordCounts =
    category === "delimited" && truncatedContent
      ? getDelimitedRecordCount({ content: truncatedContent })
      : null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent size="2xl" height="2xl" className="gap-4 px-4">
        <DialogHeader className="flex gap-4">
          <DialogTitle>Preview Data</DialogTitle>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 overflow-hidden">
              {FileIcon && (
                <Icon
                  visual={FileIcon}
                  size="xs"
                  className="shrink-0 text-foreground dark:text-foreground-night"
                />
              )}
              <span
                className={cn(
                  "line-clamp-1 text-sm leading-5",
                  "text-foreground dark:text-foreground-night"
                )}
              >
                {file?.fileName ?? ""}
              </span>
            </div>
            {recordCounts && (
              <span
                className={cn(
                  "line-clamp-1 shrink-0 text-xs font-normal leading-4",
                  "text-muted-foreground dark:text-muted-foreground-night"
                )}
              >
                Showing {recordCounts.displayed} of {recordCounts.total} records
                {recordCounts.total > MAX_CSV_ROWS && " (truncated)"}
              </span>
            )}
          </div>
        </DialogHeader>
        {hasError ? (
          <div className="flex h-48 items-center justify-center px-4">
            <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              Unable to preview this file. You can download it instead.
            </p>
          </div>
        ) : category === "delimited" ? (
          <div className="flex min-h-0 flex-1 flex-col px-4">
            {file && (
              <FilePreviewDialogContent
                category={category}
                file={file}
                isContentLoading={isContentLoading}
                processedContent={processedContent}
              />
            )}
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-4">
            {file && (
              <FilePreviewDialogContent
                category={category}
                file={file}
                isContentLoading={isContentLoading}
                processedContent={processedContent}
              />
            )}
          </div>
        )}
        <DialogFooter className="px-4">
          <div className="flex w-full items-center justify-between">
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                icon={ChevronLeftIcon}
                onClick={onPrev}
                disabled={!onPrev}
                tooltip="Previous"
              />
              <Button
                variant="outline"
                size="sm"
                icon={ChevronRightIcon}
                onClick={onNext}
                disabled={!onNext}
                tooltip="Next"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              icon={ArrowDownOnSquareIcon}
              label={isDownloading ? "Downloading..." : "Download"}
              onClick={handleDownload}
              disabled={!file || isDownloading}
            />
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
