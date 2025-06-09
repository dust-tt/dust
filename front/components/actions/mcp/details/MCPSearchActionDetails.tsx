import { MagnifyingGlassIcon } from "@dust-tt/sparkle";

import { SearchResultDetails } from "@app/components/actions/mcp/details/MCPToolOutputDetails";
import { getDocumentIcon } from "@app/components/actions/retrieval/utils";
import type { ActionDetailsComponentBaseProps } from "@app/components/actions/types";
import type { MCPActionType } from "@app/lib/actions/mcp";
import {
  isSearchQueryResourceType,
  isSearchResultResourceType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";

export function MCPSearchActionDetails({
  action,
  defaultOpen,
}: ActionDetailsComponentBaseProps<MCPActionType>) {
  const queryResources =
    action.output?.filter(isSearchQueryResourceType).map((o) => o.resource) ??
    [];

  const query =
    queryResources.length > 0
      ? queryResources.map((r) => r.text).join("\n")
      : JSON.stringify(action.params, undefined, 2);

  const searchResults =
    action.output?.filter(isSearchResultResourceType).map((o) => o.resource) ??
    [];

  return (
    <SearchResultDetails
      actionName="Search data"
      defaultOpen={defaultOpen}
      query={query}
      visual={MagnifyingGlassIcon}
      results={searchResults.map((r) => ({
        description: "",
        title: r.text,
        icon: getDocumentIcon(r.source.provider),
        href: r.uri,
      }))}
    />
  );
}
