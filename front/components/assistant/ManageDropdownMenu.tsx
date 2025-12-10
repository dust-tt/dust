import {
  Button,
  ContactsRobotIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  RobotIcon,
} from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import { useState } from "react";

import { SKILL_ICON } from "@app/lib/skill";
import {
  getAgentBuilderRoute,
  getSkillBuilderRoute,
} from "@app/lib/utils/router";
import type { LightWorkspaceType } from "@app/types";

interface ManageDropdownMenuProps {
  owner: LightWorkspaceType;
}

export const ManageDropdownMenu = ({ owner }: ManageDropdownMenuProps) => {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="primary"
          label="Manage"
          icon={ContactsRobotIcon}
          size="sm"
          isSelect
          isLoading={isLoading}
          disabled={isLoading}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem
          label="agents"
          icon={RobotIcon}
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
