import { ConfirmContext } from "@app/components/Confirm";
import { GroupSelectionTable } from "@app/components/groups/GroupSelectionTable";
import { MemberSelectionTable } from "@app/components/members/MemberSelectionTable";
import type { GroupType } from "@app/types/groups";
import type { LightWorkspaceType, UserType } from "@app/types/user";
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
  planAllowsSCIM: boolean;
  managementType: MembersManagementType;
  owner: LightWorkspaceType;
  selectedMembers: UserType[];
  selectedGroups: GroupType[];
  onManagementTypeChange: (managementType: MembersManagementType) => void;
  onMembersUpdated: (members: UserType[]) => void;
  onGroupsUpdated: (groups: GroupType[]) => void;
}

export function RestrictedAccessBody({
  isManual,
  planAllowsSCIM,
  managementType,
  owner,
  selectedMembers,
  selectedGroups,
  onManagementTypeChange,
  onMembersUpdated,
  onGroupsUpdated,
}: RestrictedAccessBodyProps) {
  const confirm = useContext(ConfirmContext);

  const selectedMemberIds = useMemo(
    () => new Set(selectedMembers.map((m) => m.sId)),
    [selectedMembers]
  );

  const selectedGroupIds = useMemo(
    () => new Set(selectedGroups.map((g) => g.sId)),
    [selectedGroups]
  );

  const handleMemberSelectionChange = (
    _ids: Set<string>,
    users: UserType[]
  ) => {
    onMembersUpdated(users);
  };

  const handleGroupSelectionChange = (
    _ids: Set<string>,
    groups: GroupType[]
  ) => {
    onGroupsUpdated(groups);
  };

  const handleManagementTypeChange = async (newManagementType: string) => {
    if (!isMembersManagementType(newManagementType) || !planAllowsSCIM) {
      return;
    }

    if (
      managementType === "manual" &&
      newManagementType === "group" &&
      selectedMembers.length > 0
    ) {
      const confirmed = await confirm({
        title: "Switch to groups",
        message:
          "This switches from manual member to group-based access. " +
          "Your current member list will be saved but no longer active.",
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
          "Your current group settings will be saved but no longer active.",
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
      {planAllowsSCIM && (
        <div className="flex flex-row items-center justify-between">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                isSelect
                label={
                  managementType === "manual"
                    ? "Manual access"
                    : "Provisioned group access"
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
                label="Provisioned group access"
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
          initialMembers={selectedMembers}
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
