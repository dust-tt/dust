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
import { MarkdownFilePreviewViewModeSwitch } from "@app/components/file_explorer/MarkdownFilePreview";
import type { FileEntry } from "@app/components/file_explorer/types";
import { useMarkdownFileEditor } from "@app/components/file_explorer/useMarkdownFileEditor";
import { useConversationSandboxFiles } from "@app/hooks/conversations/useConversationSandboxFiles";
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
  const { fileId, filePath } = parseFilePreviewData(data);

  // The conversion preview is cached (Cache-Control: max-age) per URL, so we
  // bust it with the file's lastModifiedMs. SWR revalidates this list on mount
  // and window focus, so the preview refreshes after the file is touched (and
  // the reload button forces an immediate revalidation).
  // TODO: use E2B events of "files are updated", when they are merged
  const { sandboxFiles } = useConversationSandboxFiles({
    conversationId: conversation.sId,
    owner,
    options: { disabled: !filePath },
  });

  // Files opened by id are absent from the sandbox listing.
  const { fileMetadata, isFileMetadataLoading } = useFileMetadata({
    fileId: fileId ?? null,
    owner,
    disabled: !fileId,
  });

  const fileName = filePath
    ? (filePath.split("/").pop() ?? filePath)
    : (fileMetadata?.fileName ?? "");
  const urls = filePath
    ? {
        baseUrl: getFilePathViewUrl(owner, filePath),
        downloadUrl: getFilePathDownloadUrl(owner, filePath),
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
  const sandboxFile = filePath
    ? sandboxFiles.find(
        (f): f is FileSystemFileEntry => !f.isDirectory && f.path === filePath
      )
    : undefined;
  const contentType =
    sandboxFile?.contentType ??
    fileMetadata?.contentType ??
    contentTypeFromFileName(fileName) ??
    "";

  const entry: FileEntry | null = sandboxFile
    ? { ...sandboxFile, kind: "file" }
    : filePath || fileMetadata
      ? {
          kind: "file",
          isDirectory: false,
          fileName,
          path: filePath ?? "",
          contentType,
          fileId: fileId ?? null,
          thumbnailUrl: null,
          sizeBytes: 0,
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
    entryPath: filePath,
    fileUrl: urls?.baseUrl ?? null,
    isActive: !!entry,
    isContentLoading: preview.isContentLoading,
    owner,
    processedContent: preview.processedContent,
  });

  if (!entry || !urls) {
    return isFileMetadataLoading ? (
      <div className="flex h-panel flex-col">
        <ConversationSidePanelHeader onClose={closePanel} />
        <CenteredState>
          <Spinner />
        </CenteredState>
      </div>
    ) : null;
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
          {markdown.canEdit && (
            <>
              <MarkdownFilePreviewViewModeSwitch
                viewMode={markdown.viewMode}
                onViewModeChange={markdown.setViewMode}
              />
              {markdown.isDirty && (
                <>
                  <Button
                    label="Save"
                    variant="highlight"
                    size="xs"
                    isLoading={markdown.isSaving}
                    disabled={markdown.isSaving}
                    onClick={() => void markdown.save()}
                  />
                  <Button
                    label="Revert"
                    variant="outline"
                    size="xs"
                    disabled={markdown.isSaving}
                    onClick={markdown.revert}
                  />
                </>
              )}
            </>
          )}
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
