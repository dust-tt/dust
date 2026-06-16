import { FileCitationCard } from "@app/components/assistant/conversation/attachment/FileCitationCard";
import { useFilePreviewContext } from "@app/components/assistant/conversation/FilePreviewContext";
import { getFileTypeIcon } from "@app/lib/file_icon_utils";
import { isSupportedImageContentType } from "@app/types/files";
import { Citation, CitationImage, Icon, Tooltip } from "@dust-tt/sparkle";
import type React from "react";

interface PreviewableCitationProps {
  compact?: boolean;
  containerClassName?: string;
  contentType: string;
  description?: React.ReactNode;
  downloadUrl?: string;
  fileId?: string | null;
  filePath?: string;
  // Icon for non-image citations, auto-computed from contentType and title if omitted.
  icon?: React.ReactNode;
  isLoading?: boolean;
  loadingLabel?: string;
  onRemove?: () => void;
  // Thumbnail shown inside CitationImage, required for image citations.
  thumbnailUrl?: string;
  title: string;
  tooltipLabel?: React.ReactNode;
}

export function PreviewableCitation({
  compact,
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
  thumbnailUrl,
  title,
  tooltipLabel,
}: PreviewableCitationProps) {
  const { openFilePreview } = useFilePreviewContext();

  const handleClick = () =>
    openFilePreview({ fileId, filePath, title, contentType });

  if (isSupportedImageContentType(contentType)) {
    return (
      <Tooltip
        trigger={
          <Citation
            isLoading={isLoading}
            compact={compact}
            containerClassName={containerClassName ?? "h-full min-h-24"}
          >
            <CitationImage
              imgSrc={thumbnailUrl ?? ""}
              downloadUrl={downloadUrl}
              title={title}
              isLoading={isLoading}
              onClose={onRemove}
              onClick={handleClick}
            />
          </Citation>
        }
        label={tooltipLabel ?? title}
      />
    );
  }

  const FileIcon = getFileTypeIcon(contentType, title);
  return (
    <FileCitationCard
      icon={icon ?? <Icon visual={FileIcon} size="xs" />}
      title={title}
      description={description}
      compact={compact}
      isLoading={isLoading}
      loadingLabel={loadingLabel}
      onClick={handleClick}
      onRemove={onRemove}
      tooltipLabel={tooltipLabel ?? title}
    />
  );
}
