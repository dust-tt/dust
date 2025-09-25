import { getConnectorProviderLogoWithFallback } from "@app/shared/lib/connector_providers";
import {
  getLocationForDataSourceViewContentNode,
  getVisualForDataSourceViewContentNode,
} from "@app/shared/lib/content_nodes";
import type {
  Attachment,
  FileAttachment,
  NodeAttachment,
} from "@app/ui/components/conversation/AttachmentCitation";
import {
  AttachmentCitation,
  attachmentToAttachmentCitation,
} from "@app/ui/components/conversation/AttachmentCitation";
import type { FileUploaderService } from "@app/ui/hooks/useFileUploaderService";
import type { DataSourceViewContentNodeType } from "@dust-tt/client";
import { isFolder, isWebsite } from "@dust-tt/client";
import { CitationGrid, DoubleIcon, Icon } from "@dust-tt/sparkle";
import { useMemo } from "react";

interface FileAttachmentsProps {
  service: FileUploaderService;
}

interface NodeAttachmentsProps {
  items: DataSourceViewContentNodeType[];
  spacesMap: {
    [k: string]: {
      name: string;
      icon: React.ComponentType;
    };
  };
  onRemove: (node: DataSourceViewContentNodeType) => void;
}
interface InputBarAttachmentsProps {
  files?: FileAttachmentsProps;
  nodes?: NodeAttachmentsProps;
}

export function InputBarAttachments({
  files,
  nodes,
}: InputBarAttachmentsProps) {
  const fileAttachments: FileAttachment[] = useMemo(() => {
    return (
      files?.service.fileBlobs.map((blob) => ({
        type: "file",
        id: blob.id,
        title: blob.id,
        preview: blob.preview,
        isUploading: blob.isUploading,
        onRemove: () => files.service.removeFile(blob.id),
      })) || []
    );
  }, [files?.service]);

  const nodeAttachments: NodeAttachment[] = useMemo(() => {
    return (
      nodes?.items.map((node) => {
        const logo = getConnectorProviderLogoWithFallback({
          provider: node.dataSourceView.dataSource.connectorProvider,
        });

        const spaceName =
          nodes.spacesMap[node.dataSourceView.spaceId].name ?? "Unknown Space";
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
          url: node.sourceUrl ?? null,
          spaceName,
          spaceIcon: nodes.spacesMap[node.dataSourceView.spaceId].icon,
          path: getLocationForDataSourceViewContentNode(node),
          visual,
          onRemove: () => nodes.onRemove(node),
        };
      }) || []
    );
  }, [nodes]);

  const allAttachments: Attachment[] = [...fileAttachments, ...nodeAttachments];

  if (allAttachments.length === 0) {
    return null;
  }

  return (
    <CitationGrid className="mr-3 border-b border-separator dark:border-separator-night pb-3 pt-3">
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
