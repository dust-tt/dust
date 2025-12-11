// Okay to use public API types because it's front/connectors communication.
// eslint-disable-next-line dust/enforce-client-types-in-public-api
import { isFolder, isWebsite } from "@dust-tt/client";
import { CitationGrid, DoubleIcon, Icon } from "@dust-tt/sparkle";
import { useCallback, useMemo } from "react";

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
import { getSpaceIcon } from "@app/lib/spaces";
import { useSpaces } from "@app/lib/swr/spaces";
import type { DataSourceViewContentNode, LightWorkspaceType } from "@app/types";
import { GLOBAL_SPACE_NAME } from "@app/types";

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
  conversationId: string | null;
  disable?: boolean;
}

export function InputBarAttachments({
  owner,
  files,
  nodes,
  conversationId,
  disable = false,
}: InputBarAttachmentsProps) {
  const { spaces } = useSpaces({
    workspaceId: owner.sId,
    disabled: !nodes?.items.length,
  });
  const spacesMap = useMemo(
    () =>
      Object.fromEntries(
        spaces?.map((space) => [
          space.sId,
          {
            name: space.kind === "global" ? GLOBAL_SPACE_NAME : space.name,
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
        const visual = isWebsiteOrFolder ? (
          <Icon visual={logo} size="md" />
        ) : (
          <DoubleIcon
            mainIcon={getVisualForDataSourceViewContentNode(node)}
            secondaryIcon={logo}
            size="md"
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

  const allAttachments: Attachment[] = [...fileAttachments, ...nodeAttachments];

  if (allAttachments.length === 0) {
    return null;
  }

  return (
    <CitationGrid className="border-b border-separator px-3 pb-3 pt-3 dark:border-separator-night">
      {allAttachments.map((attachment, index) => {
        const attachmentCitation = attachmentToAttachmentCitation(attachment);
        return (
          <AttachmentCitation
            key={index}
            owner={owner}
            attachmentCitation={attachmentCitation}
            conversationId={conversationId}
          />
        );
      })}
    </CitationGrid>
  );
}
