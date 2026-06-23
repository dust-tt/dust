import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { CenteredState } from "@app/components/assistant/conversation/interactive_content/CenteredState";
import { InteractiveContentHeader } from "@app/components/assistant/conversation/interactive_content/InteractiveContentHeader";
import { PDFViewer } from "@app/components/file_explorer/PDFViewer";
import { getFilePreviewConfig } from "@app/components/file_explorer/utils";
import { getFileTypeIcon } from "@app/lib/file_icon_utils";
import { getFilePathDownloadUrl, getFilePathViewUrl } from "@app/lib/swr/files";
import { contentTypeFromFileName } from "@app/types/files";
import type { LightWorkspaceType } from "@app/types/user";
import { Button, Download01, Icon } from "@dust-tt/sparkle";

interface FilePreviewPanelProps {
  owner: LightWorkspaceType;
}

export function FilePreviewPanel({ owner }: FilePreviewPanelProps) {
  const { data: filePath, closePanel } = useConversationSidePanelContext();

  if (!filePath) {
    return null;
  }

  const fileName = filePath.split("/").pop() ?? filePath;
  // Office documents have no in-browser renderer; the file's content type is
  // derived from its name to pick the right preview strategy and icon.
  const contentType = contentTypeFromFileName(fileName) ?? "";
  const { category } = getFilePreviewConfig(contentType);
  const fileUrl = getFilePathViewUrl(owner, filePath);
  const FileIcon = getFileTypeIcon(contentType, fileName);

  const renderContent = () => {
    // Office documents (presentations, etc.) are rendered as a server-side PDF
    // conversion (?preview=pdf); native PDFs are rendered directly. Both are
    // only available through the path-based file route.
    if (category === "viewer") {
      return <PDFViewer key={fileUrl} url={`${fileUrl}?preview=pdf`} />;
    }
    if (category === "pdf") {
      return <PDFViewer key={fileUrl} url={fileUrl} />;
    }

    return (
      <CenteredState>
        <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          Unable to preview this file. You can download it instead.
        </p>
      </CenteredState>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <InteractiveContentHeader onClose={closePanel}>
        <div className="flex min-w-0 items-center gap-1.5">
          <Icon visual={FileIcon} size="sm" className="shrink-0" />
          <span className="line-clamp-1 text-sm font-medium">{fileName}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon={Download01}
          tooltip="Download"
          href={getFilePathDownloadUrl(owner, filePath)}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-2"
        />
      </InteractiveContentHeader>
      <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
        {renderContent()}
      </div>
    </div>
  );
}
