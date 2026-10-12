import type { FilePreviewContentData } from "@app/components/file_explorer/FilePreviewContent";
import { FilePreviewContent } from "@app/components/file_explorer/FilePreviewContent";
import type { FilePreviewDownloadAction } from "@app/components/file_explorer/FilePreviewFallback";
import { FilePreviewFallback } from "@app/components/file_explorer/FilePreviewFallback";
import type { MarkdownFilePreviewViewMode } from "@app/components/file_explorer/MarkdownFilePreview";
import type { FileEntry } from "@app/components/file_explorer/types";
import type { MarkdownFileEditor } from "@app/components/file_explorer/useMarkdownFileEditor";
import { formatFileSize } from "@app/lib/i18n/format";
import type { FilePreviewCategory } from "@app/types/file_preview";
import type { LightWorkspaceType } from "@app/types/user";
import { useLingui } from "@lingui/react/macro";

export function filePreviewLayoutClassName(
  category: FilePreviewCategory
): string {
  switch (category) {
    case "markdown":
      return "flex flex-col overflow-hidden";
    case "delimited":
      return "flex flex-col";
    default:
      return "overflow-y-auto";
  }
}

interface FilePreviewBodyProps {
  download?: FilePreviewDownloadAction;
  entry: FileEntry | null;
  fileUrl: string | null;
  isFullWidth?: boolean;
  markdown: MarkdownFileEditor;
  /** Where the rich editor shows its comments button and live status, such as a header bar. */
  markdownHeaderControlsContainer?: HTMLElement | null;
  /** Where the rich editor shows its save or live status icon, such as next to the file name. */
  markdownStatusContainer?: HTMLElement | null;
  onMarkdownViewModeChange?: (mode: MarkdownFilePreviewViewMode) => void;
  owner?: LightWorkspaceType;
  preview: FilePreviewContentData;
}

export function FilePreviewBody({
  download,
  entry,
  fileUrl,
  isFullWidth,
  markdown,
  markdownHeaderControlsContainer,
  markdownStatusContainer,
  onMarkdownViewModeChange,
  owner,
  preview,
}: FilePreviewBodyProps) {
  const { t } = useLingui();
  const {
    category,
    hasError,
    isContentLoading,
    isTooLarge,
    processedContent,
    sizeBytes,
    truncatedContent,
  } = preview;

  if (isTooLarge) {
    const fileSize = formatFileSize(sizeBytes, { decimals: 1 });
    return (
      <FilePreviewFallback
        download={download}
        message={t`This file is too large to preview (${fileSize}).`}
      />
    );
  }

  // A refetch that fails must not unmount an open editor: the content it holds is still the file.
  if (hasError && !markdown.richEditor) {
    return (
      <FilePreviewFallback
        download={download}
        message={t`Unable to preview this file.`}
      />
    );
  }

  if (!entry || !fileUrl) {
    return null;
  }

  return (
    <FilePreviewContent
      category={category}
      entry={entry}
      fileContent={truncatedContent}
      fileUrl={fileUrl}
      isContentLoading={isContentLoading}
      isFullWidth={isFullWidth}
      markdownCanEdit={markdown.canEdit}
      markdownContent={markdown.content}
      markdownHeaderControlsContainer={markdownHeaderControlsContainer}
      markdownStatusContainer={markdownStatusContainer}
      markdownRichEditor={markdown.richEditor}
      markdownViewMode={markdown.viewMode}
      onMarkdownContentChange={markdown.canEdit ? markdown.setDraft : undefined}
      onMarkdownViewModeChange={onMarkdownViewModeChange}
      owner={owner}
      processedContent={processedContent}
    />
  );
}
