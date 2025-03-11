import {
  Citation,
  CitationClose,
  CitationDescription,
  CitationIcons,
  CitationImage,
  CitationTitle,
  DocumentIcon,
  Icon,
  ImageIcon,
} from "@dust-tt/sparkle";
import type { DataSourceViewContentNode } from "@dust-tt/types";

import type { FileUploaderService } from "@app/hooks/useFileUploaderService";
import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers";
import { getVisualForDataSourceViewContentNode } from "@app/lib/content_nodes";

type FileAttachment = {
  type: "file";
  id: string;
  title: string;
  preview?: string;
  isUploading: boolean;
  onRemove: () => void;
};

type NodeAttachment = {
  type: "node";
  id: string;
  title: string;
  spaceName: string;
  visual: React.ReactNode;
  onRemove: () => void;
};

type Attachment = FileAttachment | NodeAttachment;

interface FileAttachmentsProps {
  service: FileUploaderService;
}

interface NodeAttachmentsProps {
  items: DataSourceViewContentNode[];
  spacesMap: Record<string, string>;
  onRemove: (node: DataSourceViewContentNode) => void;
}

interface InputBarAttachmentsProps {
  files?: FileAttachmentsProps;
  nodes?: NodeAttachmentsProps;
}

export function InputBarAttachments({
  files,
  nodes,
}: InputBarAttachmentsProps) {
  const fileAttachments: FileAttachment[] =
    files?.service.fileBlobs.map((blob) => ({
      type: "file",
      id: blob.id,
      title: blob.id,
      preview: blob.preview,
      isUploading: blob.isUploading,
      onRemove: () => files.service.removeFile(blob.id),
    })) || [];

  const nodeAttachments: NodeAttachment[] =
    nodes?.items.map((node) => {
      const logo = getConnectorProviderLogoWithFallback({
        provider: node.dataSourceView.dataSource.connectorProvider,
      });

      const nodeId = node.internalId ?? `node-${node.internalId}`;
      const spaceName =
        nodes.spacesMap[node.dataSourceView.spaceId] ?? "Unknown Space";

      return {
        type: "node",
        id: nodeId,
        title: node.title,
        spaceName,
        visual: (
          <>
            {getVisualForDataSourceViewContentNode(node)({
              className: "h-5 w-5",
            })}
            <Icon visual={logo} size="sm" />
          </>
        ),
        onRemove: () => nodes.onRemove(node),
      };
    }) || [];

  const allAttachments: Attachment[] = [...fileAttachments, ...nodeAttachments];

  if (allAttachments.length === 0) {
    return null;
  }

  return (
    <div className="mr-3 flex gap-2 overflow-auto border-b border-separator pb-3 pt-3">
      {allAttachments.map((attachment) => (
        <Citation
          key={`${attachment.type}-${attachment.id}`}
          className="w-40"
          isLoading={attachment.type === "file" && attachment.isUploading}
          tooltip={attachment.type === "file" ? attachment.title : undefined}
          action={
            <CitationClose
              onClick={(e) => {
                e.stopPropagation();
                attachment.onRemove();
              }}
            />
          }
        >
          {attachment.type === "file" ? (
            <>
              {attachment.preview && (
                <CitationImage imgSrc={attachment.preview} />
              )}
              <CitationIcons>
                <Icon visual={attachment.preview ? ImageIcon : DocumentIcon} />
              </CitationIcons>
              <CitationTitle className="truncate">
                {attachment.title}
              </CitationTitle>
            </>
          ) : (
            <>
              <CitationIcons>{attachment.visual}</CitationIcons>
              <CitationTitle className="truncate">
                {attachment.title}
              </CitationTitle>
              <CitationDescription className="truncate">
                {attachment.spaceName}
              </CitationDescription>
            </>
          )}
        </Citation>
      ))}
    </div>
  );
}
