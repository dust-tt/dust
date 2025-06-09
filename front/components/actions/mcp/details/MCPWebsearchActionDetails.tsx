import { GlobeAltIcon } from "@dust-tt/sparkle";

import { SearchResultDetails } from "@app/components/actions/mcp/details/MCPToolOutputDetails";
import type { ActionDetailsComponentBaseProps } from "@app/components/actions/types";
import type { MCPActionType } from "@app/lib/actions/mcp";
import { isWebsearchQueryResourceType } from "@app/lib/actions/mcp_internal_actions/output_schemas";

export function MCPWebsearchActionDetails({
  action,
  defaultOpen,
}: ActionDetailsComponentBaseProps<MCPActionType>) {
  const queryResources =
    action.output
      ?.filter(isWebsearchQueryResourceType)
      .map((o) => o.resource) ?? [];

  const query =
    queryResources.length > 0
      ? queryResources.map((r) => r.text).join("\n")
      : (action.params.query as string) ?? "No query provided";

  return (
    <SearchResultDetails
      actionName="Web search"
      defaultOpen={defaultOpen}
      query={query}
      visual={GlobeAltIcon}
      results={action.output}
    />
  );
}
