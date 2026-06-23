import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { CenteredState } from "@app/components/assistant/conversation/interactive_content/CenteredState";
import { InteractiveContentHeader } from "@app/components/assistant/conversation/interactive_content/InteractiveContentHeader";
import { PDFViewer } from "@app/components/file_explorer/PDFViewer";
import { getFilePreviewConfig } from "@app/components/file_explorer/utils";
import { getFileTypeIcon } from "@app/lib/file_icon_utils";
import {
  getFileDownloadUrl,
  getFileViewUrl,
  useFileMetadata,
} from "@app/lib/swr/files";
import { stripMimeParameters } from "@app/types/files";
import type { LightWorkspaceType } from "@app/types/user";
import { Button, Download01, Icon, Spinner } from "@dust-tt/sparkle";

interface FilePreviewPanelProps {
  owner: LightWorkspaceType;
}

export function FilePreviewPanel({ owner }: FilePreviewPanelProps) {
  const { data: fileId, closePanel } = useConversationSidePanelContext();

  const { fileMetadata, isFileMetadataLoading, isFileMetadataError } =
    useFileMetadata({
      fileId: fileId ?? null,
      owner,
    });

  if (!fileId) {
    return null;
  }

  const renderContent = () => {
    if (isFileMetadataLoading) {
      return (
        <CenteredState>
          <Spinner size="sm" />
          <span>Loading file...</span>
        </CenteredState>
      );
    }

    if (isFileMetadataError || !fileMetadata) {
      return (
        <CenteredState>
          <p className="text-warning-500">Error loading file metadata</p>
        </CenteredState>
      );
    }

    const mimeType = stripMimeParameters(fileMetadata.contentType);
    const { category } = getFilePreviewConfig(mimeType);
    const fileUrl = getFileViewUrl(owner, fileId);

    // Office documents (presentations, etc.) are rendered as a server-side PDF
    // conversion; PDFs are rendered directly.
    if (category === "viewer" || category === "pdf") {
      const sep = fileUrl.includes("?") ? "&" : "?";
      const viewerUrl =
        category === "viewer"
          ? `${fileUrl}${sep}preview=pdf&v=${fileMetadata.version}`
          : `${fileUrl}${sep}v=${fileMetadata.version}`;
      return <PDFViewer key={viewerUrl} url={viewerUrl} />;
    }

    return (
      <CenteredState>
        <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          Unable to preview this file. You can download it instead.
        </p>
      </CenteredState>
    );
  };

  const FileIcon = fileMetadata
    ? getFileTypeIcon(fileMetadata.contentType, fileMetadata.fileName)
    : null;

  return (
    <div className="flex h-full flex-col">
      <InteractiveContentHeader onClose={closePanel}>
        <div className="flex min-w-0 items-center gap-1.5">
          {FileIcon && (
            <Icon visual={FileIcon} size="sm" className="shrink-0" />
          )}
          <span className="line-clamp-1 text-sm font-medium">
            {fileMetadata?.fileName ?? "File"}
          </span>
        </div>
        {fileMetadata && (
          <Button
            variant="ghost"
            size="sm"
            icon={Download01}
            tooltip="Download"
            href={getFileDownloadUrl(owner, fileId)}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2"
          />
        )}
      </InteractiveContentHeader>
      <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
        {renderContent()}
      </div>
    </div>
  );
}
