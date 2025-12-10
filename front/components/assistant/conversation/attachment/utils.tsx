import {
  ActionVolumeUpIcon,
  DocumentIcon,
  DoubleIcon,
  DoubleQuotesIcon,
  FaviconIcon,
  FolderIcon,
  Icon,
  ImageIcon,
  TableIcon,
} from "@dust-tt/sparkle";
import type { ReactNode } from "react";
import React from "react";

import type {
  Attachment,
  AttachmentCitation,
  FileAttachmentCitation,
  MCPAttachmentCitation,
  NodeAttachmentCitation,
} from "@app/components/assistant/conversation/attachment/types";
import {
  getDisplayDateFromPastedFileId,
  getDisplayNameFromPastedFileId,
  isPastedFile,
} from "@app/components/assistant/conversation/input_bar/pasted_utils";
import type { MCPReferenceCitation } from "@app/components/markdown/MCPReferenceCitation";
import {
  getIcon,
  isCustomResourceIconType,
  isInternalAllowedIcon,
} from "@app/components/resources/resources_icons";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import type { ToolGeneratedFileType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers_ui";
import type {
  ConnectorProvider,
  ContentFragmentType,
  ContentNodeType,
} from "@app/types";
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

export const IconForAttachmentCitation = ({
  provider,
  nodeType,
  contentType,
  sourceUrl,
  iconName,
  size = "md",
}: {
  provider?: string;
  nodeType?: ContentNodeType;
  contentType?: string;
  sourceUrl?: string;
  iconName?: string;
  size?: "md" | "sm" | "lg";
}): ReactNode => {
  const { isDark } = useTheme();

  if (provider === "webcrawler") {
    return (
      <div className="flex h-6 w-6 items-center justify-center">
        <FaviconIcon size={size} websiteUrl={sourceUrl} />
      </div>
    );
  }

  if (provider && provider in CONNECTOR_CONFIGURATIONS) {
    const providerLogo = getConnectorProviderLogoWithFallback({
      provider: provider as ConnectorProvider,
      isDark,
    });

    const mainIcon =
      nodeType === "table"
        ? TableIcon
        : nodeType === "folder"
          ? FolderIcon
          : DocumentIcon;
    return (
      <DoubleIcon
        mainIcon={mainIcon}
        secondaryIcon={providerLogo}
        size={size}
      />
    );
  }

  if (contentType) {
    const isImageType = contentType.startsWith("image/");
    if (isImageType) {
      return <Icon visual={ImageIcon} size={size} />;
    }
    const isAudioType = contentType.startsWith("audio/");
    if (isAudioType) {
      return <Icon visual={ActionVolumeUpIcon} size={size} />;
    }
    if (isPastedFile(contentType)) {
      return <Icon visual={DoubleQuotesIcon} size={size} />;
    }
  }

  if (
    iconName &&
    (isCustomResourceIconType(iconName) || isInternalAllowedIcon(iconName))
  ) {
    return (
      <DoubleIcon
        mainIcon={DocumentIcon}
        secondaryIcon={getIcon(iconName)}
        size={size}
      />
    );
  }

  return <Icon visual={DocumentIcon} size={size} />;
};

export function contentFragmentToAttachmentCitation(
  contentFragment: ContentFragmentType
): FileAttachmentCitation | NodeAttachmentCitation {
  // Handle expired content fragments
  if (contentFragment.expiredReason) {
    return {
      type: "file",
      id: contentFragment.sId,
      title: `${contentFragment.title} (no longer available)`,
      visual: (
        <IconForAttachmentCitation contentType={contentFragment.contentType} />
      ),
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

    return {
      type: "node",
      id: contentFragment.sId,
      title: contentFragment.title,
      sourceUrl: contentFragment.sourceUrl,
      visual: (
        <IconForAttachmentCitation
          provider={provider ?? undefined}
          nodeType={nodeType}
          contentType={contentFragment.contentType}
          sourceUrl={contentFragment.sourceUrl ?? undefined}
        />
      ),
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
      visual: (
        <IconForAttachmentCitation contentType={contentFragment.contentType} />
      ),
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
): FileAttachmentCitation | NodeAttachmentCitation {
  if (attachment.type === "file") {
    return {
      type: "file",
      id: attachment.id,
      title: attachment.title,
      sourceUrl: attachment.sourceUrl ?? null,
      isUploading: attachment.isUploading,
      visual: (
        <IconForAttachmentCitation
          contentType={attachment.contentType}
          iconName={attachment.iconName}
        />
      ),
      description: attachment.description ?? null,
      fileId: attachment.fileId,
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
): MCPAttachmentCitation {
  return {
    id: citation.fileId,
    fileId: citation.fileId,
    attachmentCitationType: "mcp",
    contentType: citation.contentType,
    sourceUrl: citation.href ?? null,
    description: citation.description,
    title: citation.title,
    type: "file",
    visual: (
      <IconForAttachmentCitation
        provider={citation.provider}
        contentType={citation.contentType}
        sourceUrl={citation.href}
      />
    ),
    isUploading: false,
  };
}

export function toolGeneratedFileToAttachmentCitation(
  file: ToolGeneratedFileType & { sourceUrl: string }
): MCPAttachmentCitation {
  return {
    id: file.fileId,
    fileId: file.fileId,
    attachmentCitationType: "mcp",
    contentType: file.contentType,
    sourceUrl: file.sourceUrl,
    description: file.text,
    title: file.title,
    type: "file",
    visual: <IconForAttachmentCitation contentType={file.contentType} />,
    isUploading: false,
  };
}
