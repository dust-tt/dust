import { GlobeAltIcon } from "@dust-tt/sparkle";

import { SearchResultDetails } from "@app/components/actions/mcp/details/MCPToolOutputDetails";
import type { ActionDetailsComponentBaseProps } from "@app/components/actions/types";
import type { MCPActionType } from "@app/lib/actions/mcp";

export function MCPWebsearchActionDetails({
  action,
  defaultOpen,
}: ActionDetailsComponentBaseProps<MCPActionType>) {
  return (
    <SearchResultDetails
      actionName="Web search"
      actionOutput={action.output}
      defaultOpen={defaultOpen}
      visual={GlobeAltIcon}
    />
  );
}
