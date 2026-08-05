import { useAppRouter } from "@app/lib/platform";
import { SKILL_ICON } from "@app/lib/skill";
import { useUnifiedAgentConfigurations } from "@app/lib/swr/assistants";
import { useWorkspacePermissions } from "@app/lib/swr/permissions";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import {
  getAgentBuilderRoute,
  getSkillBuilderRoute,
} from "@app/lib/utils/router";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  ContactsRobot,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Robot,
} from "@dust-tt/sparkle";
import { useState } from "react";

interface ManageDropdownMenuProps {
  owner: LightWorkspaceType;
}

export const ManageDropdownMenu = ({ owner }: ManageDropdownMenuProps) => {
  const router = useAppRouter();
  const [isLoading, setIsLoading] = useState(false);
  const { hasPermission } = useWorkspacePermissions();
  const { agentConfigurations } = useUnifiedAgentConfigurations({
    workspaceId: owner.sId,
  });

  const canManageAgents =
    hasPermission("create", "agent") ||
    hasPermission("publish", "agent") ||
    agentConfigurations.some((agent) => agent.canEdit);
  const canManageSkills =
    hasPermission("create", "skill") ||
    hasPermission("publish", "skill") ||
    hasPermission("make_discoverable", "skill");

  if (!canManageAgents && !canManageSkills) {
    return null;
  }

  // With a single destination the dropdown would only add a click: link
  // straight to it instead.
  if (!canManageSkills) {
    return (
      <Button
        href={getAgentBuilderRoute(owner.sId, "manage")}
        variant="primary"
        icon={ContactsRobot}
        label="Manage agents"
        data-gtm-label="assistantManagementButton"
        data-gtm-location="homepage"
        size="sm"
        onClick={withTracking(TRACKING_AREAS.BUILDER, "manage_agents")}
      />
    );
  }

  if (!canManageAgents) {
    return (
      <Button
        href={getSkillBuilderRoute(owner.sId, "manage")}
        variant="primary"
        icon={SKILL_ICON}
        label="Manage skills"
        size="sm"
        onClick={withTracking(TRACKING_AREAS.BUILDER, "manage_skills")}
      />
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="primary"
          label="Manage"
          icon={ContactsRobot}
          size="sm"
          isSelect
          isLoading={isLoading}
          disabled={isLoading}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem
          label="agents"
          icon={Robot}
          onClick={() => {
            setIsLoading(true);
            void router.push(getAgentBuilderRoute(owner.sId, "manage"));
          }}
        />
        <DropdownMenuItem
          label="skills"
          icon={SKILL_ICON}
          onClick={() => {
            setIsLoading(true);
            void router.push(getSkillBuilderRoute(owner.sId, "manage"));
          }}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
