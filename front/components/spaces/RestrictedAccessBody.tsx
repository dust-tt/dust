import {
  Button,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyCTA,
  ScrollArea,
  SearchInput,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type {
  CellContext,
  PaginationState,
  SortingState,
} from "@tanstack/react-table";
import * as React from "react";
import { useCallback, useContext, useMemo, useState } from "react";

import { ConfirmContext } from "@app/components/Confirm";
import { GroupsList } from "@app/components/groups/GroupsList";
import { SearchGroupsDropdown } from "@app/components/spaces/SearchGroupsDropdown";
import { SearchMembersDropdown } from "@app/components/spaces/SearchMembersDropdown";
import { useSendNotification } from "@app/hooks/useNotification";
import type { GroupType, LightWorkspaceType, UserType } from "@app/types";

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
  onManagementTypeChange: (value: MembersManagementType) => void;
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
  const [searchSelectedMembers, setSearchSelectedMembers] = useState("");

  const handleManagementTypeChange = useCallback(
    async (value: string) => {
      if (!isMembersManagementType(value) || !planAllowsSCIM) {
        return;
      }

      // If switching from manual to group mode with manually added members.
      if (
        managementType === "manual" &&
        value === "group" &&
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
      }
      // If switching from group to manual mode with selected groups.
      else if (
        managementType === "group" &&
        value === "manual" &&
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
        // For direct switches without selections, clear everything and let the user start fresh.
        onManagementTypeChange(value);
      }
    },
    [
      confirm,
      managementType,
      selectedMembers.length,
      selectedGroups.length,
      planAllowsSCIM,
      onManagementTypeChange,
    ]
  );

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
          {isManual && selectedMembers.length > 0 && (
            <SearchMembersDropdown
              owner={owner}
              selectedMembers={selectedMembers}
              onMembersUpdated={onMembersUpdated}
            />
          )}
          {!isManual && selectedGroups.length > 0 && (
            <SearchGroupsDropdown
              owner={owner}
              selectedGroups={selectedGroups}
              onGroupsUpdated={onGroupsUpdated}
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
              onMembersUpdated={onMembersUpdated}
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
              onMembersUpdated={onMembersUpdated}
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
              onGroupsUpdated={onGroupsUpdated}
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
              onMembersUpdated={onMembersUpdated}
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
              onGroupsUpdated={onGroupsUpdated}
              selectedGroups={selectedGroups}
              searchSelectedGroups={searchSelectedMembers}
            />
          </ScrollArea>
        </>
      )}
    </>
  );
}

type MemberRowData = {
  icon: string;
  name: string;
  userId: string;
  email: string;
  onClick?: () => void;
};

type MemberInfo = CellContext<MemberRowData, unknown>;

function getMemberTableRows(allUsers: UserType[]): MemberRowData[] {
  return allUsers.map((user) => ({
    icon: user.image ?? "",
    name: user.fullName,
    userId: user.sId,
    email: user.email ?? "",
  }));
}

interface MembersTableProps {
  onMembersUpdated: (members: UserType[]) => void;
  selectedMembers: UserType[];
  searchSelectedMembers: string;
}

function MembersTable({
  onMembersUpdated,
  selectedMembers,
  searchSelectedMembers,
}: MembersTableProps) {
  const sendNotifications = useSendNotification();
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 50,
  });
  const [sorting, setSorting] = useState<SortingState>([
    { id: "email", desc: false },
  ]);

  const getTableColumns = useCallback(() => {
    const removeMember = (userId: string) => {
      if (selectedMembers.length === 1) {
        sendNotifications({
          title: "Cannot remove last member.",
          description: "You cannot remove the last group member.",
          type: "error",
        });
        return;
      }
      onMembersUpdated(selectedMembers.filter((m) => m.sId !== userId));
    };
    return [
      {
        id: "name",
        accessorKey: "name",
        cell: (info: MemberInfo) => (
          <>
            <DataTable.CellContent
              avatarUrl={info.row.original.icon}
              className="hidden md:flex"
            >
              {info.row.original.name}
            </DataTable.CellContent>
            <DataTable.CellContent
              avatarUrl={info.row.original.icon}
              className="flex md:hidden"
              description={info.row.original.email}
            >
              {info.row.original.name}
            </DataTable.CellContent>
          </>
        ),
        enableSorting: true,
      },
      {
        id: "email",
        accessorKey: "email",
        cell: (info: MemberInfo) => (
          <DataTable.BasicCellContent label={info.row.original.email} />
        ),
        enableSorting: true,
      },
      {
        id: "action",
        meta: {
          className: "w-12",
        },
        cell: (info: MemberInfo) => {
          return (
            <DataTable.CellContent>
              <Button
                icon={XMarkIcon}
                size="xs"
                variant="ghost-secondary"
                onClick={() => removeMember(info.row.original.userId)}
              />
            </DataTable.CellContent>
          );
        },
      },
    ];
  }, [onMembersUpdated, selectedMembers, sendNotifications]);

  const rows = useMemo(
    () => getMemberTableRows(selectedMembers),
    [selectedMembers]
  );
  const columns = useMemo(() => getTableColumns(), [getTableColumns]);

  return (
    <DataTable
      data={rows}
      columns={columns}
      columnsBreakpoints={{
        name: "md",
      }}
      pagination={pagination}
      setPagination={setPagination}
      sorting={sorting}
      setSorting={setSorting}
      totalRowCount={rows.length}
      filter={searchSelectedMembers}
      filterColumn="email"
    />
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
  const sendNotifications = useSendNotification();
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 50,
  });

  const removeGroup = useCallback(
    (group: GroupType) => {
      if (selectedGroups.length === 1) {
        sendNotifications({
          title: "Cannot remove last group.",
          description: "You cannot remove the last group.",
          type: "error",
        });
        return;
      }
      onGroupsUpdated(selectedGroups.filter((g) => g.sId !== group.sId));
    },
    [onGroupsUpdated, selectedGroups, sendNotifications]
  );

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
