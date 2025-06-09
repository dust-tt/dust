import { Chip, ClockIcon, Tooltip } from "@dust-tt/sparkle";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
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

  const warningResource = (action.output
    ?.filter(isWarningResourceType)
    .map((o) => o.resource) ?? [])[0];

  const includeResults =
    action.output?.filter(isIncludeResultResourceType).map((o) => o.resource) ??
    [];

  return (
    <ActionDetailsWrapper
      actionName={"Include data"}
      defaultOpen={defaultOpen}
      visual={ClockIcon}
    >
      <div className="flex flex-col gap-4 pl-6 pt-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-bold text-foreground dark:text-foreground-night">
            Timeframe
          </span>
          <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
            {queryResource ? (
              <p>{queryResource.text}</p>
            ) : (
              <p>{JSON.stringify(action.params, undefined, 2)}</p>
            )}
          </div>
          {warningResource && (
            <Tooltip
              label={warningResource.text}
              trigger={
                <Chip color="warning" label={warningResource.warningTitle} />
              }
            />
          )}
        </div>
        <div>
          <SearchResultDetails
            defaultOpen={defaultOpen}
            query="Results"
            items={includeResults.map((r) => ({
              description: "",
              title: r.text,
              icon: getDocumentIcon(r.source.provider),
              href: r.uri,
            }))}
          />
        </div>
      </div>
    </ActionDetailsWrapper>
  );
}
