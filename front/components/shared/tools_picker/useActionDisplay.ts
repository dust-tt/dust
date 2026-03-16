import { getIcon } from "@app/components/resources/resources_icons";
import { useMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import type { BuilderAction } from "@app/components/shared/tools_picker/types";
import { isDefaultActionName } from "@app/components/shared/tools_picker/types";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import { MCP_SPECIFICATION } from "@app/lib/actions/utils_ui";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { BookOpenIcon } from "@dust-tt/sparkle";

function actionIcon(mcpServerView: MCPServerViewType | null) {
  if (!mcpServerView?.server) {
    return BookOpenIcon;
  }

  return getIcon(mcpServerView.server.icon);
}

function actionDisplayName(
  action: BuilderAction,
  mcpServerView: MCPServerViewType | null
) {
  if (mcpServerView) {
    return getMcpServerViewDisplayName(mcpServerView, action);
  }

  return `${MCP_SPECIFICATION.label}${
    !isDefaultActionName(action) ? " - " + action.name : ""
  }`;
}

export function useActionDisplay(action: BuilderAction) {
  const { mcpServerViews, isMCPServerViewsLoading } =
    useMCPServerViewsContext();

  const mcpServerView = !isMCPServerViewsLoading
    ? (mcpServerViews.find(
        (mcpServerView) =>
          mcpServerView.sId === action.configuration.mcpServerViewId
      ) ?? null)
    : null;

  return {
    icon: actionIcon(mcpServerView),
    displayName: actionDisplayName(action, mcpServerView),
    description: action.description ?? "",
  };
}
