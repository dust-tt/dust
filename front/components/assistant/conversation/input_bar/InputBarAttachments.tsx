import {
  Citation,
  CitationClose,
  CitationDescription,
  CitationIcons,
  CitationTitle,
  DocumentIcon,
  Icon,
  ImageIcon,
  Tooltip,
} from "@dust-tt/sparkle";
import type { DataSourceViewContentNode } from "@dust-tt/types";
import { useMemo } from "react";

import type { FileUploaderService } from "@app/hooks/useFileUploaderService";
import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers";
import {
  getLocationForDataSourceViewContentNode,
  getVisualForDataSourceViewContentNode,
} from "@app/lib/content_nodes";
import { isFolder, isWebsite } from "@app/lib/data_sources";

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
  path: string;
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

        const nodeId = node.internalId ?? `node-${node.internalId}`;
        const spaceName =
          nodes.spacesMap[node.dataSourceView.spaceId] ?? "Unknown Space";
        const { dataSource } = node.dataSourceView;

        return {
          type: "node",
          id: nodeId,
          title: node.title,
          spaceName,
          path: getLocationForDataSourceViewContentNode(node),
          visual:
            isWebsite(dataSource) || isFolder(dataSource) ? (
              <Icon visual={logo} size="sm" />
            ) : (
              <>
                {getVisualForDataSourceViewContentNode(node)({
                  className: "h-5 w-5",
                })}
                <Icon visual={logo} size="sm" />
              </>
            ),
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
    <div className="mr-3 flex gap-2 overflow-auto border-b border-separator pb-3 pt-3">
      {allAttachments.map((attachment) => (
        <Tooltip
          key={`${attachment.type}-${attachment.id}`}
          tooltipTriggerAsChild
          trigger={
            <Citation
              className="w-40"
              isLoading={attachment.type === "file" && attachment.isUploading}
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
                  <CitationIcons>
                    <Icon
                      visual={attachment.preview ? ImageIcon : DocumentIcon}
                    />
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
          }
          label={
            attachment.type === "file" ? (
              attachment.title
            ) : (
              <div className="flex flex-col gap-1">
                <div className="font-bold">{attachment.title}</div>
                <div className="text-sm text-element-600">
                  Path: {attachment.path}
                </div>
                <div className="text-sm text-element-600">
                  Space: {attachment.spaceName}
                </div>
              </div>
            )
          }
        />
      ))}
    </div>
  );
}
