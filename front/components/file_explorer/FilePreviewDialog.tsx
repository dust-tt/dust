import { hasOpenDocumentLayer } from "@app/components/editor/document";
import {
  FilePreviewBody,
  filePreviewLayoutClassName,
} from "@app/components/file_explorer/FilePreviewBody";
import {
  formatRecordCounts,
  useFilePreviewContent,
} from "@app/components/file_explorer/FilePreviewContent";
import { MarkdownFilePreviewViewModeSwitch } from "@app/components/file_explorer/MarkdownFilePreview";
import type { FileEntry } from "@app/components/file_explorer/types";
import { useMarkdownFileEditor } from "@app/components/file_explorer/useMarkdownFileEditor";
import { getFileTypeIcon } from "@app/lib/file_icon_utils";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  ChevronLeft,
  ChevronRight,
  cn,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Download01,
  Icon,
  XClose,
} from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";

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

/**
 * @cc [owner:tdraier,label:react] file-preview-dialog-escape
 * Escape MUST close the dialog, except an Escape from the document or its header controls while
 * a document layer is open (`hasOpenDocumentLayer`), which the document closes first.
 */
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
  const { t } = useLingui();
  const [isDownloading, setIsDownloading] = useState(false);
  const [documentControls, setDocumentControls] =
    useState<HTMLDivElement | null>(null);
  const [documentArea, setDocumentArea] = useState<HTMLDivElement | null>(null);

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

  const preview = useFilePreviewContent({ entry, fileUrl, enabled: isOpen });
  const { category, recordCounts } = preview;

  const FileIcon = entry
    ? getFileTypeIcon(entry.contentType, entry.fileName)
    : null;

  const markdown = useMarkdownFileEditor({
    category,
    entryPath: entry?.path,
    fileUrl,
    isActive: isOpen,
    isContentLoading: preview.isContentLoading,
    isTooLarge: preview.isTooLarge,
    isTruncated: preview.isTruncated,
    canWrite: preview.canWrite,
    owner,
    rawContent: preview.truncatedContent,
    processedContent: preview.processedContent,
  });

  // The rich editor autosaves after a delay; leaving the file before that would drop the edit.
  const { holdsNavigation } = markdown;
  const handleOpenChange = (open: boolean) => {
    if (!open && holdsNavigation) {
      return;
    }
    onOpenChange(open);
  };

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (holdsNavigation) {
        return;
      }
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
  }, [isOpen, onPrev, onNext, holdsNavigation]);

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        size="2xl"
        height="2xl"
        className="gap-4 px-4"
        onEscapeKeyDown={(event) => {
          const target = event.target instanceof Node ? event.target : null;
          const reachesDocument =
            target !== null &&
            [documentArea, documentControls].some((element) =>
              element?.contains(target)
            );
          if (reachesDocument && hasOpenDocumentLayer(document)) {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader hideButton className="flex gap-4">
          <div className="flex items-center gap-2">
            <DialogTitle className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 overflow-hidden">
                {FileIcon && (
                  <Icon
                    visual={FileIcon}
                    size="sm"
                    className="shrink-0 text-foreground"
                  />
                )}
                <span className="min-w-16 truncate leading-5 text-foreground">
                  {entry?.fileName ?? t`Preview data`}
                </span>
              </div>
            </DialogTitle>
            {/* Level with the title, where the built-in close button sat. */}
            <div className="-my-1.5 -mr-2 ml-auto flex shrink-0 items-center gap-1">
              <div ref={setDocumentControls} className="flex empty:hidden" />
              <DialogClose asChild>
                <Button
                  icon={XClose}
                  variant="ghost"
                  size="sm"
                  aria-label={t`Close`}
                />
              </DialogClose>
            </div>
          </div>
          <div className="flex items-center justify-between">
            {recordCounts && (
              <span
                className={cn(
                  "line-clamp-1 shrink-0 text-xs font-normal leading-4",
                  "text-muted-foreground"
                )}
              >
                {formatRecordCounts(recordCounts, t)}
              </span>
            )}
          </div>
        </DialogHeader>
        {markdown.canEdit && !markdown.richEditor && (
          <div className="flex shrink-0 justify-end px-4">
            <MarkdownFilePreviewViewModeSwitch
              key={`${entry?.path ?? "none"}:${isOpen}`}
              viewMode={markdown.viewMode}
              onViewModeChange={markdown.setViewMode}
            />
          </div>
        )}
        <div
          ref={setDocumentArea}
          className={cn(
            "min-h-0 flex-1 px-4",
            filePreviewLayoutClassName(category)
          )}
        >
          <FilePreviewBody
            download={{
              onClick: () => void handleDownload(),
              isLoading: isDownloading,
            }}
            entry={entry}
            fileUrl={fileUrl}
            markdown={markdown}
            markdownHeaderControlsContainer={documentControls}
            onMarkdownViewModeChange={
              markdown.canEdit ? markdown.setViewMode : undefined
            }
            owner={owner}
            preview={preview}
          />
        </div>
        <DialogFooter className="px-4">
          <div className="flex w-full items-center justify-between">
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                icon={ChevronLeft}
                onClick={onPrev}
                disabled={!onPrev || holdsNavigation}
                tooltip={t`Previous`}
              />
              <Button
                variant="outline"
                size="sm"
                icon={ChevronRight}
                onClick={onNext}
                disabled={!onNext || holdsNavigation}
                tooltip={t`Next`}
              />
            </div>
            {markdown.canEdit && !markdown.richEditor ? (
              <div className="flex items-center gap-2">
                <Button
                  label={t`Save`}
                  variant="highlight"
                  size="sm"
                  isLoading={markdown.isSaving}
                  disabled={!markdown.isDirty || markdown.isSaving}
                  onClick={() => void markdown.save()}
                />
                <Button
                  label={t`Revert`}
                  variant="outline"
                  size="sm"
                  disabled={!markdown.isDirty || markdown.isSaving}
                  onClick={markdown.revert}
                />
                <Button
                  variant="outline"
                  size="sm"
                  icon={Download01}
                  label={isDownloading ? t`Downloading…` : t`Download`}
                  onClick={handleDownload}
                  disabled={!entry || isDownloading || markdown.isDirty}
                />
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                icon={Download01}
                label={isDownloading ? t`Downloading…` : t`Download`}
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
