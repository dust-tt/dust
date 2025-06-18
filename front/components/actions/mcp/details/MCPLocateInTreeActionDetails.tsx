import type { BreadcrumbItem } from "@dust-tt/sparkle";
import {
  ActionDocumentTextIcon,
  Breadcrumbs,
  ChevronRightIcon,
  DocumentIcon,
  FolderIcon,
  TableIcon,
} from "@dust-tt/sparkle";
import React from "react";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ActionDetailsComponentBaseProps } from "@app/components/actions/types";
import type { MCPActionType } from "@app/lib/actions/mcp";
import { isLocateInTreeResultType } from "@app/lib/actions/mcp_internal_actions/output_schemas";

function getNodeIcon(nodeType?: string) {
  switch (nodeType) {
    case "folder":
      return FolderIcon;
    case "table":
      return TableIcon;
    case "document":
    default:
      return DocumentIcon;
  }
}

export function MCPLocateInTreeActionDetails({
  action,
  defaultOpen,
}: ActionDetailsComponentBaseProps<MCPActionType>) {
  const locateInTreeResult = action.output
    ?.filter(isLocateInTreeResultType)
    .map((o) => o.resource)?.[0];

  if (!locateInTreeResult) {
    return null;
  }

  const { path, text } = locateInTreeResult;

  const breadcrumbItems: BreadcrumbItem[] = path.map((item) => ({
    icon: getNodeIcon(item.nodeType),
    label: item.title,
    isCurrent: item.isCurrentNode,
    // For the UI, we don't provide hrefs as these are just display paths
  }));

  return (
    <ActionDetailsWrapper
      actionName="Locate in tree"
      defaultOpen={defaultOpen}
      visual={ActionDocumentTextIcon}
    >
      <div className="flex flex-col gap-4 pl-6 pt-4">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-bold text-foreground dark:text-foreground-night">
            Path
          </span>
          <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
            {text}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-bold text-foreground dark:text-foreground-night">
            Location
          </span>
          <div className="bg-structure-50 dark:bg-structure-800 rounded-lg p-3">
            <Breadcrumbs items={breadcrumbItems} />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-bold text-foreground dark:text-foreground-night">
            Hierarchy
          </span>
          <div className="flex flex-col gap-1 text-sm">
            {path.map((item, index) => (
              <div
                key={item.nodeId}
                className={`flex items-center gap-2 ${
                  item.isCurrentNode
                    ? "font-semibold text-action-500 dark:text-action-400"
                    : "text-muted-foreground dark:text-muted-foreground-night"
                }`}
                style={{ paddingLeft: `${index * 16}px` }}
              >
                {index > 0 && (
                  <ChevronRightIcon className="h-3 w-3 text-muted-foreground dark:text-muted-foreground-night" />
                )}
                <span className="flex items-center gap-1">
                  {React.createElement(getNodeIcon(item.nodeType), {
                    className: "h-3 w-3",
                  })}
                  {item.title}
                  {item.isCurrentNode && (
                    <span className="ml-1 text-xs text-muted-foreground dark:text-muted-foreground-night">
                      (current)
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ActionDetailsWrapper>
  );
}