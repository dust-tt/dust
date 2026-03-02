import { ConfirmContext } from "@app/components/Confirm";
import { GroupsList } from "@app/components/groups/GroupsList";
import { MemberSelectionTable } from "@app/components/members/MemberSelectionTable";
import { SearchGroupsDropdown } from "@app/components/spaces/SearchGroupsDropdown";
import { useSendNotification } from "@app/hooks/useNotification";
import type { GroupType } from "@app/types/groups";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyCTA,
  ScrollArea,
  SearchInput,
} from "@dust-tt/sparkle";
import type { PaginationState } from "@tanstack/react-table";
import { useContext, useMemo, useState } from "react";

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
  const [searchSelectedGroups, setSearchSelectedGroups] = useState("");

  const selectedMemberIds = useMemo(
    () => new Set(selectedMembers.map((m) => m.sId)),
    [selectedMembers]
  );

  const handleSelectionChange = (_ids: Set<string>, users: UserType[]) => {
    onMembersUpdated(users);
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
          {!isManual && selectedGroups.length > 0 && (
            <SearchGroupsDropdown
              owner={owner}
              selectedGroups={selectedGroups}
              onGroupsUpdated={onGroupsUpdated}
            />
          )}
        </div>
      )}

      {isManual && (
        <MemberSelectionTable
          owner={owner}
          selectedMemberIds={selectedMemberIds}
          onSelectionChange={handleSelectionChange}
          initialMembers={selectedMembers}
        />
      )}

      {!isManual && selectedGroups.length === 0 && (
        <EmptyCTA
          action={
            <SearchGroupsDropdown
              owner={owner}
              selectedGroups={selectedGroups}
              onGroupsUpdated={onGroupsUpdated}
            />
          }
          message="Add groups to the space"
        />
      )}

      {!isManual && selectedGroups.length > 0 && (
        <>
          <SearchInput
            name="search"
            placeholder={"Search groups"}
            value={searchSelectedGroups}
            onChange={setSearchSelectedGroups}
          />
          <ScrollArea className="h-full">
            <GroupsTable
              onGroupsUpdated={onGroupsUpdated}
              selectedGroups={selectedGroups}
              searchSelectedGroups={searchSelectedGroups}
            />
          </ScrollArea>
        </>
      )}
    </>
  );
}

interface GroupsTableProps {
  onGroupsUpdated: (groups: GroupType[]) => void;
  selectedGroups: GroupType[];
  searchSelectedGroups: string;
}

function GroupsTable({
  onGroupsUpdated,
  selectedGroups,
  searchSelectedGroups,
}: GroupsTableProps) {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 50,
  });

  const sendNotification = useSendNotification();

  const removeGroup = (group: GroupType) => {
    if (selectedGroups.length === 1) {
      sendNotification({
        title: "Cannot remove last group.",
        description: "You cannot remove the last group.",
        type: "error",
      });
      return;
    }
    onGroupsUpdated(selectedGroups.filter((g) => g.sId !== group.sId));
  };

  return (
    <GroupsList
      groups={selectedGroups}
      searchTerm={searchSelectedGroups}
      showColumns={["name", "memberCount", "action"]}
      onRemoveGroupClick={removeGroup}
      pagination={pagination}
      setPagination={setPagination}
    />
  );
}
