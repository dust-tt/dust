import type { GovernanceSetting } from "@app/components/pages/workspace/governance/GovernancePage";
import { GroupSelector } from "@app/components/pages/workspace/governance/GroupSelector";
import {
  type GovernancePermissionConfiguration,
  isValidPermissionConfigurationScope,
} from "@app/types/group_permissions";
import type { GroupType } from "@app/types/groups";
import { ButtonsSwitch, ButtonsSwitchList, Page } from "@dust-tt/sparkle";
import { useState } from "react";

interface GovernanceSettingRowProps {
  governanceSetting: GovernanceSetting;
  groups: GroupType[];
  onChange: (permission: GovernancePermissionConfiguration) => void;
}

export const GovernanceSettingRow = ({
  governanceSetting,
  groups,
  onChange,
}: GovernanceSettingRowProps) => {
  const [configuration, setConfiguration] =
    useState<GovernancePermissionConfiguration>(
      governanceSetting.configuration
    );

  const selectedGroupIds = new Set(configuration.groupIds ?? []);
  const selectedGroups = groups.filter((g) => selectedGroupIds.has(g.sId));
  const selectableGroups = groups.filter((g) => !selectedGroupIds.has(g.sId));

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

    const newConfiguration: GovernancePermissionConfiguration = {
      scope,
      groupIds: scope === "groups" ? (groupIds ?? []) : [],
    };
    setConfiguration(newConfiguration);
    onChange(newConfiguration);
  };

  return (
    <div className="w-full flex flex-col gap-3 p-4">
      <div className="flex w-full items-center gap-4 justify-between">
        <Page.Vertical gap="xs" sizing="grow">
          <Page.H variant="h6">{governanceSetting.label}</Page.H>
          <Page.P variant="secondary" size="sm">
            {governanceSetting.description}
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
