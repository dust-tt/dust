import { Document } from "@app/components/editor/document";
import { MentionExtension } from "@app/components/editor/extensions/MentionExtension";
import { createMentionSuggestion } from "@app/components/editor/input_bar/mentionSuggestion";
import { CoEditionBadge } from "@app/components/file_explorer/CoEditionBadge";
import { CommentAuthorAvatar } from "@app/components/file_explorer/CommentAuthorAvatar";
import { CommentBodyMarkdown } from "@app/components/file_explorer/CommentBodyMarkdown";
import { DocumentFrameEmbed } from "@app/components/file_explorer/DocumentFrameEmbed";
import { LiveParticipantsAvatars } from "@app/components/file_explorer/LiveParticipantsAvatars";
import type { MarkdownFilePreviewViewMode } from "@app/components/file_explorer/MarkdownFilePreview";
import { MarkdownFilePreview } from "@app/components/file_explorer/MarkdownFilePreview";
import { PDFViewer } from "@app/components/file_explorer/PDFViewer";
import type { FileEntry } from "@app/components/file_explorer/types";
import { useDocumentEmbeddableFiles } from "@app/components/file_explorer/useDocumentEmbeddableFiles";
import type { MarkdownRichEditor } from "@app/components/file_explorer/useMarkdownFileEditor";
import { FilePreviewBlock } from "@app/components/markdown/FilePreviewBlock";
import { useResolveMarkdownImageUrl } from "@app/components/markdown/MarkdownImage";
import {
  useDfmMessageVerifier,
  useSignDfmCommentMessage,
} from "@app/hooks/useDfmCommentSignatures";
import { useLiveTicket } from "@app/hooks/useLiveTicket";
import { AuthContext } from "@app/lib/auth/AuthContext";
import { liveCaretColor } from "@app/lib/client/live_session";
import type { ProcessedContent } from "@app/lib/file_content_utils";
import { processFileContent } from "@app/lib/file_content_utils";
import { getFileProcessedUrl, useFileContentByUrl } from "@app/lib/swr/files";
import { toLiveDocumentName } from "@app/types/collab";
import type { FilePreviewCategory } from "@app/types/file_preview";
import { getFilePreviewConfig } from "@app/types/file_preview";
import { stripMimeParameters } from "@app/types/files";
import { parseCanonicalScopedPath } from "@app/types/mount_path";
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
import type { MessageDescriptor } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { parse } from "csv-parse/browser/esm/sync";
import { useContext, useMemo } from "react";

const MAX_CSV_ROWS = 200;
const MAX_TEXT_CHARS = 100_000;
export const MAX_PREVIEW_BYTES = 10 * 1024 * 1024;

export const CUT_TEXT_SAVE_REFUSED = {
  title: msg`File too long to save here`,
  description: msg`It grew too long to edit here. Copy your changes, then reopen the file.`,
};

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

// Rows are parsed leniently: the preview may be cut mid-record, so a broken
// record is dropped rather than failing the whole table.
function parseDelimitedRows({
  content,
  mimeType,
}: {
  content: string;
  mimeType: string;
}): string[][] {
  const isTsv =
    mimeType === "text/tsv" || mimeType === "text/tab-separated-values";

  return parse(content, {
    delimiter: isTsv ? "\t" : ",",
    relax_column_count: true,
    relax_quotes: true,
    skip_empty_lines: true,
    skip_records_with_error: true,
    trim: true,
  });
}

function getDelimitedRecordCount({
  content,
  mimeType,
}: {
  content: string;
  mimeType: string;
}): { displayed: number; total: number } | null {
  const rows = parseDelimitedRows({ content, mimeType });
  if (rows.length < 2) {
    return null;
  }

  const total = rows.length - 1;

  return { displayed: Math.min(total, MAX_CSV_ROWS), total };
}

interface DelimitedPreviewProps {
  content: string;
  mimeType: string;
}

interface Row {
  cells: string[];
  // Present only to satisfy the table's base row type, which requires a row
  // to share at least one of its optional props.
  onClick?: () => void;
}

/**
 * @cc [owner:avervaet,label:react] columns-keyed-by-position
 * Columns MUST be identified by their position, never by their header text: empty or repeated
 * header cells MUST render without throwing and each column MUST show its own values.
 */
function DelimitedPreview({ content, mimeType }: DelimitedPreviewProps) {
  const rows = parseDelimitedRows({ content, mimeType });

  if (rows.length < 2) {
    return (
      <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
        <Trans>No data to preview.</Trans>
      </p>
    );
  }

  const [headers, ...dataRows] = rows;
  const allRows: Row[] = dataRows.map((cells) => ({ cells }));
  const displayed = allRows.slice(0, MAX_CSV_ROWS);

  const baseRatio = Math.floor(100 / headers.length);
  const columns: ColumnDef<Row>[] = headers.map((header, idx) => ({
    id: `col_${idx}`,
    accessorFn: (row: Row) => row.cells[idx] ?? "",
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScrollableDataTable
        data={displayed}
        columns={columns}
        maxHeight={true}
      />
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
        <Trans>Your browser does not support the audio element.</Trans>
      </audio>
      {transcript ? (
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-semibold text-muted-foreground dark:text-muted-foreground-night">
            <Trans>Transcript</Trans>
          </h4>
          <Markdown content={transcript} isStreaming={false} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          <Trans>No transcript available.</Trans>
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

export function formatRecordCounts(
  {
    displayed,
    total,
  }: {
    displayed: number;
    total: number;
  },
  t: (descriptor: MessageDescriptor) => string
): string {
  return total > MAX_CSV_ROWS
    ? t(
        msg`Showing ${displayed} of ${plural(total, {
          one: "# record",
          other: "# records",
        })} (truncated)`
      )
    : t(
        msg`Showing ${displayed} of ${plural(total, {
          one: "# record",
          other: "# records",
        })}`
      );
}

export interface FilePreviewContentData {
  category: FilePreviewCategory;
  mimeType: string;
  truncatedContent: string | null;
  processedContent: ProcessedContent | null;
  recordCounts: { displayed: number; total: number } | null;
  hasError: boolean;
  isContentLoading: boolean;
  isTooLarge: boolean;
  /** The text was cut at MAX_TEXT_CHARS, so an editor fed with it would save a truncated file. */
  isTruncated: boolean;
  /** The mount accepts writes from this user, per the content route. */
  canWrite: boolean;
  sizeBytes: number;
}

/**
 * Shared data-fetching/processing for file previews, used by both the
 * FilePreviewDialog (modal) and the FilePreviewPanel (conversation side panel).
 * It fetches text content when the file category requires it and derives the
 * processed/markdown/record-count views.
 */
/**
 * @cc [owner:adrsimon,label:react] no-fetch-above-max-preview-bytes
 * When the entry is larger than `MAX_PREVIEW_BYTES`, the hook MUST NOT fetch the file content and
 * MUST report `isTooLarge`, so callers offer a download instead of rendering the file.
 */
export function useFilePreviewContent({
  entry,
  fileUrl,
  enabled,
}: UseFilePreviewContentParams): FilePreviewContentData {
  const mimeType = stripMimeParameters(entry?.contentType ?? "");
  const { category } = getFilePreviewConfig(mimeType);

  const sizeBytes = entry?.sizeBytes ?? 0;
  const isTooLarge = sizeBytes > MAX_PREVIEW_BYTES;

  const needsTextContent =
    category === "code" ||
    category === "text" ||
    category === "markdown" ||
    category === "delimited";

  const {
    fileContent,
    fileCanWrite,
    isNotFound,
    isFileContentLoading,
    fileContentError,
  } = useFileContentByUrl({
    url: fileUrl,
    disabled: !enabled || !entry || !needsTextContent || isTooLarge,
  });

  const hasError = needsTextContent && (!!fileContentError || isNotFound);
  const isContentLoading =
    enabled && !!entry && !hasError && needsTextContent && isFileContentLoading;

  const truncatedContent = fileContent?.slice(0, MAX_TEXT_CHARS) ?? null;
  const isTruncated = (fileContent?.length ?? 0) > MAX_TEXT_CHARS;

  const processedContent =
    category === "markdown" && truncatedContent
      ? processFileContent(truncatedContent, mimeType)
      : null;

  const recordCounts =
    category === "delimited" && truncatedContent
      ? getDelimitedRecordCount({ content: truncatedContent, mimeType })
      : null;

  return {
    category,
    mimeType,
    truncatedContent,
    processedContent,
    recordCounts,
    hasError,
    isContentLoading,
    isTooLarge,
    isTruncated,
    canWrite: fileCanWrite,
    sizeBytes,
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
  /** Where the rich editor shows its comments button and live status, such as a header bar. */
  markdownHeaderControlsContainer?: HTMLElement | null;
  /** Where the rich editor shows its save or live status icon, such as next to the file name. */
  markdownStatusContainer?: HTMLElement | null;
  /** Behind the co_edition flag: the rich editor replaces the preview and the raw editor. */
  markdownRichEditor?: MarkdownRichEditor | null;
  markdownViewMode?: MarkdownFilePreviewViewMode;
  onMarkdownContentChange?: (content: string) => void;
  onMarkdownViewModeChange?: (mode: MarkdownFilePreviewViewMode) => void;
  owner?: LightWorkspaceType;
  processedContent: ProcessedContent | null;
}

interface RichMarkdownDocumentProps {
  editor: MarkdownRichEditor;
  owner: LightWorkspaceType;
  headerControlsContainer?: HTMLElement | null;
  statusContainer?: HTMLElement | null;
}

function RichMarkdownDocument({
  editor,
  owner,
  headerControlsContainer,
  statusContainer,
}: RichMarkdownDocumentProps) {
  const user = useContext(AuthContext)?.user;
  const signCommentMessage = useSignDfmCommentMessage({
    owner,
    filePath: editor.path,
  });
  const verifyCommentMessage = useDfmMessageVerifier({
    owner,
    filePath: editor.path,
  });
  const commentInputExtensions = useMemo(() => {
    // Suggestions rank the conversation's participants, or the pod's members, first.
    const scope = parseCanonicalScopedPath(editor.path)?.scope;
    return [
      MentionExtension.configure({
        owner,
        suggestion: createMentionSuggestion({
          owner,
          conversationId:
            scope?.kind === "canonical-conversation" ? scope.id : null,
          spaceId: scope?.kind === "canonical-pod" ? scope.id : undefined,
          select: { agents: true, users: true },
        }),
      }),
    ];
  }, [owner, editor.path]);
  const embeddableFiles = useDocumentEmbeddableFiles({
    owner,
    documentPath: editor.path,
  });
  const resolveImageSource = useResolveMarkdownImageUrl(owner);

  const getLiveTicket = useLiveTicket({ owner, filePath: editor.path });
  const live =
    editor.liveUrl && user
      ? {
          url: editor.liveUrl,
          documentName: toLiveDocumentName(owner.sId, editor.path),
          getTicket: getLiveTicket,
          user: {
            id: user.sId,
            name: user.fullName,
            color: liveCaretColor(user.sId),
          },
        }
      : undefined;

  return (
    <Document
      initialContent={editor.initialContent}
      headerControlsContainer={headerControlsContainer}
      statusContainer={statusContainer}
      onSave={live ? undefined : editor.onSave}
      onStateChange={live ? undefined : editor.onStateChange}
      live={live}
      commentAuthor={
        user ? { kind: "user", id: user.sId, name: user.fullName } : undefined
      }
      signCommentMessage={signCommentMessage}
      verifyCommentMessage={verifyCommentMessage ?? undefined}
      renderCommentBody={(body) => (
        <CommentBodyMarkdown owner={owner} body={body} />
      )}
      commentInputExtensions={commentInputExtensions}
      resolveImageSource={resolveImageSource}
      renderFilePreview={(preview) => (
        <FilePreviewBlock
          path={preview.path}
          title={preview.title ?? undefined}
          contentType={preview.contentType ?? undefined}
        />
      )}
      renderFrame={(path) => <DocumentFrameEmbed owner={owner} path={path} />}
      embeddableFiles={embeddableFiles}
      renderCommentAuthorAvatar={(author, size) => (
        <CommentAuthorAvatar owner={owner} author={author} size={size} />
      )}
      badge={<CoEditionBadge />}
      renderLiveParticipants={(participants) => (
        <LiveParticipantsAvatars owner={owner} participants={participants} />
      )}
    />
  );
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
  markdownHeaderControlsContainer,
  markdownStatusContainer,
  markdownRichEditor,
  markdownViewMode,
  onMarkdownContentChange,
  onMarkdownViewModeChange,
  owner,
  processedContent,
}: FilePreviewContentProps) {
  const resolveImageUrl = useResolveMarkdownImageUrl(owner);

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
      return <PDFViewer key={fileUrl} url={pdfUrl} isFullWidth={isFullWidth} />;
    }

    case "viewer": {
      const sep = fileUrl.includes("?") ? "&" : "?";
      const viewerUrl = entry.lastModifiedMs
        ? `${fileUrl}${sep}preview=pdf&v=${entry.lastModifiedMs}`
        : `${fileUrl}${sep}preview=pdf`;
      return (
        <PDFViewer key={fileUrl} url={viewerUrl} isFullWidth={isFullWidth} />
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
      if (markdownRichEditor && owner) {
        return (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <RichMarkdownDocument
              key={markdownRichEditor.mountKey}
              editor={markdownRichEditor}
              owner={owner}
              headerControlsContainer={markdownHeaderControlsContainer}
              statusContainer={markdownStatusContainer}
            />
          </div>
        );
      }
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
            resolveImageUrl={resolveImageUrl}
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
