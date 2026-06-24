import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { CenteredState } from "@app/components/assistant/conversation/interactive_content/CenteredState";
import { InteractiveContentHeader } from "@app/components/assistant/conversation/interactive_content/InteractiveContentHeader";
import { PDFViewer } from "@app/components/file_explorer/PDFViewer";
import type { FilePreviewCategory } from "@app/components/file_explorer/utils";
import { getFilePreviewConfig } from "@app/components/file_explorer/utils";
import { useConversationSandboxFiles } from "@app/hooks/conversations/useConversationSandboxFiles";
import { getFileTypeIcon } from "@app/lib/file_icon_utils";
import { getFilePathDownloadUrl, getFilePathViewUrl } from "@app/lib/swr/files";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { contentTypeFromFileName } from "@app/types/files";
import type { LightWorkspaceType } from "@app/types/user";
import { Button, Download01, Icon } from "@dust-tt/sparkle";

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
  const { sandboxFiles } = useConversationSandboxFiles({
    conversationId: conversation.sId,
    owner,
    options: { disabled: !filePath },
  });

  if (!filePath) {
    return null;
  }

  const fileName = filePath.split("/").pop() ?? filePath;
  // Office documents have no in-browser renderer; the file's content type is
  // derived from its name to pick the right preview strategy and icon.
  const contentType = contentTypeFromFileName(fileName) ?? "";
  const { category } = getFilePreviewConfig(contentType);
  const FileIcon = getFileTypeIcon(contentType, fileName);

  const version = sandboxFiles.find((f) => f.path === filePath)?.lastModifiedMs;
  const baseUrl = getFilePathViewUrl(owner, filePath);

  return (
    <div className="flex h-panel min-h-0 flex-col">
      <InteractiveContentHeader onClose={closePanel}>
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
            href={getFilePathDownloadUrl(owner, filePath)}
            target="_blank"
            rel="noopener noreferrer"
          />
        </div>
      </InteractiveContentHeader>
      <div className="min-h-0 flex-1 overflow-hidden bg-gray-50 dark:bg-gray-900">
        <FilePreviewContent
          category={category}
          baseUrl={baseUrl}
          version={version}
        />
      </div>
    </div>
  );
}

interface FilePreviewContentProps {
  category: FilePreviewCategory;
  baseUrl: string;
  version: number | undefined;
}

function FilePreviewContent({
  category,
  baseUrl,
  version,
}: FilePreviewContentProps) {
  // Office documents (presentations, etc.) are rendered as a server-side PDF
  // conversion (?preview=pdf), available only through the path-based file route.
  if (category === "viewer") {
    const url = `${baseUrl}?preview=pdf` + (version ? `&v=${version}` : "");
    return <PDFViewer key={url} url={url} />;
  }

  return (
    <CenteredState>
      <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
        Unable to preview this file. You can download it instead.
      </p>
    </CenteredState>
  );
}
