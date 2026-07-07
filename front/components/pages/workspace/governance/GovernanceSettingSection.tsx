import type { GovernanceSetting } from "@app/components/pages/workspace/governance/GovernancePage";
import { GovernanceSettingRow } from "@app/components/pages/workspace/governance/GovernanceSettingRow";
import type { GovernancePermission } from "@app/types/group_permissions";
import type { GroupType } from "@app/types/groups";
import { Icon, Page } from "@dust-tt/sparkle";
import type { ComponentType } from "react";

interface GovernanceSettingSectionProps {
  label: string;
  icon: ComponentType;
  governanceSettings: GovernanceSetting[];
  groups: GroupType[];
  onPermissionChange: (input: GovernancePermission) => void;
}

export const GovernanceSettingSection = ({
  label,
  icon,
  governanceSettings,
  groups,
  onPermissionChange,
}: GovernanceSettingSectionProps) => {
  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex items-center gap-2">
        <Icon visual={icon} className="text-muted-foreground" />
        <Page.H variant="h5">{label}</Page.H>
      </div>
      <div className="w-full rounded-xl border border-border">
        {governanceSettings.map((governanceSetting) => (
          <GovernanceSettingRow
            key={governanceSetting.label}
            governanceSetting={governanceSetting}
            groups={groups}
            onChange={(newConfiguration) =>
              onPermissionChange({
                permissionType: governanceSetting.permissionType,
                resourceType: governanceSetting.resourceType,
                configuration: newConfiguration,
              })
            }
          />
        ))}
      </div>
    </div>
  );
};
