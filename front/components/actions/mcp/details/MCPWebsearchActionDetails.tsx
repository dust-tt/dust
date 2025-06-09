import { GlobeAltIcon } from "@dust-tt/sparkle";

import { SearchResultDetails } from "@app/components/actions/mcp/details/MCPToolOutputDetails";
import { getDocumentIcon } from "@app/components/actions/retrieval/utils";
import type { ActionDetailsComponentBaseProps } from "@app/components/actions/types";
import type { MCPActionType } from "@app/lib/actions/mcp";
import {
  isWebsearchQueryResourceType,
  isWebsearchResultResourceType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";

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

  const websearchResults =
    action.output
      ?.filter(isWebsearchResultResourceType)
      .map((o) => o.resource) ?? [];

  return (
    <SearchResultDetails
      actionName="Web search"
      defaultOpen={defaultOpen}
      query={query}
      visual={GlobeAltIcon}
      results={websearchResults.map((r) => ({
        description: r.text,
        title: r.title,
        icon: getDocumentIcon("webcrawler"),
        href: r.uri,
      }))}
    />
  );
}
