import {
  ChevronDownIcon,
  Chip,
  DropdownMenu,
  IconButton,
  LockIcon,
  PlanetIcon,
  UserGroupIcon,
} from "@dust-tt/sparkle";
import type { AgentConfigurationScope, WorkspaceType } from "@dust-tt/types";
import { isBuilder } from "@dust-tt/types";

import { assistantUsageMessage } from "@app/lib/assistant";
import { useAgentUsage } from "@app/lib/swr";

/*
 * Note: Non-builders cannot change to/from company assistant
 */
export function TeamSharingSection({
  owner,
  agentConfigurationId,
  newScope,
  setNewScope,
}: {
  owner: WorkspaceType;
  agentConfigurationId: string | null;
  newScope: Exclude<AgentConfigurationScope, "global">;
  setNewScope: (scope: Exclude<AgentConfigurationScope, "global">) => void;
}) {
  const agentUsage = agentConfigurationId
    ? useAgentUsage({
        workspaceId: owner.sId,
        agentConfigurationId,
      })
    : null;

  const scopeInfo: Record<
    Exclude<AgentConfigurationScope, "global">,
    {
      label: string;
      color: string;
      icon: typeof UserGroupIcon | typeof PlanetIcon | typeof LockIcon;
      text: string;
    }
  > = {
    published: {
      label: "Shared Assistant",
      color: "pink",
      icon: UserGroupIcon,
      text: "Anyone in the workspace can view and edit.",
    },
    workspace: {
      label: "Company Assistant",
      color: "amber",
      icon: PlanetIcon,
      text: "Activated by default for all members of the workspace.",
    },
    private: {
      label: "Personal Assistant",
      color: "sky",
      icon: LockIcon,
      text: "Only I can view and edit.",
    },
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="text-lg font-bold text-element-900">Sharing</div>
      <div>
        <DropdownMenu>
          <DropdownMenu.Button>
            <div className="flex cursor-pointer items-center gap-2">
              <Chip
                label={scopeInfo[newScope].label}
                color={scopeInfo[newScope].color as "pink" | "amber" | "sky"}
                icon={scopeInfo[newScope].icon}
              />
              <IconButton
                icon={ChevronDownIcon}
                size="xs"
                variant="secondary"
              />
            </div>
          </DropdownMenu.Button>
          <DropdownMenu.Items origin="topRight" width={200}>
            {Object.entries(scopeInfo)
              .filter((scope) => isBuilder(owner) || scope[0] !== "workspace")
              .map(([scope, data]) => (
                <DropdownMenu.Item
                  key={data.label}
                  label={data.label}
                  icon={data.icon}
                  selected={scope === newScope}
                  onClick={() =>
                    setNewScope(
                      scope as Exclude<AgentConfigurationScope, "global">
                    )
                  }
                />
              ))}
          </DropdownMenu.Items>
        </DropdownMenu>
      </div>
      <div className="text-sm text-element-700">
        <div>{scopeInfo[newScope].text}</div>
        {agentUsage &&
        agentUsage.agentUsage?.userCount &&
        agentUsage.agentUsage.userCount > 1
          ? assistantUsageMessage({
              usage: agentUsage.agentUsage,
              isLoading: agentUsage.isAgentUsageLoading,
              isError: agentUsage.isAgentUsageError,
            })
          : null}
      </div>
    </div>
  );
}
