import { RobotIcon } from "@dust-tt/sparkle";
import { ActionDetailsWrapper } from "@extension/ui/components/actions/ActionDetailsWrapper";
import type { MCPActionDetailsProps } from "@extension/ui/components/actions/mcp/details/MCPActionDetails";

export function MCPDeepDiveActionDetails({ viewType }: MCPActionDetailsProps) {
  return (
    <ActionDetailsWrapper
      viewType={viewType}
      actionName="Hand off to Deep dive"
      visual={RobotIcon}
    />
  );
}
