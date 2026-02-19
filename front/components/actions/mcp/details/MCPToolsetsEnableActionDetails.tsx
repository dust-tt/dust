import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ToolExecutionDetailsProps } from "@app/components/actions/mcp/details/types";
import { BoltIcon } from "@dust-tt/sparkle";

export function MCPToolsetsEnableActionDetails({
  displayContext,
}: ToolExecutionDetailsProps) {
  return (
    <ActionDetailsWrapper
      displayContext={displayContext}
      actionName={
        displayContext === "conversation" ? "Enabled tool" : "Enable tool"
      }
      visual={BoltIcon}
    />
  );
}
