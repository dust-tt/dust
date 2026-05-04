import { getFilePreviewConfig } from "@app/components/spaces/FilePreviewSheet";
import { useConversationFileContent } from "@app/hooks/conversations/useConversationFileContent";
import config from "@app/lib/api/config";
import { parseScopedFilePath } from "@app/lib/api/files/mount_path";
import type { ProcessedContent } from "@app/lib/file_content_utils";
import { processFileContent } from "@app/lib/file_content_utils";
import { getFileTypeIcon } from "@app/lib/file_icon_utils";
import type { GCSMountFileEntry } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/files";
import { stripMimeParameters } from "@app/types/files";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";
import {
  ArrowDownOnSquareIcon,
  Button,
  CodeBlock,
  DataTable,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
  Markdown,
  ScrollArea,
  ScrollBar,
  ScrollableDataTable,
  Spinner,
  cn,
} from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";

const MAX_CSV_ROWS = 200;
const MAX_TEXT_CHARS = 100_000;

function getConversationFileUrl(
  owner: LightWorkspaceType,
  conversationId: string,
  filePath: string
): string {
  // entry.path is scoped (e.g. "conversation/notes.txt") but [...rel].ts
  // expects the path relative to the conversation's /files/ base, so strip the scope prefix.
  // Use an absolute URL so iframe/audio src attributes resolve against the API origin, not the
  // browser's current origin.
  const scoped = parseScopedFilePath(filePath);
  const rel = scoped ? scoped.rel : filePath;

  return `${config.getClientFacingUrl()}/api/w/${owner.sId}/assistant/conversations/${conversationId}/files/${rel}`;
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns: ColumnDef<any>[] = headers.map((header, idx) => ({
    id: header,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    accessorFn: (row: any) => row[header] ?? "",
    header,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cell: (info: any) => (
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any[] = displayed.map((row) =>
    Object.fromEntries(headers.map((h, i) => [h, row[i] ?? ""]))
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScrollableDataTable data={data} columns={columns} maxHeight={true} />
    </div>
  );
}

interface FilePreviewDialogContentProps {
  category: ReturnType<typeof getFilePreviewConfig>["category"];
  conversationId: string;
  entry: GCSMountFileEntry;
  fileContent: string | null;
  isContentLoading: boolean;
  owner: LightWorkspaceType;
  processedContent: ProcessedContent | null;
}

function FilePreviewDialogContent({
  category,
  conversationId,
  entry,
  fileContent,
  isContentLoading,
  owner,
  processedContent,
}: FilePreviewDialogContentProps) {
  const fileUrl = getConversationFileUrl(owner, conversationId, entry.path);

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
  conversationId: string;
  entry: GCSMountFileEntry | null;
  isOpen: boolean;
  onDownload: (entry: GCSMountFileEntry) => void;
  onOpenChange: (open: boolean) => void;
  owner: LightWorkspaceType;
}

export function FilePreviewDialog({
  entry,
  conversationId,
  isOpen,
  onOpenChange,
  owner,
  onDownload,
}: FilePreviewDialogProps) {
  const mimeType = stripMimeParameters(entry?.contentType ?? "");
  const { category } = getFilePreviewConfig(mimeType);

  const needsTextContent =
    category === "code" ||
    category === "markdown" ||
    category === "text" ||
    category === "delimited";

  const { fileContent, isFileContentLoading, fileContentError } =
    useConversationFileContent({
      owner,
      conversationId,
      filePath: entry?.path ?? null,
      disabled: !isOpen || !entry || !needsTextContent,
    });

  const hasError = needsTextContent && !!fileContentError;
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

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent size="xl" height="xl" className="gap-4">
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
                  "line-clamp-1 text-sm font-medium leading-5",
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
            {entry && (
              <FilePreviewDialogContent
                category={category}
                conversationId={conversationId}
                entry={entry}
                fileContent={truncatedContent}
                isContentLoading={isContentLoading}
                owner={owner}
                processedContent={processedContent}
              />
            )}
          </div>
        ) : (
          <ScrollArea className="min-h-0 flex-1 overflow-x-hidden px-4">
            {entry && (
              <FilePreviewDialogContent
                category={category}
                conversationId={conversationId}
                entry={entry}
                fileContent={truncatedContent}
                isContentLoading={isContentLoading}
                owner={owner}
                processedContent={processedContent}
              />
            )}
            <ScrollBar />
          </ScrollArea>
        )}
        <DialogFooter className="px-4">
          <Button
            variant="outline"
            size="sm"
            icon={ArrowDownOnSquareIcon}
            label="Download"
            onClick={() => entry && onDownload(entry)}
            disabled={!entry}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
