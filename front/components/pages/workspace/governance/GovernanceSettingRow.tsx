import { GovernanceSettingRowLayout } from "@app/components/pages/workspace/governance/GovernanceSettingRowLayout";
import { GroupSelector } from "@app/components/pages/workspace/governance/GroupSelector";
import type {
  GovernancePermission,
  GovernancePermissionConfiguration,
  GrantType,
  GroupPermissionResourceType,
  PermissionConfigurationScope,
} from "@app/types/group_permissions";
import { isValidPermissionConfigurationScope } from "@app/types/group_permissions";
import type { GroupType } from "@app/types/groups";
import { removeNulls } from "@app/types/shared/utils/general";
import {
  ButtonsSwitch,
  ButtonsSwitchList,
  ContentMessage,
} from "@dust-tt/sparkle";
import { useRef, useState } from "react";

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
    description: "Who can create agents in the Agent Builder",
  },
  "publish:agent": {
    label: "Publish agents",
    description: "Who can publish agents to the whole workspace",
  },
  "create:skill": {
    label: "Create skills",
    description: "Who can create custom skills",
  },
  "publish:skill": {
    label: "Manage skill availability",
    description: "Who can make skills available across the workspace",
  },
  "make_discoverable:skill": {
    label: "Make skills discoverable to agents",
    description:
      "Who can make skills discoverable to Dust and agents with Discover Skills",
  },
  "invite:frame": {
    label: "Invite people by email",
    description:
      "Who can share frames by email with people outside your organization",
  },
  "publish:frame": {
    label: "Share by public link",
    description: "Who can create public links to frames",
  },
  "admin:billing": {
    label: "Access billing features",
    description:
      "Who can manage billing settings, invoices, and payment methods",
    isGroupsOnly: true,
  },
  "admin:security": {
    label: "Access security features",
    description: "Who can manage user access, identities, and provisioning",
    isGroupsOnly: true,
  },
  "use_workspace_pool:trigger": {
    label: "Charge automations to the workspace",
    description:
      "Who can run a trigger on the workspace credit pool instead of their own",
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

function getGroupSelection(
  configuration: GovernancePermissionConfiguration,
  groups: GroupType[]
): {
  selectedGroups: GroupType[];
  selectableGroups: GroupType[];
  hasMissingGroups: boolean;
} {
  const orderedGroupIds =
    configuration.scope === "groups" ? configuration.groupIds : [];
  const selectedGroupIds = new Set(orderedGroupIds);
  const groupsById = new Map(groups.map((g) => [g.sId, g]));
  // Preserve selection order (newly added groups land last) instead of the `groups` array order.
  const selectedGroups = removeNulls(
    orderedGroupIds.map((id) => groupsById.get(id))
  );
  const selectableGroups = groups.filter((g) => !selectedGroupIds.has(g.sId));

  return {
    selectedGroups,
    selectableGroups,
    hasMissingGroups: selectedGroups.length !== selectedGroupIds.size,
  };
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

  // Remember the last group selection so switching away to "everyone"/"admins_only" and back to
  // "groups" restores what the user had picked, rather than starting from an empty selection.
  const lastGroupIdsRef = useRef<string[]>(
    configuration.scope === "groups" ? configuration.groupIds : []
  );

  const metadata = getGovernancePermissionMetadata(governancePermission);

  const { selectedGroups, selectableGroups, hasMissingGroups } =
    getGroupSelection(configuration, groups);

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

    // When switching back to "groups" from the scope switch, no groupIds are provided: restore the
    // last selection the user had picked. When the selection is edited directly (groupIds passed),
    // remember it so it survives a round-trip through "everyone"/"admins_only".
    const nextGroupIds = groupIds ?? lastGroupIdsRef.current;
    if (scope === "groups") {
      lastGroupIdsRef.current = nextGroupIds;
    }

    const newConfiguration: GovernancePermissionConfiguration =
      scope === "groups" ? { scope, groupIds: nextGroupIds } : { scope };

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
