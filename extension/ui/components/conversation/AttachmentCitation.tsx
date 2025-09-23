import { getConnectorProviderLogoWithFallback } from "@app/shared/lib/connector_providers";
import type { ContentFragmentType } from "@dust-tt/client";
import {
  Citation,
  CitationClose,
  CitationDescription,
  CitationIcons,
  CitationImage,
  CitationTitle,
  DocumentIcon,
  DoubleIcon,
  FaviconIcon,
  FolderIcon,
  Icon,
  ImageIcon,
  TableIcon,
  Tooltip,
} from "@dust-tt/sparkle";
import React from "react";

export type FileAttachment = {
  type: "file";
  id: string;
  title: string;
  preview?: string;
  isUploading: boolean;
  onRemove: () => void;
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
}

interface FileAttachmentCitation extends BaseAttachmentCitation {
  type: "file";
  preview?: string;
  isUploading?: boolean;
  spaceName?: never;
  path?: never;
  spaceIcon?: never;
}

interface NodeAttachmentCitation extends BaseAttachmentCitation {
  type: "node";
  spaceName: string;
  path?: string;
  spaceIcon?: React.ComponentType;
  preview?: never;
  isUploading?: never;
}

export type AttachmentCitation =
  | FileAttachmentCitation
  | NodeAttachmentCitation;

type AttachmentCitationProps = {
  attachmentCitation: AttachmentCitation;
  onRemove?: () => void;
};

export function AttachmentCitation({
  attachmentCitation,
  onRemove,
}: AttachmentCitationProps) {
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

  return (
    <Tooltip
      trigger={
        <Citation
          href={attachmentCitation.sourceUrl ?? undefined}
          isLoading={
            attachmentCitation.type === "file" && attachmentCitation.isUploading
          }
          action={
            onRemove && (
              <CitationClose
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
              />
            )
          }
        >
          {attachmentCitation.type === "file" && attachmentCitation.preview && (
            <CitationImage imgSrc={attachmentCitation.preview} />
          )}
          <CitationIcons>{attachmentCitation.visual}</CitationIcons>
          <CitationTitle className="truncate text-ellipsis">
            {attachmentCitation.title}
          </CitationTitle>
          {attachmentCitation.type === "node" && (
            <CitationDescription className="truncate text-ellipsis">
              <span>
                {attachmentCitation.path || attachmentCitation.spaceName}
              </span>
            </CitationDescription>
          )}
        </Citation>
      }
      label={tooltipContent}
    />
  );
}

export function contentFragmentToAttachmentCitation(
  contentFragment: ContentFragmentType
): AttachmentCitation {
  if (contentFragment.contentFragmentType === "content_node") {
    const { provider, nodeType } = contentFragment.contentNodeData;
    const logo = getConnectorProviderLogoWithFallback({ provider });
    console.log("logo", logo);
    console.log("contentFragment.sourceUrl", contentFragment.sourceUrl);
    console.log("provider", provider);
    const visual =
      !provider || provider === "webcrawler" ? (
        contentFragment.sourceUrl ? (
          <FaviconIcon websiteUrl={contentFragment.sourceUrl} size="md" />
        ) : (
          <Icon visual={logo} size="md" />
        )
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

  const isImageType = contentFragment.contentType.startsWith("image/");
  return {
    type: "file",
    id: contentFragment.sId,
    title: contentFragment.title,
    sourceUrl: contentFragment.sourceUrl,
    visual: <Icon visual={isImageType ? ImageIcon : DocumentIcon} size="md" />,
  };
}

export function attachmentToAttachmentCitation(
  attachment: Attachment
): AttachmentCitation {
  if (attachment.type === "file") {
    return {
      type: "file",
      id: attachment.id,
      title: attachment.title,
      preview: attachment.preview,
      isUploading: attachment.isUploading,
      visual: (
        <Icon
          visual={attachment.preview ? ImageIcon : DocumentIcon}
          size="md"
        />
      ),
      sourceUrl: null,
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
    };
  }
}
