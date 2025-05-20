import {
  CollapsibleComponent,
  MagnifyingGlassIcon,
  PaginatedCitationsGrid,
} from "@dust-tt/sparkle";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
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

  const searchResults =
    action.output?.filter(isSearchResultResourceType).map((o) => o.resource) ??
    [];

  return (
    <ActionDetailsWrapper
      actionName={"Search data"}
      defaultOpen={defaultOpen}
      visual={MagnifyingGlassIcon}
    >
      <div className="flex flex-col gap-4 pl-6 pt-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-bold text-foreground dark:text-foreground-night">
            Query
          </span>
          <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
            {queryResources.length > 0
              ? queryResources.map((r) => r.text).join("\n")
              : JSON.stringify(action.params, undefined, 2)}
          </div>
        </div>
        <div>
          <CollapsibleComponent
            rootProps={{ defaultOpen }}
            triggerChildren={
              <span className="text-sm font-bold text-foreground dark:text-foreground-night">
                Results
              </span>
            }
            contentChildren={
              <PaginatedCitationsGrid
                items={searchResults.map((r) => ({
                  description: "",
                  title: r.text,
                  icon: getDocumentIcon(r.source.provider),
                  href: r.uri,
                }))}
              />
            }
          />
        </div>
      </div>
    </ActionDetailsWrapper>
  );
}
