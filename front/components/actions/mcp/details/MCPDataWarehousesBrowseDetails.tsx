import {
  Citation,
  CitationIcons,
  CitationTitle,
  Icon,
  TableIcon,
} from "@dust-tt/sparkle";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ToolExecutionDetailsProps } from "@app/components/actions/mcp/details/types";
import { isWarehousesBrowseType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { getDocumentIcon } from "@app/lib/content_nodes";

export function MCPDataWarehousesBrowseDetails({
  toolOutput,
  viewType,
}: ToolExecutionDetailsProps) {
  const browseResult = toolOutput
    ?.filter(isWarehousesBrowseType)
    .map((o) => o.resource)?.[0];

  if (!browseResult) {
    return null;
  }

  const { nodeId, data } = browseResult;

  return (
    <ActionDetailsWrapper
      viewType={viewType}
      actionName={
        viewType === "conversation"
          ? "Browsing Data Warehouses"
          : "Browse Data Warehouses"
      }
      visual={TableIcon}
    >
      <div className="flex flex-col gap-4 pl-6 pt-4">
        {nodeId && (
          <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            <span className="font-medium">Browsing:</span> {nodeId}
          </div>
        )}

        {viewType === "sidebar" && data.length > 0 && (
          <div className="flex flex-col gap-2">
            {data.map((node, index) => {
              const IconComponent = getDocumentIcon(node.connectorProvider);
              const isTable = node.mimeType.includes("table");
              const isSchema = node.mimeType.includes("schema");
              const isDatabase = node.mimeType.includes("database");
              const isWarehouse = node.mimeType.includes("warehouse");

              return (
                <Citation
                  key={index}
                  onClick={
                    node.sourceUrl
                      ? () => window.open(node.sourceUrl ?? "", "_blank")
                      : undefined
                  }
                  tooltip={`${node.lastUpdatedAt ? ` • ${node.lastUpdatedAt}` : ""}`}
                >
                  <div className="flex gap-2">
                    <CitationIcons>
                      <Icon visual={IconComponent} />
                      {(isTable || isSchema || isDatabase || isWarehouse) && (
                        <Icon visual={TableIcon} size="xs" />
                      )}
                    </CitationIcons>
                    <CitationTitle>{node.title}</CitationTitle>
                  </div>

                  {node.parentTitle && (
                    <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
                      {node.parentTitle}
                    </span>
                  )}
                </Citation>
              );
            })}
          </div>
        )}
      </div>
    </ActionDetailsWrapper>
  );
}
