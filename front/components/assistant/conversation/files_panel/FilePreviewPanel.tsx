import {
  parseFilePreviewData,
  useConversationSidePanelContext,
} from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { ConversationSidePanelHeader } from "@app/components/assistant/conversation/ConversationSidePanelHeader";
import { CenteredState } from "@app/components/assistant/conversation/interactive_content/CenteredState";
import {
  FilePreviewBody,
  filePreviewLayoutClassName,
} from "@app/components/file_explorer/FilePreviewBody";
import {
  formatRecordCounts,
  useFilePreviewContent,
} from "@app/components/file_explorer/FilePreviewContent";
import type { FileEntry } from "@app/components/file_explorer/types";
import { useMarkdownFileEditor } from "@app/components/file_explorer/useMarkdownFileEditor";
import { useConversationSandboxFiles } from "@app/hooks/conversations/useConversationSandboxFiles";
import { useBeforeViewChange } from "@app/hooks/useViewChangeGuard";
import { getFileTypeIcon } from "@app/lib/file_icon_utils";
import {
  getFileDownloadUrl,
  getFilePathDownloadUrl,
  getFilePathViewUrl,
  getFileViewUrl,
  useFileMetadata,
} from "@app/lib/swr/files";
import type { FileSystemFileEntry } from "@app/types/api/file_system/types";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { contentTypeFromFileName } from "@app/types/files";
import { resolveCanonicalScopedPath } from "@app/types/mount_path";
import type { LightWorkspaceType } from "@app/types/user";
import { Button, cn, Download01, Icon, Spinner } from "@dust-tt/sparkle";

interface FilePreviewPanelProps {
  conversation: ConversationWithoutContentType;
  owner: LightWorkspaceType;
}

export function FilePreviewPanel({
  conversation,
  owner,
}: FilePreviewPanelProps) {
  const { data, closePanel } = useConversationSidePanelContext();
  const target = parseFilePreviewData(data);
  const fileId = target?.kind === "id" ? target.fileId : null;

  const { fileMetadata, isFileMetadataLoading } = useFileMetadata({
    fileId,
    owner,
    disabled: !fileId,
  });

  // Agents write legacy scoped paths; the files API only resolves canonical ones.
  const path =
    target?.kind === "path"
      ? resolveCanonicalScopedPath(target.filePath, {
          conversationId: conversation.sId,
          spaceId: conversation.spaceId,
        })
      : null;

  // The conversion preview is cached (Cache-Control: max-age) per URL, so we
  // bust it with the file's lastModifiedMs. SWR revalidates this list on mount
  // and window focus, so the preview refreshes after the file is touched (and
  // the reload button forces an immediate revalidation).
  // TODO: use E2B events of "files are updated", when they are merged
  const { sandboxFiles } = useConversationSandboxFiles({
    conversationId: conversation.sId,
    owner,
    options: { disabled: !path },
  });

  const fileName = path
    ? (path.split("/").pop() ?? path)
    : (fileMetadata?.fileName ?? "");
  const urls = path
    ? {
        baseUrl: getFilePathViewUrl(owner, path),
        downloadUrl: getFilePathDownloadUrl(owner, path),
      }
    : fileId
      ? {
          baseUrl: getFileViewUrl(owner, fileId),
          downloadUrl: getFileDownloadUrl(owner, fileId),
        }
      : null;

  // Reuse the file-explorer entry when the sandbox listing has loaded so we get
  // the real content type, fileId, and version. Before it loads (or for files
  // missing from the listing) fall back to a minimal entry derived from the
  // file name — Office documents have no in-browser renderer, so the content
  // type is needed to pick the right preview strategy and icon.
  const sandboxFile = path
    ? sandboxFiles.find(
        (f): f is FileSystemFileEntry => !f.isDirectory && f.path === path
      )
    : undefined;
  const contentType =
    sandboxFile?.contentType ??
    fileMetadata?.contentType ??
    contentTypeFromFileName(fileName) ??
    "";

  const entry: FileEntry | null = sandboxFile
    ? { ...sandboxFile, kind: "file" }
    : path || fileMetadata
      ? {
          kind: "file",
          isDirectory: false,
          fileName,
          path: path ?? "",
          contentType,
          fileId,
          thumbnailUrl: null,
          sizeBytes: fileMetadata?.fileSize ?? 0,
          lastModifiedMs: 0,
        }
      : null;

  const preview = useFilePreviewContent({
    entry,
    fileUrl: urls?.baseUrl ?? null,
    enabled: !!entry,
  });

  const markdown = useMarkdownFileEditor({
    category: preview.category,
    entryPath: path ?? undefined,
    fileUrl: urls?.baseUrl ?? null,
    isActive: !!entry,
    isContentLoading: preview.isContentLoading,
    isTooLarge: preview.isTooLarge,
    owner,
    processedContent: preview.processedContent,
  });

  useBeforeViewChange(markdown.save);

  if (!entry || !urls) {
    return (
      <div className="flex h-panel flex-col">
        <ConversationSidePanelHeader onClose={closePanel} />
        <CenteredState>
          {isFileMetadataLoading ? (
            <Spinner />
          ) : (
            <p className="text-sm text-muted-foreground">
              {target?.kind === "path"
                ? "This file path could not be resolved."
                : "This file is no longer available."}
            </p>
          )}
        </CenteredState>
      </div>
    );
  }

  const { recordCounts } = preview;
  const FileIcon = getFileTypeIcon(contentType, fileName);

  return (
    <div className="flex h-panel min-h-0 flex-col">
      <ConversationSidePanelHeader onClose={closePanel}>
        <div className="flex min-w-0 items-center gap-1.5">
          <Icon visual={FileIcon} size="sm" className="shrink-0" />
          <span className="line-clamp-1 text-sm font-medium">{fileName}</span>
        </div>
        <div className="ml-2 flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            icon={Download01}
            tooltip="Download"
            href={urls.downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
          />
        </div>
      </ConversationSidePanelHeader>
      <div
        className={cn(
          "min-h-0 flex-1 bg-muted-background p-4",
          filePreviewLayoutClassName(preview.category)
        )}
      >
        {recordCounts && (
          <div className="pb-2 text-xs text-muted-foreground">
            {formatRecordCounts(recordCounts)}
          </div>
        )}
        <FilePreviewBody
          download={{ href: urls.downloadUrl }}
          entry={entry}
          fileUrl={urls.baseUrl}
          isFullWidth
          markdown={markdown}
          owner={owner}
          preview={preview}
        />
      </div>
    </div>
  );
}
