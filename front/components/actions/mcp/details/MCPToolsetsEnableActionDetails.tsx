import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ToolExecutionDetailsProps } from "@app/components/actions/mcp/details/types";
import { getIcon } from "@app/components/resources/resources_icons";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import { useMCPServerViews } from "@app/lib/swr/mcp_servers";
import { useSpaces } from "@app/lib/swr/spaces";
import { isString } from "@app/types/shared/utils/general";
import { BoltIcon } from "@dust-tt/sparkle";

export function MCPToolsetsEnableActionDetails({
  owner,
  toolParams,
  displayContext,
}: ToolExecutionDetailsProps) {
  const { toolsetId } = toolParams;
  const resolvedToolsetId = isString(toolsetId) ? toolsetId : null;

  const { spaces } = useSpaces({
    kinds: ["global"],
    workspaceId: owner.sId,
  });
  const { serverViews: mcpServerViews } = useMCPServerViews({
    owner,
    space: spaces[0] ?? undefined,
    availability: "all",
  });

  const mcpServerView = resolvedToolsetId
    ? mcpServerViews.find((v) => v.sId === resolvedToolsetId)
    : null;

  const toolName = mcpServerView
    ? getMcpServerViewDisplayName(mcpServerView)
    : null;
  const visual = mcpServerView ? getIcon(mcpServerView.server.icon) : BoltIcon;
  const actionName = toolName ? `Enable ${toolName} tool` : "Enable tool";

  return (
    <ActionDetailsWrapper
      displayContext={displayContext}
      actionName={actionName}
      visual={visual}
    />
  );
}
