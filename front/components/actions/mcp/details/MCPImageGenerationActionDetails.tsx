import { ActionImageIcon } from "@dust-tt/sparkle";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ToolExecutionDetailsProps } from "@app/components/actions/mcp/details/types";

export function MCPImageGenerationActionDetails({
  viewType,
}: ToolExecutionDetailsProps) {
  return (
    <ActionDetailsWrapper
      viewType={viewType}
      actionName={
        viewType === "conversation" ? "Generating image" : "Generate image"
      }
      visual={ActionImageIcon}
    />
  );
}
