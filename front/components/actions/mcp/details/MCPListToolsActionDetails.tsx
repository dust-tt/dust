import { BoltIcon, Chip } from "@dust-tt/sparkle";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ToolExecutionDetailsProps } from "@app/components/actions/mcp/details/types";
import { getIcon } from "@app/components/resources/resources_icons";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import { isToolsetsResultResourceType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { useMCPServerViews } from "@app/lib/swr/mcp_servers";
import { useSpaces } from "@app/lib/swr/spaces";

export function MCPListToolsActionDetails({
  owner,
  toolOutput,
  viewType,
}: ToolExecutionDetailsProps) {
  const { spaces } = useSpaces({
    workspaceId: owner.sId,
  });
  const { serverViews: mcpServerViews } = useMCPServerViews({
    owner,
    space: spaces.find((s) => s.kind === "global"),
    availability: "all",
  });
  const results =
    toolOutput?.filter(isToolsetsResultResourceType).map((o) => o.resource) ??
    [];

  return (
    <ActionDetailsWrapper
      viewType={viewType}
      actionName={viewType === "conversation" ? `Listing tools` : `List tools`}
      visual={BoltIcon}
    >
      {viewType !== "conversation" && (
        <div className="pl-6 pt-4 text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
          <div className="flex flex-wrap gap-1">
            {results.map((result) => {
              const mcpServerView = mcpServerViews.find(
                (v) => v.sId === result.id
              );
              if (!mcpServerView) {
                console.log("mcpServerView not found", result);
                return null;
              }
              return (
                <Chip
                  key={result.id}
                  label={getMcpServerViewDisplayName(mcpServerView)}
                  icon={getIcon(mcpServerView.server.icon)}
                />
              );
            })}
          </div>
        </div>
      )}
    </ActionDetailsWrapper>
  );
}
