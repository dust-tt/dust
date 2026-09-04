import type {
  FileCitationCardIcon,
  FileCitationCardSize,
} from "@app/components/assistant/conversation/attachment/FileCitationCard";
import { FileCitationCard } from "@app/components/assistant/conversation/attachment/FileCitationCard";
import { ConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { useFilePreviewContext } from "@app/components/assistant/conversation/FilePreviewContext";
import { useSendNotification } from "@app/hooks/useNotification";
import { getFileTypeIcon } from "@app/lib/file_icon_utils";
import {
  isFrameContentType,
  isSupportedImageContentType,
} from "@app/types/files";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import {
  Citation,
  CitationImage,
  Hoverable,
  Icon,
  Tooltip,
} from "@dust-tt/sparkle";
import type React from "react";
import { useContext } from "react";

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
  variant?: "card" | "inline";
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
  const { openFilePreview, resolveFileIdFromPath } = useFilePreviewContext();
  const sendNotification = useSendNotification();
  const sidePanel = useContext(ConversationSidePanelContext);

  const handleClick = async () => {
    if (isFrameContentType(contentType) && sidePanel) {
      try {
        const resolvedFileId =
          fileId ?? (filePath ? await resolveFileIdFromPath(filePath) : null);

        if (!resolvedFileId) {
          throw new Error("No linked file was found for this Frame.");
        }

        sidePanel.openPanel({
          type: "interactive_content",
          fileId: resolvedFileId,
        });
      } catch (error) {
        sendNotification({
          type: "error",
          title: "Failed to open Frame",
          description: normalizeError(error).message,
        });
      }
      return;
    }

    openFilePreview({ fileId, filePath, title, contentType });
  };

  if (variant === "inline") {
    const FileIcon = getFileTypeIcon(contentType, title);
    const inlineTooltipLabel =
      tooltipLabel ??
      (description ? (
        <div className="flex flex-col gap-0.5">
          <div>{title}</div>
          <div className="text-sm text-muted-foreground">{description}</div>
        </div>
      ) : (
        title
      ));

    return (
      <Tooltip
        tooltipTriggerAsChild
        trigger={
          <Hoverable variant="highlight" asChild>
            <button
              type="button"
              onClick={handleClick}
              className="inline-flex max-w-full items-baseline gap-1 align-baseline"
            >
              <Icon
                visual={FileIcon}
                size="xs"
                className="shrink-0 self-center"
              />
              <span className="truncate">{title}</span>
            </button>
          </Hoverable>
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
      icon={icon ?? FileIcon}
      title={title}
      description={description}
      size={size}
      isLoading={isLoading}
      loadingLabel={loadingLabel}
      onClick={handleClick}
      onRemove={onRemove}
      tooltipLabel={tooltipLabel ?? title}
    />
  );
}
