import type { FileCitationCardSize } from "@app/components/assistant/conversation/attachment/FileCitationCard";
import {
  FileCitationCard,
  FileCitationTooltipLabel,
} from "@app/components/assistant/conversation/attachment/FileCitationCard";
import { PreviewableCitation } from "@app/components/assistant/conversation/attachment/PreviewableCitation";
import type { AttachmentCitation } from "@app/components/assistant/conversation/attachment/types";
import { isAudioContentType } from "@app/components/assistant/conversation/attachment/utils";
import { ConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import {
  isFrameContentType,
  isSupportedImageContentType,
  opensInSidePanel,
} from "@app/types/files";
import type { ImagePreviewTitlePositionType } from "@dust-tt/sparkle";
import { Icon, useTranscribingProgress } from "@dust-tt/sparkle";
import { useContext } from "react";

interface AttachmentCitationProps {
  attachmentCitation: AttachmentCitation;
  size?: FileCitationCardSize;
  // Image citations only: container class and hover title placement.
  imageContainerClassName?: string;
  imageTitlePosition?: ImagePreviewTitlePositionType;
}

export function AttachmentCitation({
  attachmentCitation,
  size = "md",
  imageContainerClassName,
  imageTitlePosition,
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
        <div className="text-sm text-muted-foreground">
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

  const { fileId, contentType, title, sourceUrl, description } =
    attachmentCitation;
  const filePath =
    "filePath" in attachmentCitation ? attachmentCitation.filePath : undefined;
  const tooltipLabel = description ? (
    <FileCitationTooltipLabel title={title} description={description} />
  ) : (
    title
  );

  // Interactive content (spreadsheets etc.): open side panel instead of preview dialog.
  // Path-backed interactive citations are handled by PreviewableCitation below.
  if (
    fileId &&
    !isLoading &&
    isFrameContentType(contentType) &&
    sidePanel != null
  ) {
    return (
      <FileCitationCard
        icon={attachmentCitation.visual}
        title={title}
        description={description}
        size={size}
        onClick={() =>
          sidePanel.openPanel({ type: "interactive_content", fileId })
        }
        onRemove={attachmentCitation.onRemove}
        tooltipLabel={tooltipLabel}
      />
    );
  }

  // Some formats (e.g. presentations) open the resizable side panel instead of
  // the center preview dialog. Requires a file path (the preview conversion is
  // only served on the path-based route) and the side panel provider.
  if (
    filePath &&
    !isLoading &&
    opensInSidePanel(contentType) &&
    sidePanel != null
  ) {
    return (
      <FileCitationCard
        icon={attachmentCitation.visual}
        title={title}
        description={description}
        size={size}
        onClick={() => sidePanel.openPanel({ type: "file_preview", filePath })}
        onRemove={attachmentCitation.onRemove}
        tooltipLabel={tooltipLabel}
      />
    );
  }

  // Previewable file: identified by fileId or filePath. An image still uploading
  // has neither yet, but reserves its preview slot to avoid a layout shift.
  const isUploadingImage =
    isLoading === true && isSupportedImageContentType(contentType);
  if (fileId || filePath || isUploadingImage) {
    return (
      <PreviewableCitation
        containerClassName={imageContainerClassName}
        imageTitlePosition={imageTitlePosition}
        fileId={fileId}
        filePath={filePath}
        contentType={contentType}
        title={title}
        thumbnailUrl={sourceUrl ?? undefined}
        downloadUrl={sourceUrl ?? undefined}
        icon={attachmentCitation.visual}
        description={description}
        size={size}
        isLoading={isLoading}
        loadingLabel={loadingLabel}
        onRemove={attachmentCitation.onRemove}
        tooltipLabel={tooltipLabel}
      />
    );
  }

  // Fallback: no identifier yet (still uploading) or plain external link.
  const fallbackBase = {
    icon: attachmentCitation.visual,
    title,
    description,
    size,
    isLoading,
    loadingLabel,
    onRemove: attachmentCitation.onRemove,
    tooltipLabel,
  };
  return sourceUrl ? (
    <FileCitationCard {...fallbackBase} href={sourceUrl} />
  ) : (
    <FileCitationCard {...fallbackBase} />
  );
}
