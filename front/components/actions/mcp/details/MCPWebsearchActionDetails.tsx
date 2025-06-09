import {
  CollapsibleComponent,
  GlobeAltIcon,
  PaginatedCitationsGrid,
} from "@dust-tt/sparkle";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
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

  const websearchResults =
    action.output
      ?.filter(isWebsearchResultResourceType)
      .map((o) => o.resource) ?? [];

  return (
    <ActionDetailsWrapper
      actionName="Web search"
      defaultOpen={defaultOpen}
      visual={GlobeAltIcon}
    >
      <div className="flex flex-col gap-4 pl-6 pt-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-bold text-foreground dark:text-foreground-night">
            Query
          </span>
          <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night"></div>
        </div>
        <div>
          <CollapsibleComponent
            rootProps={{ defaultOpen }}
            triggerChildren={
              <span className="text-sm font-bold text-foreground dark:text-foreground-night">
                {queryResources.length > 0
                  ? queryResources.map((r) => r.text).join("\n")
                  : (action.params.query as string) ?? "No query provided"}
              </span>
            }
            contentChildren={
              <PaginatedCitationsGrid
                items={websearchResults.map((r) => ({
                  description: r.text,
                  title: r.title,
                  icon: getDocumentIcon("webcrawler"),
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
