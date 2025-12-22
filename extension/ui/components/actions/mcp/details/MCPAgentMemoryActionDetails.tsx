import { ActionDetailsWrapper } from "@app/ui/components/actions/ActionDetailsWrapper";
import type { MCPActionDetailsProps } from "@app/ui/components/actions/mcp/details/MCPActionDetails";
import { ActionLightbulbIcon } from "@dust-tt/sparkle";

export function MCPAgentMemoryRetrieveActionDetails({
  viewType,
}: MCPActionDetailsProps) {
  return (
    <ActionDetailsWrapper
      viewType={viewType}
      actionName="Retrieve Agent Memory"
      visual={ActionLightbulbIcon}
    />
  );
}

export function MCPAgentMemoryRecordActionDetails({
  viewType,
}: MCPActionDetailsProps) {
  return (
    <ActionDetailsWrapper
      viewType={viewType}
      actionName="Record Agent Memory"
      visual={ActionLightbulbIcon}
    />
  );
}

export function MCPAgentMemoryEditActionDetails({
  viewType,
  toolName,
}: MCPActionDetailsProps & { toolName: string }) {
  const actionName =
    toolName === "compact_memory"
      ? "Compact Agent Memory"
      : "Edit Agent Memory";

  return (
    <ActionDetailsWrapper
      viewType={viewType}
      actionName={actionName}
      visual={ActionLightbulbIcon}
    />
  );
}

export function MCPAgentMemoryEraseActionDetails({
  viewType,
}: MCPActionDetailsProps) {
  return (
    <ActionDetailsWrapper
      viewType={viewType}
      actionName="Erase Agent Memory"
      visual={ActionLightbulbIcon}
    />
  );
}
