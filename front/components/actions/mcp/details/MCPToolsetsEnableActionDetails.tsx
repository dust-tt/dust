import { BoltIcon } from "@dust-tt/sparkle";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ToolExecutionDetailsProps } from "@app/components/actions/mcp/details/types";

export function MCPToolsetsEnableActionDetails({
  viewType,
}: ToolExecutionDetailsProps) {
  return (
    <ActionDetailsWrapper
      viewType={viewType}
      actionName={viewType === "conversation" ? "Enabled tool" : "Enable tool"}
      visual={BoltIcon}
    />
  );
}
