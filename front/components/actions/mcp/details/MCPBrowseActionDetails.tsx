import { Button, GlobeAltIcon } from "@dust-tt/sparkle";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ActionDetailsComponentBaseProps } from "@app/components/actions/types";
import type { MCPActionType } from "@app/lib/actions/mcp";
import { isBrowseResultResourceType } from "@app/lib/actions/mcp_internal_actions/output_schemas";

export function MCPBrowseActionDetails({
  action,
  defaultOpen,
}: ActionDetailsComponentBaseProps<MCPActionType>) {
  const browseResults =
    action.output?.filter(isBrowseResultResourceType).map((o) => o.resource) ??
    [];

  return (
    <ActionDetailsWrapper
      actionName="Web navigation"
      defaultOpen={defaultOpen}
      visual={GlobeAltIcon}
    >
      <div className="flex flex-col gap-4 pl-6 pt-4">
        <div className="flex flex-col gap-1">
          <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
            {browseResults.map((r, idx) => (
              <div
                className="flex max-h-60 flex-col gap-2 overflow-y-auto overflow-x-hidden pb-4"
                key={idx}
              >
                {r.responseCode === "200" ? (
                  <>
                    <Button
                      icon={GlobeAltIcon}
                      onClick={() => window.open(r.uri, "_blank")}
                      label={r.title ?? r.requestedUrl}
                      variant="outline"
                    />
                    <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                      {r.requestedUrl}
                    </span>
                    <span className="text-sm text-foreground dark:text-foreground-night">
                      {r.description ?? r.text.slice(0, 1024)}
                    </span>
                  </>
                ) : (
                  <span className="text-sm text-foreground">
                    Cannot fetch content for {r.uri}, error code :{" "}
                    {r.responseCode}.{r.errorMessage}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </ActionDetailsWrapper>
  );
}
