import { ActionDetailsWrapper } from "@app/ui/components/actions/ActionDetailsWrapper";
import type { MCPActionDetailsProps } from "@app/ui/components/actions/mcp/details/MCPActionDetails";
import { ActionPinDistanceIcon, DocumentIcon } from "@dust-tt/sparkle";

export function DataSourceNodeContentDetails({
  viewType,
}: MCPActionDetailsProps) {
  return (
    <ActionDetailsWrapper
      viewType={viewType}
      actionName={
        viewType === "conversation"
          ? "Retrieving file content"
          : "Retrieve file content"
      }
      visual={DocumentIcon}
    >
      <></>
    </ActionDetailsWrapper>
  );
}

export function FilesystemPathDetails({ viewType }: MCPActionDetailsProps) {
  return (
    <ActionDetailsWrapper
      viewType={viewType}
      actionName={viewType === "conversation" ? "Locating item" : "Locate item"}
      visual={ActionPinDistanceIcon}
    >
      <></>
    </ActionDetailsWrapper>
  );
}
