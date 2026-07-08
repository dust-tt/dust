import { GovernanceSettingRow } from "@app/components/pages/workspace/governance/GovernanceSettingRow";
import type { GovernancePermission } from "@app/types/group_permissions";
import type { GroupType } from "@app/types/groups";
import { Icon, Page } from "@dust-tt/sparkle";
import type { ComponentType } from "react";

interface GovernanceSettingSectionProps {
  label: string;
  icon: ComponentType;
  governancePermissions: GovernancePermission[];
  groups: GroupType[];
  onPermissionChange: (input: GovernancePermission) => void;
}

export const GovernanceSettingSection = ({
  label,
  icon,
  governancePermissions,
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
        {governancePermissions.map((governancePermission) => (
          <GovernanceSettingRow
            key={
              governancePermission.permissionType +
              ":" +
              governancePermission.resourceType
            }
            governancePermission={governancePermission}
            groups={groups}
            onChange={(newConfiguration) =>
              onPermissionChange({
                permissionType: governancePermission.permissionType,
                resourceType: governancePermission.resourceType,
                configuration: newConfiguration,
              })
            }
          />
        ))}
      </div>
    </div>
  );
};
