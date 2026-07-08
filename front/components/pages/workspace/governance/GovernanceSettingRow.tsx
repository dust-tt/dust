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
  cn,
  Page,
} from "@dust-tt/sparkle";
import { useState } from "react";

type GovernanceSettingMetadata = {
  label: string;
  description: string;
  isGroupsOnly?: boolean;
};

const GOVERNANCE_SETTING_METADATA: Partial<
  Record<
    `${PermissionType}:${GroupPermissionResourceType}`,
    GovernanceSettingMetadata
  >
> = {
  "create:agent": {
    label: "Create agents",
    description: "Controls who can build agents in the Agent Builder.",
  },
  "publish:agent": {
    label: "Publish agents",
    description: "Controls who can publish agents to the whole workspace.",
  },
  "create:skill": {
    label: "Create skills",
    description: "Controls who can build custom skills.",
  },
  "publish:skill": {
    label: "Publish skills",
    description: "Controls who can publish skills to the whole workspace.",
  },
  "invite:frame": {
    label: "Invite people by email",
    description:
      "Controls who can share frames by email with people outside your organization.",
  },
  "publish:frame": {
    label: "Share by public link",
    description: "Controls who can create public links to frames.",
  },
  "admin:billing": {
    label: "Billing access",
    description:
      "Controls who can manage billing settings, invoices, and payment methods.",
    isGroupsOnly: true,
  },
  "admin:identity": {
    label: "Security access",
    description:
      "Controls who can manage user access, identities, and provisioning.",
    isGroupsOnly: true,
  },
};

function getGovernancePermissionMetadata(
  permissions: GovernancePermission
): GovernanceSettingMetadata | null {
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
  className?: string;
}

export const GovernanceSettingRow = ({
  governancePermission,
  groups,
  onChange,
  className,
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
    <div className={cn("w-full flex flex-col gap-3 p-4", className)}>
      <div className="flex w-full items-center gap-4 justify-between">
        <Page.Vertical gap="xs" sizing="grow">
          <Page.H variant="h6">{metadata.label}</Page.H>
          <Page.P variant="secondary" size="sm">
            {metadata.description}
          </Page.P>
        </Page.Vertical>
        {!metadata.isGroupsOnly && (
          <ButtonsSwitchList
            size="xs"
            defaultValue={configuration.scope}
            onValueChange={(value) => handlePermissionChange({ scope: value })}
          >
            <ButtonsSwitch value="everyone" label="Everyone" />
            <ButtonsSwitch value="groups" label="Groups" />
            <ButtonsSwitch value="disabled" label="Disabled" />
          </ButtonsSwitchList>
        )}
      </div>
      {(metadata.isGroupsOnly || configuration.scope === "groups") && (
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
