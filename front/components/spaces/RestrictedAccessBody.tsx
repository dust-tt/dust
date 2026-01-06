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
import { useCallback, useEffect, useState } from "react";

import { GroupsList } from "@app/components/groups/GroupsList";
import { SearchGroupsDropdown } from "@app/components/spaces/SearchGroupsDropdown";
import { SearchMembersDropdown } from "@app/components/spaces/SearchMembersDropdown";
import { useSendNotification } from "@app/hooks/useNotification";
import type { GroupType, LightWorkspaceType, UserType } from "@app/types";

import { MembersTable } from "./MembersTable";

export type MembersManagementType = "manual" | "group";

function isMembersManagementType(
  value: string
): value is MembersManagementType {
  return value === "manual" || value === "group";
}

interface RestrictedAccessBodyProps {
  initialGroups?: GroupType[];
  initialManagementType?: MembersManagementType;
  initialMembers?: UserType[];
  onChange?: (data: {
    groups: GroupType[];
    managementType: MembersManagementType;
    members: UserType[];
  }) => void;
  owner: LightWorkspaceType;
  planAllowsSCIM: boolean;
}

export function RestrictedAccessBody({
  initialGroups = [],
  initialManagementType = "manual",
  initialMembers = [],
  onChange,
  owner,
  planAllowsSCIM,
}: RestrictedAccessBodyProps) {
  const [selectedMembers, setSelectedMembers] =
    useState<UserType[]>(initialMembers);
  const [selectedGroups, setSelectedGroups] =
    useState<GroupType[]>(initialGroups);
  const [managementType, setManagementType] = useState<MembersManagementType>(
    initialManagementType
  );
  const [searchSelectedMembers, setSearchSelectedMembers] =
    useState<string>("");

  // Reset state when initial values change
  useEffect(() => {
    setSelectedMembers(initialMembers);
  }, [initialMembers]);

  useEffect(() => {
    setSelectedGroups(initialGroups);
  }, [initialGroups]);

  useEffect(() => {
    setManagementType(initialManagementType);
  }, [initialManagementType]);

  // Notify parent of changes
  useEffect(() => {
    if (onChange) {
      onChange({
        members: selectedMembers,
        groups: selectedGroups,
        managementType,
      });
    }
  }, [selectedMembers, selectedGroups, managementType, onChange]);

  const handleManagementTypeChange = useCallback((value: string) => {
    if (isMembersManagementType(value)) {
      setManagementType(value);
    }
  }, []);

  const handleMembersUpdated = useCallback((members: UserType[]) => {
    setSelectedMembers(members);
  }, []);

  const handleGroupsUpdated = useCallback((groups: GroupType[]) => {
    setSelectedGroups(groups);
  }, []);

  const isManual = !planAllowsSCIM || managementType === "manual";

  return (
    <>
      {planAllowsSCIM ? (
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
                  handleManagementTypeChange("manual");
                }}
              />
              <DropdownMenuItem
                label="Provisioned group access"
                onClick={() => {
                  handleManagementTypeChange("group");
                }}
              />
            </DropdownMenuContent>
          </DropdownMenu>
          {isManual && selectedMembers.length > 0 && (
            <SearchMembersDropdown
              owner={owner}
              selectedMembers={selectedMembers}
              onMembersUpdated={handleMembersUpdated}
            />
          )}
          {!isManual && selectedGroups.length > 0 && (
            <SearchGroupsDropdown
              owner={owner}
              selectedGroups={selectedGroups}
              onGroupsUpdated={handleGroupsUpdated}
            />
          )}
        </div>
      ) : (
        isManual &&
        selectedMembers.length > 0 && (
          <div className="flex w-full justify-end">
            <SearchMembersDropdown
              owner={owner}
              selectedMembers={selectedMembers}
              onMembersUpdated={handleMembersUpdated}
            />
          </div>
        )
      )}

      {isManual && selectedMembers.length === 0 && (
        <EmptyCTA
          action={
            <SearchMembersDropdown
              owner={owner}
              selectedMembers={selectedMembers}
              onMembersUpdated={handleMembersUpdated}
            />
          }
          message="Add members to the space"
        />
      )}
      {!isManual && selectedGroups.length === 0 && (
        <EmptyCTA
          action={
            <SearchGroupsDropdown
              owner={owner}
              selectedGroups={selectedGroups}
              onGroupsUpdated={handleGroupsUpdated}
            />
          }
          message="Add groups to the space"
        />
      )}

      {isManual && selectedMembers.length > 0 && (
        <>
          <SearchInput
            name="search"
            placeholder="Search (email)"
            value={searchSelectedMembers}
            onChange={setSearchSelectedMembers}
          />
          <ScrollArea className="h-full">
            <MembersTable
              onMembersUpdated={handleMembersUpdated}
              selectedMembers={selectedMembers}
              searchSelectedMembers={searchSelectedMembers}
            />
          </ScrollArea>
        </>
      )}
      {!isManual && selectedGroups.length > 0 && (
        <>
          <SearchInput
            name="search"
            placeholder={"Search groups"}
            value={searchSelectedMembers}
            onChange={setSearchSelectedMembers}
          />
          <ScrollArea className="h-full">
            <GroupsTable
              onGroupsUpdated={handleGroupsUpdated}
              selectedGroups={selectedGroups}
              searchSelectedGroups={searchSelectedMembers}
            />
          </ScrollArea>
        </>
      )}
    </>
  );
}

interface GroupsTableProps {
  onGroupsUpdated: (groups: GroupType[]) => void;
  searchSelectedGroups: string;
  selectedGroups: GroupType[];
}

function GroupsTable({
  onGroupsUpdated,
  searchSelectedGroups,
  selectedGroups,
}: GroupsTableProps) {
  const sendNotifications = useSendNotification();
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 50,
  });

  const removeGroup = (group: GroupType) => {
    if (selectedGroups.length === 1) {
      sendNotifications({
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
