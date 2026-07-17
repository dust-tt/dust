import { GovernanceSettingRowLayout } from "@app/components/pages/workspace/governance/GovernanceSettingRowLayout";
import { GroupSelector } from "@app/components/pages/workspace/governance/GroupSelector";
import {
  type GovernancePermission,
  type GovernancePermissionConfiguration,
  type GrantType,
  type GroupPermissionResourceType,
  isValidPermissionConfigurationScope,
  type PermissionConfigurationScope,
} from "@app/types/group_permissions";
import type { GroupType } from "@app/types/groups";
import {
  ButtonsSwitch,
  ButtonsSwitchList,
  ContentMessage,
} from "@dust-tt/sparkle";
import { useState } from "react";

type GovernanceSettingMetadata = {
  label: string;
  description: string;
  isGroupsOnly?: boolean;
};

const GOVERNANCE_SETTING_METADATA: Partial<
  Record<
    `${GrantType}:${GroupPermissionResourceType}`,
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

const PERMISSION_SCOPE_OPTIONS: {
  value: PermissionConfigurationScope;
  label: string;
}[] = [
  { value: "everyone", label: "Everyone" },
  { value: "groups", label: "Groups" },
  { value: "admins_only", label: "Admins only" },
];

function getGovernancePermissionMetadata(
  permissions: GovernancePermission
): GovernanceSettingMetadata | null {
  const metadata =
    GOVERNANCE_SETTING_METADATA[
      `${permissions.grantType}:${permissions.resourceType}`
    ];

  if (!metadata) {
    return null;
  }

  return metadata;
}

interface GovernanceSettingRowProps {
  governancePermission: GovernancePermission;
  groups: GroupType[];
  onChange: (
    configuration: GovernancePermissionConfiguration
  ) => Promise<boolean>;
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
  const [isSaving, setIsSaving] = useState(false);

  const metadata = getGovernancePermissionMetadata(governancePermission);

  const selectedGroupIds = new Set(
    configuration.scope === "groups" ? configuration.groupIds : []
  );
  const selectedGroups = groups.filter((g) => selectedGroupIds.has(g.sId));
  const selectableGroups = groups.filter((g) => !selectedGroupIds.has(g.sId));

  const hasMissingGroups = selectedGroups.length !== selectedGroupIds.size;

  const handlePermissionChange = async ({
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

    // Apply optimistically, then persist. The optimistic update is the loading feedback (the
    // switch moves immediately). We intentionally do NOT re-sync from the server on success: the
    // backend normalizes an empty "groups" selection to admins_only, and snapping back would make
    // it impossible to reach the transient "groups, no ids yet" state the user needs to open the
    // selector and add a group.
    const previousConfiguration = configuration;
    setConfiguration(newConfiguration);
    setIsSaving(true);
    try {
      const ok = await onChange(newConfiguration);
      if (!ok) {
        setConfiguration(previousConfiguration);
      }
    } finally {
      setIsSaving(false);
    }
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
    <GovernanceSettingRowLayout
      label={metadata.label}
      description={metadata.description}
      action={
        !metadata.isGroupsOnly ? (
          <ButtonsSwitchList
            size="xs"
            value={configuration.scope}
            onValueChange={(value) =>
              void handlePermissionChange({ scope: value })
            }
          >
            {PERMISSION_SCOPE_OPTIONS.map(({ value, label }) => (
              <ButtonsSwitch key={value} value={value} label={label} />
            ))}
          </ButtonsSwitchList>
        ) : undefined
      }
    >
      {(metadata.isGroupsOnly || configuration.scope === "groups") && (
        <GroupSelector
          selectedGroups={selectedGroups}
          selectableGroups={selectableGroups}
          disabled={isSaving}
          onSelectionChange={(groupIds) =>
            void handlePermissionChange({ scope: "groups", groupIds })
          }
        />
      )}
    </GovernanceSettingRowLayout>
  );
};
