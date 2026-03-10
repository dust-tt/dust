import { getIcon } from "@app/components/resources/resources_icons";
import { useMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import type { BuilderAction } from "@app/components/shared/tools_picker/types";
import { isDefaultActionName } from "@app/components/shared/tools_picker/types";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import { MCP_SPECIFICATION } from "@app/lib/actions/utils";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { ActionCardDiffStatus } from "@dust-tt/sparkle";

import {
  Avatar,
  BookOpenIcon,
  Card,
  CardActionButton,
  ActionCard as SparkleActionCard,
  XMarkIcon,
} from "@dust-tt/sparkle";

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

interface ActionCardBaseProps {
  action: BuilderAction;
  onClick?: () => void;
}

interface ActionCardDefaultProps extends ActionCardBaseProps {
  diffStatus?: never;
  onRemove?: () => void;
}

interface ActionCardDiffProps extends ActionCardBaseProps {
  diffStatus: ActionCardDiffStatus;
  onRemove?: never;
}

export type ActionCardProps = ActionCardDefaultProps | ActionCardDiffProps;

// TODO: rename to not conflict with the sparkle component
export function ActionCard({
  action,
  diffStatus,
  onRemove,
  onClick,
}: ActionCardProps) {
  const { mcpServerViews, isMCPServerViewsLoading } =
    useMCPServerViewsContext();

  const mcpServerView = !isMCPServerViewsLoading
    ? (mcpServerViews.find(
        (mcpServerView) =>
          mcpServerView.sId === action.configuration.mcpServerViewId
      ) ?? null)
    : null;

  const displayName = actionDisplayName(action, mcpServerView);
  const description = action.description ?? "";
  const icon = actionIcon(mcpServerView);

  if (diffStatus) {
    return (
      <SparkleActionCard
        icon={icon}
        label={displayName}
        description={description}
        diffStatus={diffStatus}
        canAdd={false}
        onClick={onClick}
        cardContainerClassName="h-28"
      />
    );
  }

  return (
    <Card
      variant="primary"
      className="h-28"
      onClick={onClick}
      action={
        onRemove ? (
          <CardActionButton
            size="icon"
            icon={XMarkIcon}
            onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
              onRemove();
              e.stopPropagation();
            }}
          />
        ) : undefined
      }
    >
      <div className="flex w-full flex-col gap-2 text-sm">
        <div className="flex w-full items-center gap-2 font-medium text-foreground dark:text-foreground-night">
          <Avatar icon={icon} size="xs" />
          <span className="truncate">{displayName}</span>
        </div>

        <div className="text-muted-foreground dark:text-muted-foreground-night">
          <span className="line-clamp-2 break-words">{description}</span>
        </div>
      </div>
    </Card>
  );
}
