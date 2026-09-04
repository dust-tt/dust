// Okay to use public API types because it's front/connectors communication.

import { AttachmentCitation } from "@app/components/assistant/conversation/attachment/AttachmentCitation";
import type {
  Attachment,
  FileAttachment,
  NodeAttachment,
} from "@app/components/assistant/conversation/attachment/types";
import { attachmentToAttachmentCitation } from "@app/components/assistant/conversation/attachment/utils";
import {
  getDisplayDateFromPastedFileId,
  getDisplayNameFromPastedFileId,
  isPastedFile,
} from "@app/components/assistant/conversation/input_bar/pasted_utils";
import type {
  FileBlob,
  FileUploaderService,
} from "@app/hooks/useFileUploaderService";
import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers_ui";
import {
  getLocationForDataSourceViewContentNode,
  getVisualForDataSourceViewContentNode,
} from "@app/lib/content_nodes";
import { getSpaceIcon, getSpaceName } from "@app/lib/spaces";
import { useSpaces } from "@app/lib/swr/spaces";
import type { DataSourceViewContentNode } from "@app/types/data_source_view";
import { isSupportedImageContentType } from "@app/types/files";
import type { LightWorkspaceType } from "@app/types/user";
// biome-ignore lint/plugin/enforceClientTypesInPublicApi: existing usage
import { isFolder, isWebsite } from "@dust-tt/client";
import { DoubleIcon, Icon } from "@dust-tt/sparkle";
import partition from "lodash/partition";
import { useCallback, useMemo } from "react";

interface FileAttachmentsProps {
  service: FileUploaderService;
}

interface NodeAttachmentsProps {
  items: DataSourceViewContentNode[];
  onRemove: (node: DataSourceViewContentNode) => void;
}

interface InputBarAttachmentsProps {
  owner: LightWorkspaceType;
  files: FileAttachmentsProps;
  nodes?: NodeAttachmentsProps;
  disable?: boolean;
}

// Sparkle's Citation enforces min-w-24: a smaller square would overflow it.
const IMAGE_ATTACHMENT_CONTAINER_CLASS = "size-24";

// Images keep a thumbnail preview; the preview URL only arrives once the upload
// completes, so uploading images reserve their slot to avoid a layout shift.
// Once uploaded, the preview needs both the URL and the file id (to open it).
function isPreviewableImageAttachment(attachment: FileAttachment): boolean {
  return (
    isSupportedImageContentType(attachment.contentType) &&
    (attachment.isUploading ||
      (!!attachment.sourceUrl && attachment.fileId !== null))
  );
}

export function InputBarAttachments({
  owner,
  files,
  nodes,
  disable = false,
}: InputBarAttachmentsProps) {
  const { spaces } = useSpaces({
    workspaceId: owner.sId,
    kinds: ["global", "regular", "project"],
    disabled: !nodes?.items.length,
  });
  const spacesMap = useMemo(
    () =>
      Object.fromEntries(
        spaces?.map((space) => [
          space.sId,
          {
            name: getSpaceName(space),
            icon: getSpaceIcon(space),
          },
        ]) || []
      ),
    [spaces]
  );

  const fileService = files.service;

  const createFileAttachment = useCallback(
    (blob: FileBlob): FileAttachment => {
      const isPasted = isPastedFile(blob.contentType);
      const title = isPasted
        ? getDisplayNameFromPastedFileId(blob.id)
        : blob.filename;
      const uploadDate = isPasted
        ? getDisplayDateFromPastedFileId(blob.id)
        : undefined;

      return {
        type: "file",
        id: blob.id,
        title,
        sourceUrl: blob.sourceUrl,
        contentType: blob.contentType,
        isUploading: blob.isUploading,
        size: blob.size,
        description: uploadDate,
        iconName: blob.iconName,
        provider: blob.provider,
        fileId: blob.fileId,
        onRemove: disable ? undefined : () => fileService.removeFile(blob.id),
      };
    },
    [disable, fileService]
  );

  // Convert file blobs to FileAttachments (open in viewer dialog).
  const fileAttachments: FileAttachment[] = useMemo(() => {
    return fileService.fileBlobs.map((blob) => createFileAttachment(blob));
  }, [fileService, createFileAttachment]);

  // Convert content nodes to NodeAttachment objects
  const nodeAttachments: NodeAttachment[] = useMemo(() => {
    return (
      nodes?.items.map((node) => {
        const logo = getConnectorProviderLogoWithFallback({
          provider: node.dataSourceView.dataSource.connectorProvider,
        });

        const spaceName =
          spacesMap[node.dataSourceView.spaceId].name ?? "Unknown Space";
        const { dataSource } = node.dataSourceView;

        const isWebsiteOrFolder = isWebsite(dataSource) || isFolder(dataSource);
        // Rendered visuals keep their own size inside the chip (see
        // FileCitationCard), so match AttachmentChip's default icon size.
        const visual = isWebsiteOrFolder ? (
          <Icon visual={logo} size="sm" />
        ) : (
          <DoubleIcon
            mainIcon={getVisualForDataSourceViewContentNode(node)}
            secondaryIcon={logo}
            size="sm"
          />
        );

        return {
          type: "node",
          id: `${node.dataSourceView.dataSource.sId}-${node.internalId}`,
          title: node.title,
          url: node.sourceUrl,
          spaceName,
          spaceIcon: spacesMap[node.dataSourceView.spaceId].icon,
          path: getLocationForDataSourceViewContentNode(node),
          visual,
          onRemove: disable ? undefined : () => nodes.onRemove(node),
        };
      }) ?? []
    );
  }, [nodes, spacesMap, disable]);

  const [imageAttachments, otherFileAttachments] = partition(
    fileAttachments,
    isPreviewableImageAttachment
  );
  const chipAttachments: Attachment[] = [
    ...otherFileAttachments,
    ...nodeAttachments,
  ];

  if (imageAttachments.length === 0 && chipAttachments.length === 0) {
    return null;
  }

  // One wrapping row, top-aligned: image previews first, then chips alongside.
  return (
    <div className="flex flex-wrap items-start gap-2 border-b border-separator px-3 pb-3 pt-3">
      {imageAttachments.map((attachment) => (
        <AttachmentCitation
          key={attachment.id}
          attachmentCitation={attachmentToAttachmentCitation(attachment)}
          imageContainerClassName={IMAGE_ATTACHMENT_CONTAINER_CLASS}
          // Too small for a legible title; the tooltip carries the name.
          imageTitlePosition="hidden"
        />
      ))}
      {chipAttachments.map((attachment) => (
        <AttachmentCitation
          key={attachment.id}
          attachmentCitation={attachmentToAttachmentCitation(attachment, {
            iconSize: "sm",
          })}
          size="xs"
        />
      ))}
    </div>
  );
}
