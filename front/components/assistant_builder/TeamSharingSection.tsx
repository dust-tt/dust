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
  scope,
  setNewScope,
}: {
  owner: WorkspaceType;
  agentConfigurationId: string | null;
  scope: Exclude<AgentConfigurationScope, "global">;
  setNewScope: (scope: Exclude<AgentConfigurationScope, "global">) => void;
}) {
  const agentUsage = useAgentUsage({
    workspaceId: owner.sId,
    agentConfigurationId,
  });

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
                label={scopeInfo[scope].label}
                color={scopeInfo[scope].color as "pink" | "amber" | "sky"}
                icon={scopeInfo[scope].icon}
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
              .filter(
                ([entryScope]) => isBuilder(owner) || entryScope !== "workspace"
              )
              .map(([entryScope, entryData]) => (
                <DropdownMenu.Item
                  key={entryData.label}
                  label={entryData.label}
                  icon={entryData.icon}
                  selected={entryScope === scope}
                  onClick={() =>
                    setNewScope(
                      entryScope as Exclude<AgentConfigurationScope, "global">
                    )
                  }
                />
              ))}
          </DropdownMenu.Items>
        </DropdownMenu>
      </div>
      <div className="text-sm text-element-700">
        <div>{scopeInfo[scope].text}</div>
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
