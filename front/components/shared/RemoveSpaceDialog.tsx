import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dust-tt/sparkle";

import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { SKILL_ICON } from "@app/lib/skill";
import { getSpaceName } from "@app/lib/spaces";
import type { SpaceType } from "@app/types";

import type { BuilderAction } from "./tools_picker/types";

function getActionDisplayName(
  action: BuilderAction,
  mcpServerViews: MCPServerViewType[]
): string {
  const mcpServerView = mcpServerViews.find(
    (view) => view.sId === action.configuration.mcpServerViewId
  );
  if (mcpServerView) {
    return getMcpServerViewDisplayName(mcpServerView, action);
  }
  return action.name;
}

function getActionIcon(
  action: BuilderAction,
  mcpServerViews: MCPServerViewType[]
): React.ReactNode {
  const mcpServerView = mcpServerViews.find(
    (view) => view.sId === action.configuration.mcpServerViewId
  );
  if (mcpServerView?.server) {
    return getAvatar(mcpServerView.server, "xs");
  }
  return null;
}

export interface SkillItem {
  sId: string;
  name: string;
}

interface RemoveSpaceDialogProps {
  space: SpaceType | null;
  entityName: "agent" | "skill";
  actions?: BuilderAction[];
  skills?: SkillItem[];
  mcpServerViews: MCPServerViewType[];
  onClose: () => void;
  onConfirm: () => void;
}

export function RemoveSpaceDialog({
  space,
  entityName,
  actions = [],
  skills = [],
  mcpServerViews,
  onClose,
  onConfirm,
}: RemoveSpaceDialogProps) {
  if (!space) {
    return null;
  }

  const SkillIcon = SKILL_ICON;

  // Build list of all items to remove
  const allItems: Array<{ id: string; name: string; icon: React.ReactNode }> = [
    ...skills.map((skill) => ({
      id: skill.sId,
      name: skill.name,
      // TODO(skills): use actual skill icon
      icon: <SkillIcon className="h-4 w-4 shrink-0" />,
    })),
    ...actions.map((action) => ({
      id: action.id,
      name: getActionDisplayName(action, mcpServerViews),
      icon: getActionIcon(action, mcpServerViews),
    })),
  ];

  return (
    <Dialog open={!!space} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md" isAlertDialog>
        <DialogHeader hideButton>
          <DialogTitle>Remove {getSpaceName(space)} space</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <p className="text-sm">
            This will remove the following elements from the {entityName}:
            <div className="mt-4 flex flex-wrap items-center gap-1">
              {allItems.map((item, index) => (
                <span key={item.id} className="inline-flex items-center gap-1">
                  {item.icon}
                  <span className="text-sm text-foreground dark:text-foreground-night">
                    {item.name}
                  </span>
                  {index < allItems.length - 1 && (
                    <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                      ,
                    </span>
                  )}
                </span>
              ))}
            </div>
          </p>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
          }}
          rightButtonProps={{
            label: "OK",
            variant: "warning",
            onClick: onConfirm,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
