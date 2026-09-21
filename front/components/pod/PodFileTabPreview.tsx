import {
  FilePreviewContent,
  useFilePreviewContent,
} from "@app/components/file_explorer/FilePreviewContent";
import { FilePreviewFallback } from "@app/components/file_explorer/FilePreviewFallback";
import type { FileEntry } from "@app/components/file_explorer/types";
import { useMarkdownFileEditor } from "@app/components/file_explorer/useMarkdownFileEditor";
import { MissingPodFileTabCallout } from "@app/components/pod/MissingPodFileTabCallout";
import { useViewChangeLock } from "@app/hooks/useViewChangeGuard";
import {
  getFilePathDownloadUrl,
  getFilePathViewUrl,
  useFileMetadataFromPath,
} from "@app/lib/swr/files";
import {
  contentTypeFromFileName,
  fileSizeToHumanReadable,
} from "@app/types/files";
import type { LightWorkspaceType } from "@app/types/user";
import { cn, Spinner } from "@dust-tt/sparkle";
import { useMemo } from "react";

interface PodFileTabPreviewProps {
  owner: LightWorkspaceType;
  filePath: string;
  canEdit: boolean;
}

/**
 * @cc [owner:flvndvd,label:product] pinned-markdown-read-only
 * Pinned Markdown MUST stay read-only and never persist changes when canEdit is false.
 */
export function PodFileTabPreview({
  owner,
  filePath,
  canEdit,
}: PodFileTabPreviewProps) {
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
  const {
    category,
    truncatedContent,
    processedContent,
    hasError,
    isContentLoading,
    isTooLarge,
    sizeBytes,
  } = useFilePreviewContent({
    entry,
    fileUrl,
    enabled: !!entry,
  });

  const markdown = useMarkdownFileEditor({
    category,
    entryPath: entry?.path,
    fileUrl,
    isActive: !!entry,
    isContentLoading,
    isTooLarge,
    owner,
    processedContent,
    canEdit,
  });

  useViewChangeLock(markdown.isDirty || markdown.isSaving);

  if (isFileMetadataLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (isFileMetadataNotFound || !entry) {
    return <MissingPodFileTabCallout path={filePath} />;
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden p-2">
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl ring-1 ring-border/60">
        {isTooLarge ? (
          <FilePreviewFallback
            download={{ href: getFilePathDownloadUrl(owner, filePath) }}
            message={`This file is too large to preview (${fileSizeToHumanReadable(sizeBytes, 1)}).`}
          />
        ) : hasError ? (
          <FilePreviewFallback
            download={{ href: getFilePathDownloadUrl(owner, filePath) }}
            message="Unable to preview this file."
          />
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
              markdown={markdown}
              owner={owner}
              processedContent={processedContent}
            />
          </div>
        )}
      </div>
    </div>
  );
}
