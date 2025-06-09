import { MagnifyingGlassIcon } from "@dust-tt/sparkle";

import { SearchResultDetails } from "@app/components/actions/mcp/details/MCPToolOutputDetails";
import type { ActionDetailsComponentBaseProps } from "@app/components/actions/types";
import type { MCPActionType } from "@app/lib/actions/mcp";

export function MCPSearchActionDetails({
  action,
  defaultOpen,
}: ActionDetailsComponentBaseProps<MCPActionType>) {
  return (
    <SearchResultDetails
      actionName="Search data"
      actionOutput={action.output}
      defaultOpen={defaultOpen}
      visual={MagnifyingGlassIcon}
    />
  );
}
