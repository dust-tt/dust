import type {
  FileCitationCardSize,
  FileCitationCardVariant,
} from "@app/components/assistant/conversation/attachment/FileCitationCard";
import { FileCitationCard } from "@app/components/assistant/conversation/attachment/FileCitationCard";
import { PreviewableCitation } from "@app/components/assistant/conversation/attachment/PreviewableCitation";
import type { AttachmentCitation } from "@app/components/assistant/conversation/attachment/types";
import { isAudioContentType } from "@app/components/assistant/conversation/attachment/utils";
import { useFilePreviewContext } from "@app/components/assistant/conversation/FilePreviewContext";
import { isFrameContentType } from "@app/types/files";
import { Icon, useTranscribingProgress } from "@dust-tt/sparkle";

interface AttachmentCitationProps {
  attachmentCitation: AttachmentCitation;
  size?: FileCitationCardSize;
  variant?: FileCitationCardVariant;
}

export function AttachmentCitation({
  attachmentCitation,
  size = "md",
  variant = "card",
}: AttachmentCitationProps) {
  const { openFramePreview } = useFilePreviewContext();

  const isLoading =
    attachmentCitation.type === "file" &&
    attachmentCitation.isUploading === true;

  const isRegularFile =
    attachmentCitation.type === "file" &&
    attachmentCitation.attachmentCitationType !== "mcp";
  const uploadProgress = isRegularFile
    ? attachmentCitation.uploadProgress
    : null;
  const audioSizeBytes = isRegularFile ? attachmentCitation.size : undefined;

  const isTransferringBytes =
    isLoading && uploadProgress !== null && uploadProgress < 100;

  const isTranscribingAudio =
    isLoading && !isTransferringBytes && isAudioContentType(attachmentCitation);

  const transcriptionProgress = useTranscribingProgress({
    isTranscriptingInProgress: isTranscribingAudio,
    sizeBytes: audioSizeBytes ?? 0,
  });

  const getLoadingLabel = (): string | undefined => {
    if (isTransferringBytes) {
      return `Uploading… ${uploadProgress}%`;
    }
    if (isTranscribingAudio && transcriptionProgress !== null) {
      return `Transcribing… ${transcriptionProgress}%`;
    }
    // Bytes are in but the request is still open: the server is extracting/converting the file.
    if (isLoading && uploadProgress === 100) {
      return "Processing…";
    }
    return undefined;
  };
  const loadingLabel = getLoadingLabel();

  // Node citation: link to an external datasource document.
  if (attachmentCitation.type === "node") {
    const tooltipContent = (
      <div className="flex flex-col gap-1">
        <div className="font-bold">{attachmentCitation.title}</div>
        <div className="flex gap-1 pt-1 text-sm">
          <Icon visual={attachmentCitation.spaceIcon} />
          <p>{attachmentCitation.spaceName}</p>
        </div>
        {/* The chip appends the description (path) to its tooltip itself. */}
        {variant === "card" && (
          <div className="text-sm text-muted-foreground">
            {attachmentCitation.path}
          </div>
        )}
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
      <FileCitationCard {...nodeBase} href={nodeUrl} />
    ) : (
      <FileCitationCard {...nodeBase} />
    );
  }

  const { fileId, contentType, title, sourceUrl } = attachmentCitation;
  const filePath =
    "filePath" in attachmentCitation ? attachmentCitation.filePath : undefined;

  if (fileId && !isLoading && isFrameContentType(contentType)) {
    return (
      <FileCitationCard
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
    <FileCitationCard {...fallbackBase} href={sourceUrl} />
  ) : (
    <FileCitationCard {...fallbackBase} />
  );
}
