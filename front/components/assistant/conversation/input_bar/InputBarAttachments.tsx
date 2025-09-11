// Okay to use public API types because it's front/connectors communication.
// eslint-disable-next-line dust/enforce-client-types-in-public-api
import { isFolder, isWebsite } from "@dust-tt/client";
import { CitationGrid, DoubleIcon, Icon } from "@dust-tt/sparkle";
import { useMemo } from "react";

import type {
  Attachment,
  FileAttachment,
  NodeAttachment,
} from "@app/components/assistant/conversation/AttachmentCitation";
import {
  AttachmentCitation,
  attachmentToAttachmentCitation,
} from "@app/components/assistant/conversation/AttachmentCitation";
import type { FileUploaderService } from "@app/hooks/useFileUploaderService";
import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers";
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
  files?: FileAttachmentsProps;
  nodes?: NodeAttachmentsProps;
}

export function InputBarAttachments({
  owner,
  files,
  nodes,
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

  // Convert file blobs to FileAttachment objects
  const fileAttachments: FileAttachment[] = useMemo(() => {
    return (
      files?.service.fileBlobs.map((blob) => ({
        type: "file",
        id: blob.id,
        title: blob.id,
        preview: blob.preview,
        contentType: blob.contentType,
        isUploading: blob.isUploading,
        onRemove: () => files.service.removeFile(blob.id),
      })) || []
    );
  }, [files?.service]);

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
          onRemove: () => nodes.onRemove(node),
        };
      }) || []
    );
  }, [nodes, spacesMap]);

  const allAttachments: Attachment[] = [...fileAttachments, ...nodeAttachments];

  if (allAttachments.length === 0) {
    return null;
  }

  return (
    <CitationGrid className="border-b border-separator px-3 pb-3 pt-3">
      {allAttachments.map((attachment) => {
        const attachmentCitation = attachmentToAttachmentCitation(attachment);
        return (
          <AttachmentCitation
            key={attachmentCitation.id}
            attachmentCitation={attachmentCitation}
            onRemove={attachment.onRemove}
          />
        );
      })}
    </CitationGrid>
  );
}
