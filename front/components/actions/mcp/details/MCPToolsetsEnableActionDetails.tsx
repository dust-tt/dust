import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ToolExecutionDetailsProps } from "@app/components/actions/mcp/details/types";
import { getIcon } from "@app/components/resources/resources_icons";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import { useMCPServerViews } from "@app/lib/swr/mcp_servers";
import { useSpaces } from "@app/lib/swr/spaces";
import { BoltIcon } from "@dust-tt/sparkle";

export function MCPToolsetsEnableActionDetails({
  owner,
  toolParams,
  displayContext,
}: ToolExecutionDetailsProps) {
  const toolsetId =
    typeof toolParams.toolsetId === "string" ? toolParams.toolsetId : null;

  const { spaces } = useSpaces({
    kinds: ["global"],
    workspaceId: owner.sId,
  });
  const { serverViews: mcpServerViews } = useMCPServerViews({
    owner,
    space: spaces[0] ?? undefined,
    availability: "all",
  });

  const mcpServerView = toolsetId
    ? mcpServerViews.find((v) => v.sId === toolsetId)
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
