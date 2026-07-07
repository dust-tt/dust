import { GroupSelector } from "@app/components/pages/workspace/governance/GroupSelector";
import {
  type GovernancePermission,
  type GovernancePermissionConfiguration,
  type GroupPermissionResourceType,
  isValidPermissionConfigurationScope,
  type PermissionType,
} from "@app/types/group_permissions";
import type { GroupType } from "@app/types/groups";
import {
  ButtonsSwitch,
  ButtonsSwitchList,
  ContentMessage,
  Page,
} from "@dust-tt/sparkle";
import { useState } from "react";

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

function getGovernancePermissionMetadata(
  permissions: GovernancePermission
): { label: string; description: string } | null {
  const metadata =
    GOVERNANCE_SETTING_METADATA[
      `${permissions.permissionType}:${permissions.resourceType}`
    ];

  if (!metadata) {
    return null;
  }

  return metadata;
}

interface GovernanceSettingRowProps {
  governancePermission: GovernancePermission;
  groups: GroupType[];
  onChange: (permission: GovernancePermissionConfiguration) => void;
}

export const GovernanceSettingRow = ({
  governancePermission,
  groups,
  onChange,
}: GovernanceSettingRowProps) => {
  const [configuration, setConfiguration] =
    useState<GovernancePermissionConfiguration>(
      governancePermission.configuration
    );

  const metadata = getGovernancePermissionMetadata(governancePermission);

  const selectedGroupIds = new Set(
    configuration.scope === "groups" ? configuration.groupIds : []
  );
  const selectedGroups = groups.filter((g) => selectedGroupIds.has(g.sId));
  const selectableGroups = groups.filter((g) => !selectedGroupIds.has(g.sId));

  const hasMissingGroups = selectedGroups.length !== selectedGroupIds.size;

  const handlePermissionChange = ({
    scope,
    groupIds,
  }: {
    scope: string;
    groupIds?: string[];
  }) => {
    if (!isValidPermissionConfigurationScope(scope)) {
      return;
    }

    const newConfiguration: GovernancePermissionConfiguration =
      scope === "groups" ? { scope, groupIds: groupIds ?? [] } : { scope };
    setConfiguration(newConfiguration);
    onChange(newConfiguration);
  };

  if (!metadata) {
    return null;
  }

  if (hasMissingGroups) {
    return (
      <div className="w-full p-4">
        <ContentMessage
          title="Invalid configuration"
          variant="warning"
          size="lg"
        >
          This setting references groups that have not been found. Please reload
          the page.
        </ContentMessage>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-3 p-4">
      <div className="flex w-full items-center gap-4 justify-between">
        <Page.Vertical gap="xs" sizing="grow">
          <Page.H variant="h6">{metadata.label}</Page.H>
          <Page.P variant="secondary" size="sm">
            {metadata.description}
          </Page.P>
        </Page.Vertical>
        <ButtonsSwitchList
          size="xs"
          defaultValue={configuration.scope}
          onValueChange={(value) => handlePermissionChange({ scope: value })}
        >
          <ButtonsSwitch value="everyone" label="Everyone" />
          <ButtonsSwitch value="groups" label="Groups" />
          <ButtonsSwitch value="disabled" label="Disabled" />
        </ButtonsSwitchList>
      </div>
      {configuration.scope === "groups" && (
        <GroupSelector
          selectedGroups={selectedGroups}
          selectableGroups={selectableGroups}
          onSelectionChange={(groupIds) =>
            handlePermissionChange({ scope: "groups", groupIds })
          }
        />
      )}
    </div>
  );
};
