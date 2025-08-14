import { ActionDetailsWrapper } from "@app/ui/components/actions/ActionDetailsWrapper";
import type { MCPActionDetailsProps } from "@app/ui/components/actions/mcp/details/MCPActionDetails";
import { GlobeAltIcon } from "@dust-tt/sparkle";

export function MCPBrowseActionDetails({
  action,
  viewType,
}: MCPActionDetailsProps) {
  const urls = action.params.urls as string[];

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
            {urls.map((url, idx) => (
              <div
                className="flex max-h-60 flex-col overflow-y-auto overflow-x-hidden pb-1"
                key={idx}
              >
                <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                  {url}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ActionDetailsWrapper>
  );
}
