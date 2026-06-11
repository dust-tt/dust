import type { FileEntry } from "@app/components/file_explorer/types";
import {
  getTabularPreviewStats,
  TabularFilePreview,
} from "@app/components/file_explorer/TabularFilePreview";
import { getFilePreviewConfig } from "@app/components/spaces/FilePreviewSheet";
import { useFileContent } from "@app/hooks/useFileContent";
import type { ProcessedContent } from "@app/lib/file_content_utils";
import { processFileContent } from "@app/lib/file_content_utils";
import { getFileTypeIcon } from "@app/lib/file_icon_utils";
import { stripMimeParameters } from "@app/types/files";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import {
  Button,
  ChevronLeft,
  ChevronRight,
  CodeBlock,
  cn,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Download01,
  Icon,
  Markdown,
  Spinner,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

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

interface DelimitedPreviewProps {
  content: string;
  mimeType: string;
}

function DelimitedPreview({ content, mimeType }: DelimitedPreviewProps) {
  return <TabularFilePreview content={content} mimeType={mimeType} />;
}

interface FilePreviewDialogContentProps {
  category: ReturnType<typeof getFilePreviewConfig>["category"];
  entry: FileEntry;
  fileContent: string | null;
  fileUrl: string;
  isContentLoading: boolean;
  processedContent: ProcessedContent | null;
}

function FilePreviewDialogContent({
  category,
  entry,
  fileContent,
  fileUrl,
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
          src={entry.thumbnailUrl ?? fileUrl}
          alt={entry.fileName}
          className="w-full rounded-lg object-contain"
        />
      );

    case "pdf":
      return (
        <iframe
          src={`${fileUrl}#navpanes=0`}
          className="h-[70vh] w-full rounded-lg border-0"
          title={entry.fileName}
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
          <audio controls className="w-full" src={fileUrl}>
            Your browser does not support the audio element.
          </audio>
        </div>
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
  onDownload: (entry: FileEntry) => Promise<void>;
  onNext?: () => void;
  onOpenChange: (open: boolean) => void;
  onPrev?: () => void;
  processedFileUrl?: string | null;
}

export function FilePreviewDialog({
  entry,
  fileUrl,
  isOpen,
  onOpenChange,
  onDownload,
  onPrev,
  onNext,
  processedFileUrl,
}: FilePreviewDialogProps) {
  const [isDownloading, setIsDownloading] = useState(false);

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
  const previewConfig = getFilePreviewConfig(mimeType);
  const { category } = previewConfig;
  const contentUrl = previewConfig.needsProcessedVersion
    ? (processedFileUrl ?? null)
    : fileUrl;

  const needsTextContent =
    category === "code" ||
    category === "markdown" ||
    category === "text" ||
    category === "delimited";

  const { fileContent, isFileContentLoading, fileContentError } =
    useFileContent({
      url: contentUrl,
      disabled: !isOpen || !entry || !needsTextContent || !contentUrl,
    });

  const hasError =
    needsTextContent &&
    (!!fileContentError || (!contentUrl && !isFileContentLoading));
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
      ? getTabularPreviewStats({ content: truncatedContent, mimeType })
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
                {entry?.fileName ?? ""}
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
                {recordCounts.isTruncated && " (truncated)"}
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
            {entry && (
              <FilePreviewDialogContent
                category={category}
                entry={entry}
                fileContent={truncatedContent}
                fileUrl={fileUrl ?? ""}
                isContentLoading={isContentLoading}
                processedContent={processedContent}
              />
            )}
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-4">
            {entry && (
              <FilePreviewDialogContent
                category={category}
                entry={entry}
                fileContent={truncatedContent}
                fileUrl={fileUrl ?? ""}
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
            <Button
              variant="outline"
              size="sm"
              icon={Download01}
              label={isDownloading ? "Downloading…" : "Download"}
              onClick={handleDownload}
              disabled={!entry || isDownloading}
            />
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
