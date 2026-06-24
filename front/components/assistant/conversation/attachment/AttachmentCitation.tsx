import type { FileCitationCardSize } from "@app/components/assistant/conversation/attachment/FileCitationCard";
import { FileCitationCard } from "@app/components/assistant/conversation/attachment/FileCitationCard";
import { PreviewableCitation } from "@app/components/assistant/conversation/attachment/PreviewableCitation";
import type { AttachmentCitation } from "@app/components/assistant/conversation/attachment/types";
import { isAudioContentType } from "@app/components/assistant/conversation/attachment/utils";
import { ConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { isInteractiveContentType } from "@app/types/files";
import { Icon, useTranscribingProgress } from "@dust-tt/sparkle";
import { useContext } from "react";

interface AttachmentCitationProps {
  attachmentCitation: AttachmentCitation;
  size?: FileCitationCardSize;
}

export function AttachmentCitation({
  attachmentCitation,
  size = "md",
}: AttachmentCitationProps) {
  const sidePanel = useContext(ConversationSidePanelContext);

  const isLoading =
    attachmentCitation.type === "file" && attachmentCitation.isUploading;

  const isTranscribingAudio =
    isLoading === true && isAudioContentType(attachmentCitation);
  const audioSizeBytes =
    attachmentCitation.type === "file" &&
    attachmentCitation.attachmentCitationType !== "mcp"
      ? attachmentCitation.size
      : undefined;

  const transcriptionProgress = useTranscribingProgress({
    isTranscriptingInProgress: isTranscribingAudio,
    sizeBytes: audioSizeBytes ?? 0,
  });
  const loadingLabel =
    isTranscribingAudio && transcriptionProgress !== null
      ? `${transcriptionProgress}%`
      : undefined;

  // Node citation: link to an external datasource document.
  if (attachmentCitation.type === "node") {
    const tooltipContent = (
      <div className="flex flex-col gap-1">
        <div className="font-bold">{attachmentCitation.title}</div>
        <div className="flex gap-1 pt-1 text-sm">
          <Icon visual={attachmentCitation.spaceIcon} />
          <p>{attachmentCitation.spaceName}</p>
        </div>
        <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          {attachmentCitation.path}
        </div>
      </div>
    );
    const nodeUrl = attachmentCitation.sourceUrl;
    const nodeBase = {
      icon: attachmentCitation.visual,
      title: attachmentCitation.title,
      description: attachmentCitation.path ?? attachmentCitation.spaceName,
      onRemove: attachmentCitation.onRemove,
      size,
      tooltipLabel: tooltipContent,
    };
    return nodeUrl ? (
      <FileCitationCard {...nodeBase} href={nodeUrl} />
    ) : (
      <FileCitationCard {...nodeBase} />
    );
  }

  const { fileId, contentType, title, sourceUrl } = attachmentCitation;
  const filePath =
    "filePath" in attachmentCitation ? attachmentCitation.filePath : undefined;

  // Interactive content (spreadsheets etc.): open side panel instead of preview dialog.
  // Only possible when we have a fileId (the side panel API requires it).
  if (
    fileId &&
    !isLoading &&
    isInteractiveContentType(contentType) &&
    sidePanel != null
  ) {
    return (
      <FileCitationCard
        icon={attachmentCitation.visual}
        title={title}
        description={attachmentCitation.description}
        size={size}
        onClick={() =>
          sidePanel.openPanel({ type: "interactive_content", fileId })
        }
        onRemove={attachmentCitation.onRemove}
        tooltipLabel={title}
      />
    );
  }

  // Previewable file: identified by fileId or filePath.
  if (fileId || filePath) {
    return (
      <PreviewableCitation
        fileId={fileId}
        filePath={filePath}
        contentType={contentType}
        title={title}
        thumbnailUrl={sourceUrl ?? undefined}
        downloadUrl={sourceUrl ?? undefined}
        icon={attachmentCitation.visual}
        description={attachmentCitation.description}
        size={size}
        isLoading={isLoading}
        loadingLabel={loadingLabel}
        onRemove={attachmentCitation.onRemove}
        tooltipLabel={title}
      />
    );
  }

  // Fallback: no identifier yet (still uploading) or plain external link.
  const fallbackBase = {
    icon: attachmentCitation.visual,
    title,
    description: attachmentCitation.description,
    size,
    isLoading,
    loadingLabel,
    onRemove: attachmentCitation.onRemove,
    tooltipLabel: title,
  };
  return sourceUrl ? (
    <FileCitationCard {...fallbackBase} href={sourceUrl} />
  ) : (
    <FileCitationCard {...fallbackBase} />
  );
}
