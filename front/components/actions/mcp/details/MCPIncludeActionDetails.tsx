import { ClockIcon } from "@dust-tt/sparkle";

import { SearchResultDetails } from "@app/components/actions/mcp/details/MCPToolOutputDetails";
import type { ActionDetailsComponentBaseProps } from "@app/components/actions/types";
import type { MCPActionType } from "@app/lib/actions/mcp";

export function MCPIncludeActionDetails({
  action,
  defaultOpen,
}: ActionDetailsComponentBaseProps<MCPActionType>) {
  return (
    <SearchResultDetails
      actionName="Include data"
      actionOutput={action.output}
      defaultOpen={defaultOpen}
      visual={ClockIcon}
    />
  );
}
