import { ActionDetailsWrapper } from "@app/ui/components/actions/ActionDetailsWrapper";
import type { MCPActionDetailsProps } from "@app/ui/components/actions/mcp/details/MCPActionDetails";
import { TableIcon } from "@dust-tt/sparkle";

export function MCPDataWarehousesBrowseDetails({
  viewType,
}: MCPActionDetailsProps) {
  return (
    <ActionDetailsWrapper
      viewType={viewType}
      actionName={
        viewType === "conversation"
          ? "Browsing Data Warehouses"
          : "Browse Data Warehouses"
      }
      visual={TableIcon}
    />
  );
}
