import { ClockIcon } from "@dust-tt/sparkle";

import { SearchResultDetails } from "@app/components/actions/mcp/details/MCPToolOutputDetails";
import { getDocumentIcon } from "@app/components/actions/retrieval/utils";
import type { ActionDetailsComponentBaseProps } from "@app/components/actions/types";
import type { MCPActionType } from "@app/lib/actions/mcp";
import {
  isIncludeQueryResourceType,
  isIncludeResultResourceType,
  isWarningResourceType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";

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

  const warningResource = (action.output
    ?.filter(isWarningResourceType)
    .map((o) => o.resource) ?? [])[0];

  const includeResults =
    action.output?.filter(isIncludeResultResourceType).map((o) => o.resource) ??
    [];

  return (
    <SearchResultDetails
      actionName="Include data"
      visual={ClockIcon}
      defaultOpen={defaultOpen}
      query={query}
      warning={warningResource}
      results={includeResults.map((r) => ({
        description: "",
        title: r.text,
        icon: getDocumentIcon(r.source.provider),
        href: r.uri,
      }))}
    />
  );
}
