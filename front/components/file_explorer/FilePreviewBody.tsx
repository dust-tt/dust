import type { FilePreviewContentData } from "@app/components/file_explorer/FilePreviewContent";
import { FilePreviewContent } from "@app/components/file_explorer/FilePreviewContent";
import type { MarkdownFilePreviewViewMode } from "@app/components/file_explorer/MarkdownFilePreview";
import type { FileEntry } from "@app/components/file_explorer/types";
import type { MarkdownFileEditor } from "@app/components/file_explorer/useMarkdownFileEditor";
import type { FilePreviewCategory } from "@app/types/file_preview";
import type { LightWorkspaceType } from "@app/types/user";

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
  entry: FileEntry | null;
  fileUrl: string | null;
  isFullWidth?: boolean;
  markdown: MarkdownFileEditor;
  onMarkdownViewModeChange?: (mode: MarkdownFilePreviewViewMode) => void;
  owner?: LightWorkspaceType;
  preview: FilePreviewContentData;
}

export function FilePreviewBody({
  entry,
  fileUrl,
  isFullWidth,
  markdown,
  onMarkdownViewModeChange,
  owner,
  preview,
}: FilePreviewBodyProps) {
  const {
    category,
    hasError,
    isContentLoading,
    processedContent,
    truncatedContent,
  } = preview;

  if (hasError) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">
          Unable to preview this file. You can download it instead.
        </p>
      </div>
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
      markdownViewMode={markdown.viewMode}
      onMarkdownContentChange={markdown.canEdit ? markdown.setDraft : undefined}
      onMarkdownViewModeChange={onMarkdownViewModeChange}
      owner={owner}
      processedContent={processedContent}
    />
  );
}
