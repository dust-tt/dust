import {
  ActionVolumeUpIcon,
  DocumentIcon,
  DoubleIcon,
  DoubleQuotesIcon,
  FolderIcon,
  Icon,
  ImageIcon,
  TableIcon,
} from "@dust-tt/sparkle";
import React from "react";

import type {
  Attachment,
  AttachmentCitation,
} from "@app/components/assistant/conversation/attachment/types";
import {
  getDisplayDateFromPastedFileId,
  getDisplayNameFromPastedFileId,
  isPastedFile,
} from "@app/components/assistant/conversation/input_bar/pasted_utils";
import type { MCPReferenceCitation } from "@app/components/markdown/MCPReferenceCitation";
import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers";
import type { ContentFragmentType } from "@app/types";
import {
  assertNever,
  isContentNodeContentFragment,
  isFileContentFragment,
} from "@app/types";

export const isTextualContentType = (
  attachmentCitation: AttachmentCitation
) => {
  if (attachmentCitation.type === "node") {
    return false;
  }
  const ct = attachmentCitation.contentType;
  return (
    ct.startsWith("text/") ||
    ct === "application/json" ||
    ct === "application/xml" ||
    ct === "application/vnd.dust.section.json"
  );
};
export const isAudioContentType = (attachmentCitation: AttachmentCitation) => {
  if (attachmentCitation.type === "node") {
    return false;
  }
  const ct = attachmentCitation.contentType;
  return ct.startsWith("audio/");
};

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
      attachmentCitationType: "fragment",
      sourceUrl: contentFragment.sourceUrl,
      description: null,
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
      attachmentCitationType: "fragment",
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
      description: description ?? null,
      fileId: contentFragment.fileId,
      contentType: contentFragment.contentType,
      attachmentCitationType: "fragment",
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
      sourceUrl: attachment.sourceUrl ?? null,
      isUploading: attachment.isUploading,
      visual: <IconFromContentType contentType={attachment.contentType} />,
      description: attachment.description ?? null,
      fileId: attachment.id,
      contentType: attachment.contentType,
      onRemove: attachment.onRemove,
      attachmentCitationType: "inputBar",
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
      attachmentCitationType: "inputBar",
    };
  }
}

export function markdownCitationToAttachmentCitation(
  citation: MCPReferenceCitation
): AttachmentCitation {
  return {
    id: citation.fileId,
    fileId: citation.fileId,
    attachmentCitationType: "mcp",
    contentType: citation.contentType,
    sourceUrl: citation.href ?? null,
    title: citation.title,
    type: "markdown",
    visual: <IconFromContentType contentType={citation.contentType} />,
    isUploading: false,
  };
}

export const IconFromContentType = ({
  contentType,
}: {
  contentType: string | undefined;
}) => {
  const visual = getContentTypeIcon(contentType);
  return <Icon visual={visual} size="md" />;
};
