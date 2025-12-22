import { ActionDetailsWrapper } from "@app/ui/components/actions/ActionDetailsWrapper";
import type { MCPActionDetailsProps } from "@app/ui/components/actions/mcp/details/MCPActionDetails";
import { RobotIcon } from "@dust-tt/sparkle";

export function MCPDeepDiveActionDetails({
  viewType,
}: MCPActionDetailsProps) {
  return (
    <ActionDetailsWrapper
      viewType={viewType}
      actionName="Hand off to Deep dive"
      visual={RobotIcon}
    />
  );
}
