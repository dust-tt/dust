import {
  FilePreviewContent,
  useFilePreviewContent,
} from "@app/components/file_explorer/FilePreviewContent";
import type { MarkdownFilePreviewViewMode } from "@app/components/file_explorer/MarkdownFilePreview";
import { MarkdownFilePreviewViewModeSwitch } from "@app/components/file_explorer/MarkdownFilePreview";
import type { FileEntry } from "@app/components/file_explorer/types";
import { useSendNotification } from "@app/hooks/useNotification";
import {
  getFilePathContentApiPath,
  getFilePathViewUrl,
  useFileMetadataFromPath,
  writeFileContentByPath,
} from "@app/lib/swr/files";
import { contentTypeFromFileName } from "@app/types/files";
import { parseCanonicalScopedPath } from "@app/types/mount_path";
import type { LightWorkspaceType } from "@app/types/user";
import { Button, cn, Spinner } from "@dust-tt/sparkle";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSWRConfig } from "swr";

interface PodFileTabPreviewProps {
  owner: LightWorkspaceType;
  filePath: string;
  canEdit: boolean;
}

/**
 * Full-height preview for a non-frame Pod tab. Reuses FilePreviewContent so
 * markdown and other previewable files behave the same as in the file dialog,
 * including inline edit + save when the path is writable.
 */
export function PodFileTabPreview({
  owner,
  filePath,
  canEdit,
}: PodFileTabPreviewProps) {
  const sendNotification = useSendNotification();
  const { mutate } = useSWRConfig();

  const { metadata, isFileMetadataLoading, isFileMetadataNotFound } =
    useFileMetadataFromPath({
      owner,
      filePath,
    });

  const fileName = filePath.split("/").pop() ?? filePath;
  const contentType =
    metadata?.contentType ??
    contentTypeFromFileName(fileName) ??
    "application/octet-stream";

  const entry: FileEntry | null = useMemo(() => {
    if (isFileMetadataNotFound) {
      return null;
    }
    return {
      kind: "file",
      isDirectory: false,
      fileName,
      path: filePath,
      contentType,
      fileId: metadata?.fileId ?? null,
      thumbnailUrl: null,
      sizeBytes: metadata?.sizeBytes ?? 0,
      lastModifiedMs: 0,
    };
  }, [
    contentType,
    fileName,
    filePath,
    isFileMetadataNotFound,
    metadata?.fileId,
    metadata?.sizeBytes,
  ]);

  const fileUrl = getFilePathViewUrl(owner, filePath);
  const contentApiPath = getFilePathContentApiPath(owner, filePath);

  const [markdownViewMode, setMarkdownViewMode] =
    useState<MarkdownFilePreviewViewMode>("preview");
  const [markdownDraft, setMarkdownDraft] = useState("");
  const [markdownSavedContent, setMarkdownSavedContent] = useState("");
  const [markdownSourcePath, setMarkdownSourcePath] = useState<string | null>(
    null
  );
  const [isMarkdownSaving, setIsMarkdownSaving] = useState(false);
  const [previewKey, setPreviewKey] = useState(filePath);
  const markdownInitKeyRef = useRef<string | null>(null);

  if (filePath !== previewKey) {
    setPreviewKey(filePath);
    setMarkdownViewMode("preview");
    setMarkdownSourcePath(null);
    setMarkdownDraft("");
    setMarkdownSavedContent("");
    markdownInitKeyRef.current = null;
  }

  const {
    category,
    truncatedContent,
    processedContent,
    hasError,
    isContentLoading,
  } = useFilePreviewContent({
    entry,
    fileUrl,
    enabled: !!entry,
  });

  const editableMarkdownFilePath =
    entry && canEdit && parseCanonicalScopedPath(entry.path)
      ? entry.path
      : null;
  const canEditMarkdown = category === "markdown" && !!editableMarkdownFilePath;
  const isMarkdownDirty = markdownDraft !== markdownSavedContent;

  useEffect(() => {
    if (
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
    processedContent,
    processedContent?.text,
  ]);

  const handleMarkdownSave = async () => {
    if (!editableMarkdownFilePath || !isMarkdownDirty || isMarkdownSaving) {
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
        contentApiPath,
        { kind: "loaded", content: markdownDraft },
        { revalidate: false }
      );
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

  if (isFileMetadataLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (isFileMetadataNotFound || !entry) {
    return (
      <div className="flex h-full w-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
        This file is no longer available in the Pod files.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden p-2">
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl ring-1 ring-border/60">
        {canEditMarkdown && (
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-4 py-2">
            <MarkdownFilePreviewViewModeSwitch
              key={entry.path}
              viewMode={markdownViewMode}
              onViewModeChange={setMarkdownViewMode}
            />
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
                onClick={() => setMarkdownDraft(markdownSavedContent)}
              />
            </div>
          </div>
        )}
        {hasError ? (
          <div className="flex flex-1 items-center justify-center p-8">
            <p className="text-sm text-muted-foreground">
              Unable to preview this file.
            </p>
          </div>
        ) : (
          <div
            className={cn(
              "min-h-0 flex-1 p-4",
              category === "markdown"
                ? "flex flex-col overflow-hidden"
                : "overflow-y-auto"
            )}
          >
            <FilePreviewContent
              category={category}
              entry={entry}
              fileContent={truncatedContent}
              fileUrl={fileUrl}
              isContentLoading={isContentLoading}
              isFullWidth
              markdownCanEdit={canEditMarkdown}
              markdownContent={
                canEditMarkdown
                  ? markdownSourcePath === entry.path
                    ? markdownDraft
                    : processedContent?.text
                  : processedContent?.text
              }
              markdownViewMode={canEditMarkdown ? markdownViewMode : "preview"}
              onMarkdownContentChange={
                canEditMarkdown ? setMarkdownDraft : undefined
              }
              onMarkdownViewModeChange={
                canEditMarkdown ? setMarkdownViewMode : undefined
              }
              owner={owner}
              processedContent={processedContent}
            />
          </div>
        )}
      </div>
    </div>
  );
}
