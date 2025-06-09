import { ClockIcon } from "@dust-tt/sparkle";

import { SearchResultDetails } from "@app/components/actions/mcp/details/MCPToolOutputDetails";
import type { ActionDetailsComponentBaseProps } from "@app/components/actions/types";
import type { MCPActionType } from "@app/lib/actions/mcp";
import { isIncludeQueryResourceType } from "@app/lib/actions/mcp_internal_actions/output_schemas";

export function MCPIncludeActionDetails({
  action,
  defaultOpen,
}: ActionDetailsComponentBaseProps<MCPActionType>) {
  const queryResource = (action.output
    ?.filter(isIncludeQueryResourceType)
    .map((o) => o.resource) ?? [])[0];

  const query = queryResource ? (
    <p>{queryResource.text}</p>
  ) : (
    <p>{JSON.stringify(action.params, undefined, 2)}</p>
  );

  return (
    <SearchResultDetails
      actionName="Include data"
      actionOutput={action.output}
      defaultOpen={defaultOpen}
      query={query}
      visual={ClockIcon}
    />
  );
}
