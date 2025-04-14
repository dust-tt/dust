import { isFolder, isWebsite } from "@dust-tt/client";
import { DoubleIcon, Icon } from "@dust-tt/sparkle";
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
import {
  useCurrentChat,
  useCurrentChatActions,
} from "@app/lib/stores/ChatStoreProvider";

interface FileAttachmentsProps {
  service: FileUploaderService;
}

interface NodeAttachmentsProps {
  spacesMap: {
    [k: string]: {
      name: string;
      icon: React.ComponentType;
    };
  };
}

interface InputBarAttachmentsProps {
  files?: FileAttachmentsProps;
  nodes: NodeAttachmentsProps;
}

export function InputBarAttachments({
  files,
  nodes,
}: InputBarAttachmentsProps) {
  const { attachedNodes } = useCurrentChat();
  const { removeAttachedNode } = useCurrentChatActions();
  // Convert file blobs to FileAttachment objects
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

  // Convert content nodes to NodeAttachment objects
  const nodeAttachments: NodeAttachment[] = useMemo(() => {
    return (
      attachedNodes.map((node) => {
        const logo = getConnectorProviderLogoWithFallback({
          provider: node.dataSourceView.dataSource.connectorProvider,
        });

        const spaceName =
          nodes.spacesMap[node.dataSourceView.spaceId].name ?? "Unknown Space";
        const { dataSource } = node.dataSourceView;

        const isWebsiteOrFolder = isWebsite(dataSource) || isFolder(dataSource);
        const visual = isWebsiteOrFolder ? (
          <Icon visual={logo} />
        ) : (
          <DoubleIcon
            mainIconProps={{
              visual: getVisualForDataSourceViewContentNode(node),
              size: "md",
            }}
            secondaryIconProps={{
              visual: logo,
            }}
          />
        );

        return {
          type: "node",
          id: `${node.dataSourceView.dataSource.sId}-${node.internalId}`,
          title: node.title,
          url: node.sourceUrl,
          spaceName,
          spaceIcon: nodes.spacesMap[node.dataSourceView.spaceId].icon,
          path: getLocationForDataSourceViewContentNode(node),
          visual,
          onRemove: () => removeAttachedNode(node),
        };
      }) || []
    );
  }, [nodes, attachedNodes, removeAttachedNode]);

  const allAttachments: Attachment[] = [...fileAttachments, ...nodeAttachments];

  if (allAttachments.length === 0) {
    return null;
  }

  return (
    <div className="mr-3 flex gap-2 overflow-auto border-b border-separator pb-3 pt-3">
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
    </div>
  );
}
