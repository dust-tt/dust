import { ConfirmContext } from "@app/components/Confirm";
import { GroupSelectionTable } from "@app/components/groups/GroupSelectionTable";
import type { SearchMemberType } from "@app/components/members/MemberSelectionTable";
import { MemberSelectionTable } from "@app/components/members/MemberSelectionTable";
import type { GroupType } from "@app/types/groups";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import { useContext, useMemo } from "react";

type MembersManagementType = "manual" | "group";

function isMembersManagementType(
  value: string
): value is MembersManagementType {
  return value === "manual" || value === "group";
}

interface RestrictedAccessBodyProps {
  isManual: boolean;
  scimEnabled: boolean;
  managementType: MembersManagementType;
  owner: LightWorkspaceType;
  selectedMemberIds: Set<string>;
  selectedGroups: GroupType[];
  onManagementTypeChange: (managementType: MembersManagementType) => void;
  onMemberIdsUpdated: (memberIds: Set<string>) => void;
  onGroupsUpdated: (groups: GroupType[]) => void;
  initialMembers?: SearchMemberType[];
}

export function RestrictedAccessBody({
  isManual,
  scimEnabled,
  managementType,
  owner,
  selectedMemberIds,
  selectedGroups,
  onManagementTypeChange,
  onMemberIdsUpdated,
  onGroupsUpdated,
  initialMembers,
}: RestrictedAccessBodyProps) {
  const confirm = useContext(ConfirmContext);

  const selectedGroupIds = useMemo(
    () => new Set(selectedGroups.map((g) => g.sId)),
    [selectedGroups]
  );

  const handleMemberSelectionChange = (ids: Set<string>) => {
    onMemberIdsUpdated(ids);
  };

  const handleGroupSelectionChange = (
    _ids: Set<string>,
    groups: GroupType[]
  ) => {
    onGroupsUpdated(groups);
  };

  const handleManagementTypeChange = async (newManagementType: string) => {
    if (!isMembersManagementType(newManagementType) || !scimEnabled) {
      return;
    }

    if (
      managementType === "manual" &&
      newManagementType === "group" &&
      selectedMemberIds.size > 0
    ) {
      const confirmed = await confirm({
        title: "Switch to groups",
        message:
          "This switches from manual member to group-based access. " +
          "Your current member list will be removed; you'll need to re-add " +
          "members to switch back.",
        validateLabel: "Confirm",
        validateVariant: "primary",
      });

      if (confirmed) {
        onManagementTypeChange("group");
      }
    } else if (
      managementType === "group" &&
      newManagementType === "manual" &&
      selectedGroups.length > 0
    ) {
      const confirmed = await confirm({
        title: "Switch to members",
        message:
          "This switches from group-based access to manual member management. " +
          "Your current group selection will be removed; you'll need to re-select groups to switch back.",
        validateLabel: "Confirm",
        validateVariant: "primary",
      });

      if (confirmed) {
        onManagementTypeChange("manual");
      }
    } else {
      onManagementTypeChange(newManagementType);
    }
  };

  return (
    <>
      {scimEnabled && (
        <div className="flex flex-row items-center justify-between">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                isSelect
                label={
                  managementType === "manual" ? "Manual access" : "Group access"
                }
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                label="Manual access"
                onClick={() => {
                  void handleManagementTypeChange("manual");
                }}
              />
              <DropdownMenuItem
                label="Group access"
                onClick={() => {
                  void handleManagementTypeChange("group");
                }}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {isManual && (
        <MemberSelectionTable
          owner={owner}
          selectedMemberIds={selectedMemberIds}
          onSelectionChange={handleMemberSelectionChange}
          initialMembers={initialMembers}
        />
      )}

      {!isManual && (
        <GroupSelectionTable
          owner={owner}
          selectedGroupIds={selectedGroupIds}
          onSelectionChange={handleGroupSelectionChange}
        />
      )}
    </>
  );
}
