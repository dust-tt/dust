import { Button, GlobeAltIcon } from "@dust-tt/sparkle";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { MCPActionDetailsProps } from "@app/components/actions/mcp/details/MCPActionDetails";
import { isBrowseResultResourceType } from "@app/lib/actions/mcp_internal_actions/output_schemas";

export function MCPBrowseActionDetails({
  action,
  viewType,
}: MCPActionDetailsProps) {
  const urls = action.params.urls as string[];
  const browseResults =
    action.output?.filter(isBrowseResultResourceType).map((o) => o.resource) ??
    [];

  return (
    <ActionDetailsWrapper
      viewType={viewType}
      actionName={
        viewType === "conversation" ? "Browsing the web" : "Web navigation"
      }
      visual={GlobeAltIcon}
    >
      <div className="flex flex-col gap-4 pl-6 pt-4">
        <div className="flex flex-col gap-1">
          <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
            {(viewType === "conversation" || browseResults.length === 0) && urls
              ? urls.map((url, idx) => (
                  <div
                    className="flex max-h-60 flex-col overflow-y-auto overflow-x-hidden pb-1"
                    key={idx}
                  >
                    <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                      {url}
                    </span>
                  </div>
                ))
              : browseResults.map((r, idx) => (
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
                      <span className="text-sm text-foreground dark:text-foreground-night">
                        Cannot fetch content for {r.uri}, error code:{" "}
                        {r.responseCode}. {r.errorMessage}
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
