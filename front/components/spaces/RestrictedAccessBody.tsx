import {
  Button,
  Checkbox,
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
import type {
  LightWorkspaceType,
  SpaceGroupType,
  SpaceUserType,
  UserType,
} from "@app/types";

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
  selectedGroups: SpaceGroupType[];
  canSetEditors?: boolean;
  onManagementTypeChange: (managementType: MembersManagementType) => void;
  onMembersUpdated: (members: UserType[]) => void;
  onGroupsUpdated: (groups: SpaceGroupType[]) => void;
  disabled?: boolean;
}

export function RestrictedAccessBody({
  isManual,
  planAllowsSCIM,
  managementType,
  owner,
  selectedMembers,
  selectedGroups,
  canSetEditors,
  onManagementTypeChange,
  onMembersUpdated,
  onGroupsUpdated,
  disabled = false,
}: RestrictedAccessBodyProps) {
  const confirm = useContext(ConfirmContext);
  const [searchSelectedMembers, setSearchSelectedMembers] = useState("");

  const handleManagementTypeChange = useCallback(
    async (newManagementType: string) => {
      if (!isMembersManagementType(newManagementType) || !planAllowsSCIM) {
        return;
      }

      // If switching from manual to group mode with manually added members.
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
      }
      // If switching from group to manual mode with selected groups.
      else if (
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
        // For direct switches without selections, clear everything and let the user start fresh.
        onManagementTypeChange(newManagementType);
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
              disabled={disabled}
            />
          )}
          {!isManual && selectedGroups.length > 0 && (
            <SearchGroupsDropdown
              owner={owner}
              selectedGroups={selectedGroups}
              onGroupsUpdated={onGroupsUpdated}
              disabled={disabled}
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
              disabled={disabled}
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
              disabled={disabled}
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
              disabled={disabled}
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
              canSetEditors={canSetEditors}
              disabled={disabled}
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
              canSetEditors={canSetEditors}
              disabled={disabled}
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
  isEditor?: boolean;
  onClick?: () => void;
};

type MemberInfo = CellContext<MemberRowData, unknown>;

function getMemberTableRows(allUsers: SpaceUserType[]): MemberRowData[] {
  return allUsers.map((user) => ({
    icon: user.image ?? "",
    name: user.fullName,
    userId: user.sId,
    email: user.email ?? "",
    isEditor: user.isEditor ?? false,
  }));
}

interface MembersTableProps {
  onMembersUpdated: (members: SpaceUserType[]) => void;
  selectedMembers: SpaceUserType[];
  searchSelectedMembers: string;
  canSetEditors?: boolean;
  disabled?: boolean;
}

function MembersTable({
  onMembersUpdated,
  selectedMembers,
  searchSelectedMembers,
  canSetEditors,
  disabled = false,
}: MembersTableProps) {
  const editorIds = useMemo(
    () => selectedMembers.filter((m) => m.isEditor).map((m) => m.sId),
    [selectedMembers]
  );
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

    const toggleEditor = (userId: string) => {
      if (!canSetEditors) {
        return;
      }
      const toggledMember = selectedMembers.find((m) => m.sId === userId);
      onMembersUpdated([
        ...selectedMembers.slice(0, selectedMembers.indexOf(toggledMember!)),
        {
          ...toggledMember!,
          isEditor: !toggledMember?.isEditor,
        },
        ...selectedMembers.slice(selectedMembers.indexOf(toggledMember!) + 1),
      ]);
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
      ...(canSetEditors
        ? [
            {
              id: "editor",
              header: "Editor",
              meta: {
                className: "w-20",
              },
              cell: (info: MemberInfo) => {
                const isEditor = editorIds.includes(info.row.original.userId);
                return (
                  <DataTable.CellContent>
                    <Checkbox
                      checked={isEditor}
                      onCheckedChange={() =>
                        toggleEditor(info.row.original.userId)
                      }
                      disabled={disabled}
                    />
                  </DataTable.CellContent>
                );
              },
            },
          ]
        : []),
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
                disabled={disabled}
              />
            </DataTable.CellContent>
          );
        },
      },
    ];
  }, [
    onMembersUpdated,
    selectedMembers,
    sendNotifications,
    disabled,
    canSetEditors,
    editorIds,
  ]);

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
  onGroupsUpdated: (groups: SpaceGroupType[]) => void;
  selectedGroups: SpaceGroupType[];
  searchSelectedGroups: string;
  canSetEditors?: boolean;
  disabled?: boolean;
}

function GroupsTable({
  onGroupsUpdated,
  selectedGroups,
  searchSelectedGroups,
  canSetEditors = false,
  disabled = false,
}: GroupsTableProps) {
  const sendNotifications = useSendNotification();
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 50,
  });

  const toggleEditor = useCallback(
    (group: string) => {
      if (!canSetEditors) {
        return;
      }
      const toggledMember = selectedGroups.find((m) => m.sId === group);
      onGroupsUpdated([
        ...selectedGroups.slice(0, selectedGroups.indexOf(toggledMember!)),
        {
          ...toggledMember!,
          isEditor: !toggledMember?.isEditor,
        },
        ...selectedGroups.slice(selectedGroups.indexOf(toggledMember!) + 1),
      ]);
    },
    [canSetEditors, onGroupsUpdated, selectedGroups]
  );

  const removeGroup = useCallback(
    (group: SpaceGroupType) => {
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
      showColumns={
        canSetEditors
          ? ["name", "memberCount", "isEditor", "action"]
          : ["name", "memberCount", "action"]
      }
      disabled={disabled}
      onToggleEditor={toggleEditor}
      onRemoveGroupClick={removeGroup}
      pagination={pagination}
      setPagination={setPagination}
    />
  );
}
