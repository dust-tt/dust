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
  compact?: boolean;
}

export function AttachmentCitation({
  attachmentCitation,
  compact,
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
    return (
      <FileCitationCard
        icon={attachmentCitation.visual}
        title={attachmentCitation.title}
        description={attachmentCitation.path ?? attachmentCitation.spaceName}
        href={attachmentCitation.sourceUrl ?? undefined}
        onRemove={attachmentCitation.onRemove}
        compact={compact}
        tooltipLabel={tooltipContent}
      />
    );
  }

  const { fileId, contentType, title, sourceUrl } = attachmentCitation;

  // Interactive content (spreadsheets etc.): open side panel instead of preview dialog.
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
        compact={compact}
        onClick={() =>
          sidePanel.openPanel({ type: "interactive_content", fileId })
        }
        onRemove={attachmentCitation.onRemove}
        tooltipLabel={title}
      />
    );
  }

  // Previewable file: delegate entirely to PreviewableCitation.
  if (fileId) {
    return (
      <PreviewableCitation
        fileId={fileId}
        contentType={contentType}
        title={title}
        thumbnailUrl={sourceUrl ?? undefined}
        downloadUrl={sourceUrl ?? undefined}
        icon={attachmentCitation.visual}
        description={attachmentCitation.description}
        compact={compact}
        isLoading={isLoading}
        loadingLabel={loadingLabel}
        onRemove={attachmentCitation.onRemove}
        tooltipLabel={title}
      />
    );
  }

  // Fallback: no fileId (still uploading or external link).
  return (
    <FileCitationCard
      icon={attachmentCitation.visual}
      title={title}
      description={attachmentCitation.description}
      compact={compact}
      isLoading={isLoading}
      loadingLabel={loadingLabel}
      href={sourceUrl ?? undefined}
      onRemove={attachmentCitation.onRemove}
      tooltipLabel={title}
    />
  );
}
