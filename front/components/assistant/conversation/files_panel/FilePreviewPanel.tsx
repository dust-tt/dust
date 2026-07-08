import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { ConversationSidePanelHeader } from "@app/components/assistant/conversation/ConversationSidePanelHeader";
import { CenteredState } from "@app/components/assistant/conversation/interactive_content/CenteredState";
import {
  FilePreviewContent,
  useFilePreviewContent,
} from "@app/components/file_explorer/FilePreviewContent";
import type { FileEntry } from "@app/components/file_explorer/types";
import { useConversationSandboxFiles } from "@app/hooks/conversations/useConversationSandboxFiles";
import { getFileTypeIcon } from "@app/lib/file_icon_utils";
import { getFilePathDownloadUrl, getFilePathViewUrl } from "@app/lib/swr/files";
import type { FileSystemFileEntry } from "@app/types/api/file_system/types";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { contentTypeFromFileName } from "@app/types/files";
import type { LightWorkspaceType } from "@app/types/user";
import { Download01, Icon, NewButton } from "@dust-tt/sparkle";

interface FilePreviewPanelProps {
  conversation: ConversationWithoutContentType;
  owner: LightWorkspaceType;
}

export function FilePreviewPanel({
  conversation,
  owner,
}: FilePreviewPanelProps) {
  const { data: filePath, closePanel } = useConversationSidePanelContext();

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

  const fileName = filePath ? (filePath.split("/").pop() ?? filePath) : "";
  const baseUrl = filePath ? getFilePathViewUrl(owner, filePath) : null;

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
    sandboxFile?.contentType ?? contentTypeFromFileName(fileName) ?? "";

  const entry: FileEntry | null = !filePath
    ? null
    : sandboxFile
      ? { ...sandboxFile, kind: "file" }
      : {
          kind: "file",
          isDirectory: false,
          fileName,
          path: filePath,
          contentType,
          fileId: null,
          thumbnailUrl: null,
          sizeBytes: 0,
          lastModifiedMs: 0,
        };

  const {
    category,
    truncatedContent,
    processedContent,
    hasError,
    isContentLoading,
  } = useFilePreviewContent({
    entry,
    fileUrl: baseUrl,
    enabled: !!filePath,
  });

  if (!filePath || !entry || !baseUrl) {
    return null;
  }

  const FileIcon = getFileTypeIcon(contentType, fileName);

  return (
    <div className="flex h-panel min-h-0 flex-col">
      <ConversationSidePanelHeader onClose={closePanel}>
        <div className="flex min-w-0 items-center gap-1.5">
          <Icon visual={FileIcon} size="sm" className="shrink-0" />
          <span className="line-clamp-1 text-sm font-medium">{fileName}</span>
        </div>
        <div className="ml-2 flex items-center gap-1">
          <NewButton
            variant="ghost"
            size="sm"
            icon={Download01}
            tooltip="Download"
            href={getFilePathDownloadUrl(owner, filePath)}
            target="_blank"
            rel="noopener noreferrer"
          />
        </div>
      </ConversationSidePanelHeader>
      <div className="min-h-0 flex-1 overflow-y-auto bg-muted-background p-4">
        {hasError ? (
          <CenteredState>
            <p className="text-sm text-muted-foreground">
              Unable to preview this file. You can download it instead.
            </p>
          </CenteredState>
        ) : (
          <FilePreviewContent
            category={category}
            entry={entry}
            fileContent={truncatedContent}
            fileUrl={baseUrl}
            isContentLoading={isContentLoading}
            isFullWidth
            markdownContent={processedContent?.text}
            markdownViewMode="preview"
            processedContent={processedContent}
          />
        )}
      </div>
    </div>
  );
}
