import { GovernanceSettingSection } from "@app/components/pages/workspace/governance/GovernanceSettingSection";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { useGovernancePermissions } from "@app/lib/swr/governance";
import { useGroups } from "@app/lib/swr/groups";
import type {
  GovernancePermission,
  GroupPermissionResourceType,
  PermissionType,
} from "@app/types/group_permissions";
import type { LightWorkspaceType } from "@app/types/user";
import {
  ActionFrame,
  Page,
  PuzzlePiece01,
  Robot,
  Toggle01Left,
} from "@dust-tt/sparkle";
import groupBy from "lodash/groupBy";

export type GovernanceSetting = GovernancePermission & {
  label: string;
  description: string;
};

const GOVERNANCE_SETTING_METADATA: Partial<
  Record<
    `${PermissionType}:${GroupPermissionResourceType}`,
    { label: string; description: string }
  >
> = {
  "create:agent": {
    label: "Members can create agents",
    description: "Build new agents in the Agent Builder",
  },
  "publish:agent": {
    label: "Members can publish agents",
    description: "Publish agents in the Agent Builder",
  },
  "create:skill": {
    label: "Members can create skills",
    description: "Build custom Skills",
  },
  "publish:skill": {
    label: "Members can publish skills",
    description: "Publish Skills workspace-wide for all members to use",
  },
  "invite:frame": {
    label: "Members + email invites",
    description:
      "Frames can be shared with workspace members or via email invite",
  },
};

function toGovernanceSettings(
  permissions: GovernancePermission[]
): GovernanceSetting[] {
  return permissions
    .map((permission): GovernanceSetting | null => {
      const metadata =
        GOVERNANCE_SETTING_METADATA[
          `${permission.permissionType}:${permission.resourceType}`
        ];
      if (!metadata) {
        return null;
      }
      return { ...permission, ...metadata };
    })
    .filter((setting): setting is GovernanceSetting => setting !== null);
}

function useUpdateGovernancePermission(owner: LightWorkspaceType) {
  return (input: GovernancePermission) => {
    return true;
  };
}

export const GovernancePage = () => {
  const owner = useWorkspace();
  const { groups } = useGroups({ owner, kinds: ["provisioned"] });
  const { governancePermissions, isLoading } = useGovernancePermissions(owner);
  const onPermissionChange = useUpdateGovernancePermission(owner);

  const governanceSettingsMap = groupBy(
    toGovernanceSettings(governancePermissions),
    "resourceType"
  );

  const agentSettings = governanceSettingsMap.agent ?? [];
  const skillSettings = governanceSettingsMap.skill ?? [];
  const frameSettings = governanceSettingsMap.frame ?? [];

  if (isLoading) {
    return (
      <Page>
        <Page.Header title="Governance" description="Loading..." />
      </Page>
    );
  }

  return (
    <Page>
      <Page.Header
        title="Governance"
        description="Control what members can create and publish. Use groups to grant exceptions."
        icon={Toggle01Left}
      />
      <div className="flex w-full flex-col gap-8">
        <GovernanceSettingSection
          label="Agents"
          icon={Robot}
          governanceSettings={agentSettings}
          groups={groups}
          onPermissionChange={onPermissionChange}
        />
        <GovernanceSettingSection
          label="Skills"
          icon={PuzzlePiece01}
          governanceSettings={skillSettings}
          groups={groups}
          onPermissionChange={onPermissionChange}
        />
        <GovernanceSettingSection
          label="Frames"
          icon={ActionFrame}
          governanceSettings={frameSettings}
          groups={groups}
          onPermissionChange={onPermissionChange}
        />
      </div>
    </Page>
  );
};
