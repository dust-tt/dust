import {
  Citation,
  CitationClose,
  CitationDescription,
  CitationIcons,
  CitationTitle,
  Icon,
} from "@dust-tt/sparkle";
import type { DataSourceViewContentNode } from "@dust-tt/types";

import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers";
import {
  getLocationForDataSourceViewContentNode,
  getVisualForDataSourceViewContentNode,
} from "@app/lib/content_nodes";

interface InputBarNodeAttachmentsProps {
  nodes: DataSourceViewContentNode[];
  spacesMap: Record<string, string>;
  onRemoveNode: (node: DataSourceViewContentNode) => void;
}

export function InputBarNodeAttachments({
  nodes,
  spacesMap,
  onRemoveNode,
}: InputBarNodeAttachmentsProps) {
  if (nodes.length === 0) {
    return null;
  }

  return (
    <div className="mr-3 flex gap-2 overflow-auto border-b border-separator pb-3 pt-3">
      {nodes.map((node, index) => {
        const logo = getConnectorProviderLogoWithFallback({
          provider: node.dataSourceView.dataSource.connectorProvider,
        });
        return (
          <Citation
            key={`attached-node-${index}`}
            className="w-40"
            action={<CitationClose onClick={() => onRemoveNode(node)} />}
          >
            <CitationIcons>
              {getVisualForDataSourceViewContentNode(node)({
                className: "min-w-4",
              })}
              <Icon visual={logo} />
            </CitationIcons>
            <CitationTitle>{node.title}</CitationTitle>
            <CitationDescription>
              {`${spacesMap[node.dataSourceView.spaceId]} - ${getLocationForDataSourceViewContentNode(node)}`}
            </CitationDescription>
          </Citation>
        );
      })}
    </div>
  );
}
