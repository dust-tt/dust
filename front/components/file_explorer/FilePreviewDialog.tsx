import {
  MarkdownFilePreview,
  type MarkdownFilePreviewViewMode,
  MarkdownFilePreviewViewModeSwitch,
} from "@app/components/file_explorer/MarkdownFilePreview";
import { PDFViewer } from "@app/components/file_explorer/PDFViewer";
import type { FileEntry } from "@app/components/file_explorer/types";
import { getFilePreviewConfig } from "@app/components/file_explorer/utils";
import { useSendNotification } from "@app/hooks/useNotification";
import { parseCanonicalScopedPath } from "@app/lib/api/files/mount_path";
import type { ProcessedContent } from "@app/lib/file_content_utils";
import { processFileContent } from "@app/lib/file_content_utils";
import { getFileTypeIcon } from "@app/lib/file_icon_utils";
import {
  useFileContentByUrl,
  writeFileContentByPath,
} from "@app/lib/swr/files";
import { stripMimeParameters } from "@app/types/files";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  ChevronLeft,
  ChevronRight,
  CodeBlock,
  cn,
  DataTable,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Download01,
  Icon,
  Markdown,
  ScrollableDataTable,
  Spinner,
} from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { useEffect, useRef, useState } from "react";
import { useSWRConfig } from "swr";

const MAX_CSV_ROWS = 200;
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
}

function AudioPreview({ fileUrl, fileId }: AudioPreviewProps) {
  const transcriptUrl = fileId ? `${fileUrl}&version=processed` : null;
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

interface FilePreviewDialogContentProps {
  category: ReturnType<typeof getFilePreviewConfig>["category"];
  entry: FileEntry;
  fileContent: string | null;
  fileUrl: string;
  isContentLoading: boolean;
  markdownCanEdit?: boolean;
  markdownContent?: string;
  markdownViewMode?: MarkdownFilePreviewViewMode;
  onMarkdownContentChange?: (content: string) => void;
  onMarkdownViewModeChange?: (mode: MarkdownFilePreviewViewMode) => void;
  processedContent: ProcessedContent | null;
}

function FilePreviewDialogContent({
  category,
  entry,
  fileContent,
  fileUrl,
  isContentLoading,
  markdownCanEdit,
  markdownContent,
  markdownViewMode,
  onMarkdownContentChange,
  onMarkdownViewModeChange,
  processedContent,
}: FilePreviewDialogContentProps) {
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
      return <PDFViewer key={fileUrl} url={pdfUrl} />;
    }

    case "viewer": {
      const sep = fileUrl.includes("?") ? "&" : "?";
      const viewerUrl = entry.lastModifiedMs
        ? `${fileUrl}${sep}preview=pdf&v=${entry.lastModifiedMs}`
        : `${fileUrl}${sep}preview=pdf`;
      return <PDFViewer key={fileUrl} url={viewerUrl} />;
    }

    case "audio":
      return <AudioPreview fileUrl={fileUrl} fileId={entry.fileId} />;

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

    case "text":
      if (processedContent) {
        return (
          <div className="rounded-lg bg-muted-background p-4 dark:bg-muted-background-night">
            <Markdown content={processedContent.text} isStreaming={false} />
          </div>
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

    case "code": {
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

    default:
      assertNeverAndIgnore(category);
      return null;
  }
}

interface FilePreviewDialogProps {
  entry: FileEntry | null;
  fileUrl: string | null;
  isOpen: boolean;
  owner?: LightWorkspaceType;
  onDownload: (entry: FileEntry) => Promise<void>;
  onNext?: () => void;
  onOpenChange: (open: boolean) => void;
  onPrev?: () => void;
}

export function FilePreviewDialog({
  entry,
  fileUrl,
  isOpen,
  onOpenChange,
  onDownload,
  onPrev,
  onNext,
  owner,
}: FilePreviewDialogProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [markdownViewMode, setMarkdownViewMode] =
    useState<MarkdownFilePreviewViewMode>("preview");
  const [markdownDraft, setMarkdownDraft] = useState("");
  const [markdownSavedContent, setMarkdownSavedContent] = useState("");
  const [markdownSourcePath, setMarkdownSourcePath] = useState<string | null>(
    null
  );
  const [isMarkdownSaving, setIsMarkdownSaving] = useState(false);
  const [markdownDialogKey, setMarkdownDialogKey] = useState({
    isOpen,
    path: entry?.path,
  });
  const markdownInitKeyRef = useRef<string | null>(null);

  const sendNotification = useSendNotification();
  const { mutate } = useSWRConfig();

  const handleDownload = async () => {
    if (!entry) {
      return;
    }
    setIsDownloading(true);
    try {
      await onDownload(entry);
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

  const mimeType = stripMimeParameters(entry?.contentType ?? "");
  const { category } = getFilePreviewConfig(mimeType);

  const needsTextContent =
    category === "code" ||
    category === "markdown" ||
    category === "text" ||
    category === "delimited";

  const { fileContent, isNotFound, isFileContentLoading, fileContentError } =
    useFileContentByUrl({
      url: fileUrl,
      disabled: !isOpen || !entry || !needsTextContent,
    });

  const hasError = needsTextContent && (!!fileContentError || isNotFound);
  const isContentLoading =
    isOpen && !!entry && !hasError && needsTextContent && isFileContentLoading;

  const truncatedContent = fileContent?.slice(0, MAX_TEXT_CHARS) ?? null;

  const processedContent =
    (category === "markdown" || category === "text") && truncatedContent
      ? processFileContent(truncatedContent, mimeType)
      : null;

  const FileIcon = entry
    ? getFileTypeIcon(entry.contentType, entry.fileName)
    : null;

  const recordCounts =
    category === "delimited" && truncatedContent
      ? getDelimitedRecordCount({ content: truncatedContent })
      : null;

  const editableMarkdownFilePath =
    entry && owner && parseCanonicalScopedPath(entry.path) ? entry.path : null;
  const canEditMarkdown = category === "markdown" && !!editableMarkdownFilePath;

  if (
    isOpen !== markdownDialogKey.isOpen ||
    entry?.path !== markdownDialogKey.path
  ) {
    setMarkdownDialogKey({ isOpen, path: entry?.path });
    setMarkdownViewMode("preview");
    setMarkdownSourcePath(null);
    setMarkdownDraft("");
    setMarkdownSavedContent("");
    markdownInitKeyRef.current = null;
  }

  const isMarkdownDirty = markdownDraft !== markdownSavedContent;

  useEffect(() => {
    if (
      !isOpen ||
      !canEditMarkdown ||
      !entry?.path ||
      isContentLoading ||
      !processedContent
    ) {
      return;
    }

    const initKey = `${entry.path}:${processedContent.text}`;
    if (markdownInitKeyRef.current === initKey) {
      return;
    }

    const hadInitializedForPath = markdownInitKeyRef.current?.startsWith(
      `${entry.path}:`
    );
    if (hadInitializedForPath && isMarkdownDirty) {
      return;
    }

    setMarkdownSourcePath(entry.path);
    setMarkdownDraft(processedContent.text);
    setMarkdownSavedContent(processedContent.text);
    markdownInitKeyRef.current = initKey;
  }, [
    canEditMarkdown,
    entry?.path,
    isContentLoading,
    isMarkdownDirty,
    isOpen,
    processedContent?.text,
    processedContent,
  ]);

  const handleMarkdownSave = async () => {
    if (
      !owner ||
      !editableMarkdownFilePath ||
      !isMarkdownDirty ||
      isMarkdownSaving
    ) {
      return;
    }

    setIsMarkdownSaving(true);
    try {
      await writeFileContentByPath({
        owner,
        canonicalPath: editableMarkdownFilePath,
        content: markdownDraft,
        contentType: "text/markdown",
      });
      await mutate(
        fileUrl,
        { kind: "loaded", content: markdownDraft },
        { revalidate: false }
      );
      setMarkdownSavedContent(markdownDraft);
      if (entry?.path) {
        markdownInitKeyRef.current = `${entry.path}:${markdownDraft}`;
      }
      sendNotification({ type: "success", title: "File saved" });
    } catch (e) {
      sendNotification({
        type: "error",
        title: "Failed to save file",
        description: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      setIsMarkdownSaving(false);
    }
  };

  const handleMarkdownRevert = () => {
    setMarkdownDraft(markdownSavedContent);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent size="2xl" height="2xl" className="gap-4 px-4">
        <DialogHeader className="flex gap-4">
          <DialogTitle>
            <div className="flex items-center gap-1.5 overflow-hidden">
              {FileIcon && (
                <Icon
                  visual={FileIcon}
                  size="sm"
                  className="shrink-0 text-foreground dark:text-foreground-night"
                />
              )}
              <span
                className={cn(
                  "line-clamp-1 leading-5",
                  "text-foreground dark:text-foreground-night"
                )}
              >
                {entry?.fileName ?? "Preview Data"}
              </span>
            </div>
          </DialogTitle>
          <div className="flex items-center justify-between">
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
        {canEditMarkdown && (
          <div className="flex shrink-0 justify-end px-4">
            <MarkdownFilePreviewViewModeSwitch
              key={`${entry?.path ?? "none"}:${isOpen}`}
              viewMode={markdownViewMode}
              onViewModeChange={setMarkdownViewMode}
            />
          </div>
        )}
        {hasError ? (
          <div className="flex h-48 items-center justify-center px-4">
            <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              Unable to preview this file. You can download it instead.
            </p>
          </div>
        ) : category === "delimited" ? (
          <div className="flex min-h-0 flex-1 flex-col px-4">
            {entry && (
              <FilePreviewDialogContent
                category={category}
                entry={entry}
                fileContent={truncatedContent}
                fileUrl={fileUrl ?? ""}
                isContentLoading={isContentLoading}
                markdownCanEdit={canEditMarkdown}
                markdownContent={
                  canEditMarkdown
                    ? markdownSourcePath === entry.path
                      ? markdownDraft
                      : processedContent?.text
                    : processedContent?.text
                }
                markdownViewMode={
                  canEditMarkdown ? markdownViewMode : "preview"
                }
                onMarkdownContentChange={
                  canEditMarkdown ? setMarkdownDraft : undefined
                }
                onMarkdownViewModeChange={
                  canEditMarkdown ? setMarkdownViewMode : undefined
                }
                processedContent={processedContent}
              />
            )}
          </div>
        ) : (
          <div
            className={cn(
              "min-h-0 flex-1 px-4",
              category === "markdown"
                ? "flex flex-col overflow-hidden"
                : "overflow-y-auto"
            )}
          >
            {entry && (
              <FilePreviewDialogContent
                category={category}
                entry={entry}
                fileContent={truncatedContent}
                fileUrl={fileUrl ?? ""}
                isContentLoading={isContentLoading}
                markdownCanEdit={canEditMarkdown}
                markdownContent={
                  canEditMarkdown
                    ? markdownSourcePath === entry.path
                      ? markdownDraft
                      : processedContent?.text
                    : processedContent?.text
                }
                markdownViewMode={
                  canEditMarkdown ? markdownViewMode : "preview"
                }
                onMarkdownContentChange={
                  canEditMarkdown ? setMarkdownDraft : undefined
                }
                onMarkdownViewModeChange={
                  canEditMarkdown ? setMarkdownViewMode : undefined
                }
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
                icon={ChevronLeft}
                onClick={onPrev}
                disabled={!onPrev}
                tooltip="Previous"
              />
              <Button
                variant="outline"
                size="sm"
                icon={ChevronRight}
                onClick={onNext}
                disabled={!onNext}
                tooltip="Next"
              />
            </div>
            {canEditMarkdown ? (
              <div className="flex items-center gap-2">
                <Button
                  label="Save"
                  variant="highlight"
                  size="sm"
                  isLoading={isMarkdownSaving}
                  disabled={!isMarkdownDirty || isMarkdownSaving}
                  onClick={() => void handleMarkdownSave()}
                />
                <Button
                  label="Revert"
                  variant="outline"
                  size="sm"
                  disabled={!isMarkdownDirty || isMarkdownSaving}
                  onClick={handleMarkdownRevert}
                />
                <Button
                  variant="outline"
                  size="sm"
                  icon={Download01}
                  label={isDownloading ? "Downloading…" : "Download"}
                  onClick={handleDownload}
                  disabled={!entry || isDownloading || isMarkdownDirty}
                />
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                icon={Download01}
                label={isDownloading ? "Downloading…" : "Download"}
                onClick={handleDownload}
                disabled={!entry || isDownloading}
              />
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
