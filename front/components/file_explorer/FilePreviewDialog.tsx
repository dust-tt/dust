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
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Download01,
  Icon,
} from "@dust-tt/sparkle";
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
    owner,
    processedContent: preview.processedContent,
  });

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
                  className="shrink-0 text-foreground"
                />
              )}
              <span className={cn("line-clamp-1 leading-5", "text-foreground")}>
                {entry?.fileName ?? "Preview Data"}
              </span>
            </div>
          </DialogTitle>
          <div className="flex items-center justify-between">
            {recordCounts && (
              <span
                className={cn(
                  "line-clamp-1 shrink-0 text-xs font-normal leading-4",
                  "text-muted-foreground"
                )}
              >
                {formatRecordCounts(recordCounts)}
              </span>
            )}
          </div>
        </DialogHeader>
        {markdown.canEdit && (
          <div className="flex shrink-0 justify-end px-4">
            <MarkdownFilePreviewViewModeSwitch
              key={`${entry?.path ?? "none"}:${isOpen}`}
              viewMode={markdown.viewMode}
              onViewModeChange={markdown.setViewMode}
            />
          </div>
        )}
        <div
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
            {markdown.canEdit ? (
              <div className="flex items-center gap-2">
                <Button
                  label="Save"
                  variant="highlight"
                  size="sm"
                  isLoading={markdown.isSaving}
                  disabled={!markdown.isDirty || markdown.isSaving}
                  onClick={() => void markdown.save()}
                />
                <Button
                  label="Revert"
                  variant="outline"
                  size="sm"
                  disabled={!markdown.isDirty || markdown.isSaving}
                  onClick={markdown.revert}
                />
                <Button
                  variant="outline"
                  size="sm"
                  icon={Download01}
                  label={isDownloading ? "Downloading…" : "Download"}
                  onClick={handleDownload}
                  disabled={!entry || isDownloading || markdown.isDirty}
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
