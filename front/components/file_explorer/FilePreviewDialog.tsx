import {
  FilePreviewContent,
  MAX_CSV_ROWS,
  useFilePreviewContent,
} from "@app/components/file_explorer/FilePreviewContent";
import type { MarkdownFilePreviewViewMode } from "@app/components/file_explorer/MarkdownFilePreview";
import { MarkdownFilePreviewViewModeSwitch } from "@app/components/file_explorer/MarkdownFilePreview";
import type { FileEntry } from "@app/components/file_explorer/types";
import { useSendNotification } from "@app/hooks/useNotification";
import { parseCanonicalScopedPath } from "@app/lib/api/files/mount_path";
import { getFileTypeIcon } from "@app/lib/file_icon_utils";
import { writeFileContentByPath } from "@app/lib/swr/files";
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
import { useEffect, useRef, useState } from "react";
import { useSWRConfig } from "swr";

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

  const {
    category,
    truncatedContent,
    processedContent,
    recordCounts,
    hasError,
    isContentLoading,
  } = useFilePreviewContent({ entry, fileUrl, enabled: isOpen });

  const FileIcon = entry
    ? getFileTypeIcon(entry.contentType, entry.fileName)
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
            <p className="text-sm text-muted-foreground">
              Unable to preview this file. You can download it instead.
            </p>
          </div>
        ) : category === "delimited" ? (
          <div className="flex min-h-0 flex-1 flex-col px-4">
            {entry && (
              <FilePreviewContent
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
                owner={owner}
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
              <FilePreviewContent
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
                owner={owner}
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
