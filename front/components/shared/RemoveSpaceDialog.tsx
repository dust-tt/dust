import React, { useContext } from "react";

import { ConfirmContext } from "@app/components/Confirm";
import type { BuilderAction } from "@app/components/shared/tools_picker/types";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { getSkillAvatarIcon } from "@app/lib/skill";
import { getSpaceName } from "@app/lib/spaces";
import type { SpaceType } from "@app/types";
import type { SkillType } from "@app/types/assistant/skill_configuration";

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

function getSkillIcon(
  skill: SkillToRemove,
  allSkills: SkillType[]
): React.ReactNode {
  const fullSkill = allSkills.find((s) => s.sId === skill.sId);
  return React.createElement(
    getSkillAvatarIcon(fullSkill ? fullSkill.icon : null)
  );
}

interface ItemToRemove {
  id: string;
  name: string;
  icon: React.ReactNode;
}

interface SkillToRemove {
  sId: string;
  name: string;
}

interface UseRemoveSpaceConfirmParams {
  entityName: "agent" | "skill";
  mcpServerViews: MCPServerViewType[];
  allSkills: SkillType[];
}

export function useRemoveSpaceConfirm({
  entityName,
  mcpServerViews,
  allSkills,
}: UseRemoveSpaceConfirmParams) {
  const confirm = useContext(ConfirmContext);

  return async (
    space: SpaceType,
    actions: BuilderAction[],
    skills: SkillToRemove[] = []
  ): Promise<boolean> => {
    const allItems: ItemToRemove[] = [
      ...skills.map((skill) => ({
        id: skill.sId,
        name: skill.name,
        icon: getSkillIcon(skill, allSkills),
      })),
      ...actions.map((action) => ({
        id: action.id,
        name: getActionDisplayName(action, mcpServerViews),
        icon: getActionIcon(action, mcpServerViews),
      })),
    ];

    return confirm({
      title: `Remove ${getSpaceName(space)} space`,
      message: (
        <p className="text-sm">
          This will remove the following elements from the {entityName}:
          <span className="mt-4 flex flex-wrap items-center gap-1">
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
          </span>
        </p>
      ),
      validateLabel: "OK",
      validateVariant: "warning",
    });
  };
}
