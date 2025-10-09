import {
  ActionVolumeUpIcon,
  Citation,
  CitationClose,
  CitationDescription,
  CitationIcons,
  CitationImage,
  CitationTitle,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DocumentIcon,
  DoubleIcon,
  DoubleQuotesIcon,
  FolderIcon,
  Icon,
  ImageIcon,
  TableIcon,
  Tooltip,
} from "@dust-tt/sparkle";
import React, { useState } from "react";

import type { FileUploaderService } from "@app/hooks/useFileUploaderService";
import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers";
import type {
  ContentFragmentType,
  SupportedContentFragmentType,
  SupportedFileContentType,
} from "@app/types";
import { isSupportedImageContentType } from "@app/types";
import {
  assertNever,
  isContentNodeContentFragment,
  isFileContentFragment,
} from "@app/types";

import {
  getDisplayDateFromPastedFileId,
  getDisplayNameFromPastedFileId,
  isPastedFile,
} from "./input_bar/pasted_utils";

export type FileAttachment = {
  type: "file";
  id: string;
  title: string;
  contentType: SupportedFileContentType;
  isUploading: boolean;
  onRemove: () => void;
  description?: string;
  sourceUrl?: string;
};

export type NodeAttachment = {
  type: "node";
  id: string;
  title: string;
  spaceName: string;
  spaceIcon: React.ComponentType;
  visual: React.ReactNode;
  path: string;
  onRemove: () => void;
  url: string | null;
};

export type Attachment = FileAttachment | NodeAttachment;

interface BaseAttachmentCitation {
  id: string;
  title: string;
  sourceUrl?: string | null;
  visual: React.ReactNode;
  onRemove?: () => void;
}

interface FileAttachmentCitation extends BaseAttachmentCitation {
  type: "file";

  contentType: SupportedContentFragmentType;
  description?: string;
  fileId: string | null;
  isUploading?: boolean;
}

interface NodeAttachmentCitation extends BaseAttachmentCitation {
  type: "node";

  path?: string;
  spaceIcon?: React.ComponentType;
  spaceName: string;
}

export type AttachmentCitation =
  | FileAttachmentCitation
  | NodeAttachmentCitation;

interface AttachmentCitationProps {
  attachmentCitation: AttachmentCitation;
  fileUploaderService: FileUploaderService;
}

function getContentTypeIcon(
  contentType: string | undefined
): React.ComponentType {
  if (!contentType) {
    return DocumentIcon;
  }
  const isImageType = contentType.startsWith("image/");
  if (isImageType) {
    return ImageIcon;
  }
  const isAudioType = contentType.startsWith("audio/");
  if (isAudioType) {
    return ActionVolumeUpIcon;
  }
  if (isPastedFile(contentType)) {
    return DoubleQuotesIcon;
  }
  return DocumentIcon;
}

export function AttachmentCitation({
  attachmentCitation,
  fileUploaderService,
}: AttachmentCitationProps) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerTitle, setViewerTitle] = useState("");
  const [viewerText, setViewerText] = useState("");

  const openPastedViewer = async (attachmentCitation: AttachmentCitation) => {
    if (attachmentCitation.type !== "file") {
      return;
    }
    if (!attachmentCitation.fileId) {
      return;
    }
    const blob = fileUploaderService.getFileBlob(attachmentCitation.fileId);
    if (!blob) {
      return;
    }
    const text = await blob.file.text();
    setViewerTitle(attachmentCitation.title);
    setViewerText(text);
    setViewerOpen(true);
  };

  const isTextualContentType = (attachmentCitation: AttachmentCitation) => {
    if (attachmentCitation.type !== "file") {
      return false;
    }
    const ct = attachmentCitation.contentType;
    if (!ct) {
      return false;
    }
    return (
      ct.startsWith("text/") ||
      ct === "application/json" ||
      ct === "application/xml" ||
      ct === "application/vnd.dust.section.json"
    );
  };
  const onClick = isTextualContentType(attachmentCitation)
    ? () => openPastedViewer(attachmentCitation)
    : undefined;

  // citation cannot have href and onClick at the same time
  const citationInteractionProps = onClick
    ? {
        onClick: async (e: React.MouseEvent<HTMLDivElement>) => {
          e.preventDefault();
          await onClick();
        },
      }
    : {
        href: attachmentCitation.sourceUrl ?? "",
      };

  const tooltipContent =
    attachmentCitation.type === "file" ? (
      attachmentCitation.title
    ) : (
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

  const previewImageUrl =
    attachmentCitation.type === "file" &&
    isSupportedImageContentType(attachmentCitation.contentType)
      ? `${attachmentCitation.sourceUrl}?action=view`
      : undefined;

  return (
    <>
      <Tooltip
        trigger={
          <Citation
            {...citationInteractionProps}
            isLoading={
              attachmentCitation.type === "file" &&
              attachmentCitation.isUploading
            }
            action={
              attachmentCitation.onRemove && (
                <CitationClose
                  onClick={(e) => {
                    e.stopPropagation();
                    attachmentCitation.onRemove &&
                      attachmentCitation.onRemove();
                  }}
                />
              )
            }
          >
            {previewImageUrl && <CitationImage imgSrc={previewImageUrl} />}
            <CitationIcons>{attachmentCitation.visual}</CitationIcons>
            <CitationTitle className="truncate text-ellipsis">
              {attachmentCitation.title}
            </CitationTitle>
            {attachmentCitation.type === "file" &&
              attachmentCitation.description && (
                <CitationDescription className="truncate text-ellipsis">
                  {attachmentCitation.description}
                </CitationDescription>
              )}
            {attachmentCitation.type === "node" && (
              <CitationDescription className="truncate text-ellipsis">
                <span>
                  {attachmentCitation.path ?? attachmentCitation.spaceName}
                </span>
              </CitationDescription>
            )}
          </Citation>
        }
        label={tooltipContent}
      />

      <Dialog open={viewerOpen} onOpenChange={setViewerOpen}>
        <DialogContent size="xl" height="lg">
          <DialogHeader>
            <DialogTitle>{viewerTitle}</DialogTitle>
          </DialogHeader>
          <DialogContainer>
            <pre className="m-0 max-h-[60vh] whitespace-pre-wrap break-words">
              {viewerText}
            </pre>
          </DialogContainer>
          <DialogFooter
            rightButtonProps={{
              label: "Close",
              variant: "highlight",
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

export function contentFragmentToAttachmentCitation(
  contentFragment: ContentFragmentType
): AttachmentCitation {
  // Handle expired content fragments
  if (contentFragment.expiredReason) {
    return {
      type: "file",
      id: contentFragment.sId,
      title: `${contentFragment.title} (no longer available)`,
      visual: <IconFromContentType contentType={contentFragment.contentType} />,
      fileId:
        contentFragment.contentFragmentType === "file"
          ? contentFragment.fileId
          : null,
      contentType: contentFragment.contentType,
    };
  }

  if (isContentNodeContentFragment(contentFragment)) {
    const { provider, nodeType } = contentFragment.contentNodeData;
    const logo = getConnectorProviderLogoWithFallback({ provider });

    const visual =
      !provider || provider === "webcrawler" ? (
        <Icon visual={logo} size="md" />
      ) : (
        <DoubleIcon
          mainIcon={
            nodeType === "table"
              ? TableIcon
              : nodeType === "folder"
                ? FolderIcon
                : DocumentIcon
          }
          secondaryIcon={logo}
          size="md"
        />
      );

    return {
      type: "node",
      id: contentFragment.sId,
      title: contentFragment.title,
      sourceUrl: contentFragment.sourceUrl,
      visual,
      spaceName: contentFragment.contentNodeData.spaceName,
    };
  }

  if (isFileContentFragment(contentFragment)) {
    // Compute custom title/description for pasted files
    const isPasted = isPastedFile(contentFragment.contentType);
    const title = isPasted
      ? getDisplayNameFromPastedFileId(contentFragment.title)
      : contentFragment.title;
    const description = isPasted
      ? getDisplayDateFromPastedFileId(contentFragment.title)
      : undefined;
    return {
      type: "file",
      id: contentFragment.sId,
      title,
      sourceUrl: contentFragment.sourceUrl,
      visual: <IconFromContentType contentType={contentFragment.contentType} />,
      description,
      fileId: contentFragment.fileId,
      contentType: contentFragment.contentType,
    };
  }

  assertNever(contentFragment);
}

export function attachmentToAttachmentCitation(
  attachment: Attachment
): AttachmentCitation {
  if (attachment.type === "file") {
    return {
      type: "file",
      id: attachment.id,
      title: attachment.title,
      sourceUrl: attachment.sourceUrl,
      isUploading: attachment.isUploading,
      visual: <IconFromContentType contentType={attachment.contentType} />,
      description: attachment.description,
      fileId: attachment.id,
      contentType: attachment.contentType,
      onRemove: attachment.onRemove,
    };
  } else {
    return {
      type: "node",
      id: attachment.id,
      title: attachment.title,
      spaceName: attachment.spaceName,
      spaceIcon: attachment.spaceIcon,
      path: attachment.path,
      visual: attachment.visual,
      sourceUrl: attachment.url,
      onRemove: attachment.onRemove,
    };
  }
}

const IconFromContentType = ({
  contentType,
}: {
  contentType: string | undefined;
}) => {
  const visual = getContentTypeIcon(contentType);
  return <Icon visual={visual} size="md" />;
};
