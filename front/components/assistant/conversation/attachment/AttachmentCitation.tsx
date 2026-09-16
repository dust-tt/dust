import { AttachmentChipCitation } from "@app/components/assistant/conversation/attachment/AttachmentChipCitation";
import type {
  FileCitationCardProps,
  FileCitationCardSize,
} from "@app/components/assistant/conversation/attachment/FileCitationCard";
import { FileCitationCard } from "@app/components/assistant/conversation/attachment/FileCitationCard";
import { PreviewableCitation } from "@app/components/assistant/conversation/attachment/PreviewableCitation";
import type { AttachmentCitation } from "@app/components/assistant/conversation/attachment/types";
import { isAudioContentType } from "@app/components/assistant/conversation/attachment/utils";
import { useFilePreviewContext } from "@app/components/assistant/conversation/FilePreviewContext";
import { isFrameContentType } from "@app/types/files";
import { Icon, useTranscribingProgress } from "@dust-tt/sparkle";

// `card` is the Citation card shown under messages; `chip` is the compact
// AttachmentChip of the composer's attachment row.
export type AttachmentCitationVariant = "card" | "chip";

interface AttachmentCitationProps {
  attachmentCitation: AttachmentCitation;
  size?: FileCitationCardSize;
  variant?: AttachmentCitationVariant;
}

type CitationByVariantProps = FileCitationCardProps & {
  variant: AttachmentCitationVariant;
};

function CitationByVariant({
  variant,
  size,
  ...props
}: CitationByVariantProps) {
  return variant === "chip" ? (
    <AttachmentChipCitation {...props} />
  ) : (
    <FileCitationCard {...props} size={size} />
  );
}

export function AttachmentCitation({
  attachmentCitation,
  size = "md",
  variant = "card",
}: AttachmentCitationProps) {
  const { openFramePreview } = useFilePreviewContext();

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
    const tooltipHeader = (
      <>
        <div className="font-bold">{attachmentCitation.title}</div>
        <div className="flex gap-1 pt-1 text-sm">
          <Icon visual={attachmentCitation.spaceIcon} />
          <p>{attachmentCitation.spaceName}</p>
        </div>
      </>
    );
    // The chip appends the description (path) to its tooltip itself.
    const tooltipContent =
      variant === "chip" ? (
        <div className="flex flex-col gap-1">{tooltipHeader}</div>
      ) : (
        <div className="flex flex-col gap-1">
          {tooltipHeader}
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
      variant,
      tooltipLabel: tooltipContent,
    };
    return nodeUrl ? (
      <CitationByVariant {...nodeBase} href={nodeUrl} />
    ) : (
      <CitationByVariant {...nodeBase} />
    );
  }

  const { fileId, contentType, title, sourceUrl } = attachmentCitation;
  const filePath =
    "filePath" in attachmentCitation ? attachmentCitation.filePath : undefined;

  if (fileId && !isLoading && isFrameContentType(contentType)) {
    return (
      <CitationByVariant
        icon={attachmentCitation.visual}
        title={title}
        description={attachmentCitation.description}
        size={size}
        variant={variant}
        onClick={() => openFramePreview({ fileId })}
        onRemove={attachmentCitation.onRemove}
        tooltipLabel={title}
      />
    );
  }

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
        variant={variant}
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
    variant,
    isLoading,
    loadingLabel,
    onRemove: attachmentCitation.onRemove,
    tooltipLabel: title,
  };
  return sourceUrl ? (
    <CitationByVariant {...fallbackBase} href={sourceUrl} />
  ) : (
    <CitationByVariant {...fallbackBase} />
  );
}
