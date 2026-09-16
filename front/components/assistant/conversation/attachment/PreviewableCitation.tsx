import { AttachmentChipCitation } from "@app/components/assistant/conversation/attachment/AttachmentChipCitation";
import type {
  FileCitationCardIcon,
  FileCitationCardSize,
} from "@app/components/assistant/conversation/attachment/FileCitationCard";
import {
  FileCitationCard,
  FileCitationTooltipLabel,
} from "@app/components/assistant/conversation/attachment/FileCitationCard";
import { useFilePreviewContext } from "@app/components/assistant/conversation/FilePreviewContext";
import { getFileTypeIcon } from "@app/lib/file_icon_utils";
import {
  isFrameContentType,
  isSupportedImageContentType,
} from "@app/types/files";
import {
  Citation,
  CitationImage,
  Hoverable,
  Icon,
  Tooltip,
} from "@dust-tt/sparkle";
import type React from "react";

interface PreviewableCitationProps {
  containerClassName?: string;
  contentType: string;
  description?: React.ReactNode;
  downloadUrl?: string;
  fileId?: string | null;
  filePath?: string;
  // Icon for non-image citations, auto-computed from contentType and title if omitted.
  icon?: FileCitationCardIcon;
  isLoading?: boolean;
  loadingLabel?: string;
  onRemove?: () => void;
  size?: FileCitationCardSize;
  // Thumbnail shown inside CitationImage, required for image citations.
  thumbnailUrl?: string;
  title: string;
  tooltipLabel?: React.ReactNode;
  // `chip` is the composer attachment row; `inline` is a text-level reference.
  variant?: "card" | "chip" | "inline";
}

export function PreviewableCitation({
  containerClassName,
  contentType,
  description,
  downloadUrl,
  fileId,
  filePath,
  icon,
  isLoading,
  loadingLabel,
  onRemove,
  size = "md",
  thumbnailUrl,
  title,
  tooltipLabel,
  variant = "card",
}: PreviewableCitationProps) {
  // Previews render in the side panel, so without one the citation is static.
  const { canPreview, openFilePreview, openFramePreview } =
    useFilePreviewContext();

  const handleClick = async () => {
    if (isFrameContentType(contentType)) {
      await openFramePreview({ fileId, filePath });
      return;
    }

    openFilePreview({ fileId, filePath, contentType });
  };

  if (variant === "inline") {
    const FileIcon = getFileTypeIcon(contentType, title);
    const inlineTooltipLabel =
      tooltipLabel ??
      (description ? (
        <FileCitationTooltipLabel title={title} description={description} />
      ) : (
        title
      ));

    const inlineContent = (
      <>
        <Icon visual={FileIcon} size="xs" className="shrink-0 self-center" />
        <span className="truncate">{title}</span>
      </>
    );
    const inlineClassName =
      "inline-flex max-w-full items-baseline gap-1 align-baseline";

    return (
      <Tooltip
        tooltipTriggerAsChild
        trigger={
          canPreview ? (
            <Hoverable variant="highlight" asChild>
              <button
                type="button"
                onClick={handleClick}
                className={inlineClassName}
              >
                {inlineContent}
              </button>
            </Hoverable>
          ) : (
            <span className={inlineClassName}>{inlineContent}</span>
          )
        }
        label={inlineTooltipLabel}
      />
    );
  }

  if (isSupportedImageContentType(contentType) && thumbnailUrl) {
    return (
      <Tooltip
        trigger={
          <Citation
            isLoading={isLoading}
            compact={size !== "md"}
            containerClassName={containerClassName ?? "h-full min-h-24"}
          >
            <CitationImage
              imgSrc={thumbnailUrl ?? ""}
              downloadUrl={downloadUrl}
              title={title}
              isLoading={isLoading}
              onClose={onRemove}
              onClick={canPreview ? handleClick : undefined}
            />
          </Citation>
        }
        label={tooltipLabel ?? title}
      />
    );
  }

  const FileIcon = getFileTypeIcon(contentType, title);
  const cardProps = {
    icon: icon ?? FileIcon,
    title,
    description,
    size,
    isLoading,
    loadingLabel,
    onRemove,
    tooltipLabel: tooltipLabel ?? title,
  };

  if (variant === "chip") {
    return canPreview ? (
      <AttachmentChipCitation {...cardProps} onClick={handleClick} />
    ) : (
      <AttachmentChipCitation {...cardProps} />
    );
  }

  return canPreview ? (
    <FileCitationCard {...cardProps} onClick={handleClick} />
  ) : (
    <FileCitationCard {...cardProps} />
  );
}
