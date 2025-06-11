import {
  Button,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  Input,
  Label,
  Page,
  ScrollArea,
  SearchInput,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SliderToggle,
  useSendNotification,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { MoreIcon } from "@dust-tt/sparkle";
import type {
  CellContext,
  PaginationState,
  SortingState,
} from "@tanstack/react-table";
import _ from "lodash";
import { useRouter } from "next/router";
import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ConfirmContext } from "@app/components/Confirm";
import { ConfirmDeleteSpaceDialog } from "@app/components/spaces/ConfirmDeleteSpaceDialog";
import { SearchMembersPopover } from "@app/components/spaces/SearchMembersPopover";
import { UserGroupPopover } from "@app/components/spaces/UserGroupPopover";
import { useMembersCount } from "@app/lib/swr/memberships";
import {
  useCreateSpace,
  useDeleteSpace,
  useSpaceInfo,
  useUpdateSpace,
} from "@app/lib/swr/spaces";
import type {
  GroupType,
  LightWorkspaceType,
  SpaceType,
  UserType,
} from "@app/types";

type MembersManagementType = "manual" | "group";

function isMembersManagementType(
  value: string
): value is MembersManagementType {
  return value === "manual" || value === "group";
}

interface CreateOrEditSpaceModalProps {
  defaultRestricted?: boolean;
  isAdmin: boolean;
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (space: SpaceType) => void;
  owner: LightWorkspaceType;
  space?: SpaceType;
}

export function CreateOrEditSpaceModal({
  defaultRestricted,
  isAdmin,
  isOpen,
  onClose,
  onCreated,
  owner,
  space,
}: CreateOrEditSpaceModalProps) {
  const confirm = React.useContext(ConfirmContext);
  const membersCount = useMembersCount(owner);
  const [spaceName, setSpaceName] = useState<string | null>(
    space?.name ?? null
  );
  const [selectedMembers, setSelectedMembers] = useState<UserType[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<GroupType[]>([]);

  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirmDialog, setShowDeleteConfirmDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRestricted, setIsRestricted] = useState(false);
  const [searchSelectedMembers, setSearchSelectedMembers] =
    useState<string>("");
  const [managementType, setManagementType] =
    useState<MembersManagementType>("manual");

  useEffect(() => {
    if (membersCount > 0) {
      setManagementType("manual");
    } else if (selectedGroups.length > 0) {
      setManagementType("group");
    }
  }, [membersCount, selectedGroups.length]);

  const deduplicatedMembers = useMemo(
    () => _.uniqBy(selectedMembers, "sId"),
    [selectedMembers]
  );

  const doCreate = useCreateSpace({ owner });
  const doUpdate = useUpdateSpace({ owner });
  const doDelete = useDeleteSpace({ owner });

  const router = useRouter();

  const { spaceInfo, mutateSpaceInfo } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId: space?.sId ?? null,
  });

  useEffect(() => {
    if (isOpen) {
      const spaceMembers = spaceInfo?.members ?? null;

      if (spaceMembers && spaceInfo?.isRestricted) {
        setSelectedMembers(spaceMembers);
      }

      setSpaceName(spaceInfo?.name ?? null);

      setIsRestricted(
        spaceInfo ? spaceInfo.isRestricted : defaultRestricted ?? false
      );
    }
  }, [defaultRestricted, isOpen, spaceInfo]);

  const handleClose = useCallback(() => {
    // Call the original onClose function.
    onClose();

    setTimeout(() => {
      // Reset state.
      setSpaceName("");
      setIsRestricted(false);
      setSelectedMembers([]);
      setSelectedGroups([]);
      setShowDeleteConfirmDialog(false);
      setIsDeleting(false);
      setIsSaving(false);
    }, 500);
  }, [onClose]);

  const onSave = useCallback(async () => {
    setIsSaving(true);

    if (space) {
      if (isRestricted) {
        await doUpdate(space, {
          isRestricted: true,
          memberIds: deduplicatedMembers.map((vm) => vm.sId),
          name: spaceName,
        });
      } else {
        await doUpdate(space, {
          isRestricted: false,
          memberIds: null,
          name: spaceName,
        });
      }

      // FIXME: we should update the page space's name as well.
      await mutateSpaceInfo();
    } else if (!space) {
      let createdSpace;

      if (isRestricted) {
        createdSpace = await doCreate({
          name: spaceName,
          isRestricted: true,
          memberIds: deduplicatedMembers.map((vm) => vm.sId),
        });
      } else {
        createdSpace = await doCreate({
          name: spaceName,
          isRestricted: false,
          memberIds: null, // must be null when isRestricted is false
        });
      }

      setIsSaving(false);
      if (createdSpace && onCreated) {
        onCreated(createdSpace);
      }
    }

    handleClose();
  }, [
    doCreate,
    doUpdate,
    handleClose,
    isRestricted,
    mutateSpaceInfo,
    onCreated,
    deduplicatedMembers,
    space,
    spaceName,
  ]);

  const onDelete = useCallback(async () => {
    if (!space) {
      setShowDeleteConfirmDialog(false);
      return;
    }

    setIsDeleting(true);

    const res = await doDelete(space);
    setIsDeleting(false);
    setShowDeleteConfirmDialog(false);

    if (res) {
      handleClose();
      await router.push(`/w/${owner.sId}/spaces`);
    }
  }, [doDelete, handleClose, owner.sId, router, space]);

  const handleManagementTypeChange = useCallback(
    async (value: string) => {
      if (!isMembersManagementType(value)) {
        return;
      }

      // If switching from manual to group mode with manually added members
      if (
        managementType === "manual" &&
        value === "group" &&
        selectedMembers.length > 0
      ) {
        const confirmed = await confirm({
          title: "Switch to Group Management",
          message:
            "Switching to group member management will remove all manually added members",
          validateLabel: "Switch to Groups",
          validateVariant: "warning",
        });

        if (confirmed) {
          setSelectedMembers([]);
          setManagementType(value);
        }
      } else {
        setManagementType(value);
      }
    },
    [confirm, managementType, selectedMembers.length]
  );

  return (
    <Sheet open={isOpen} onOpenChange={handleClose}>
      <SheetContent trapFocusScope={false} size="lg">
        <SheetHeader>
          <SheetTitle>
            {space ? `Edit ${space.name}` : "Create a Space"}
          </SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <div className="flex w-full flex-col gap-y-4">
            <div className="mb-4 flex w-full flex-col gap-y-2">
              <Page.SectionHeader title="Name" />
              {!space ? (
                <Input
                  placeholder="Space's name"
                  value={spaceName}
                  name="spaceName"
                  message="Space name must be unique"
                  messageStatus="info"
                  onChange={(e) => setSpaceName(e.target.value)}
                />
              ) : (
                <Input
                  placeholder="Space's name"
                  value={spaceName}
                  name="spaceName"
                  onChange={(e) => setSpaceName(e.target.value)}
                />
              )}
            </div>

            <div className="flex w-full flex-col gap-y-2 border-t pt-2">
              <div className="flex w-full items-center justify-between overflow-visible">
                <Page.SectionHeader title="Restricted Access" />
                <SliderToggle
                  selected={isRestricted}
                  onClick={() => setIsRestricted(!isRestricted)}
                />
              </div>
              {isRestricted ? (
                <Label>Restricted access is active.</Label>
              ) : (
                <Label>
                  Restricted access is disabled. The space is accessible to
                  everyone in the workspace.
                </Label>
              )}
            </div>

            {isRestricted && (
              <>
                {deduplicatedMembers.length === 0 &&
                selectedGroups.length === 0 ? (
                  <div className="flex flex-col items-center gap-2">
                    <SearchMembersPopover
                      owner={owner}
                      selectedMembers={deduplicatedMembers}
                      onMembersUpdated={setSelectedMembers}
                    />
                    <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                      or
                    </span>
                    <UserGroupPopover
                      owner={owner}
                      selectedMembers={deduplicatedMembers}
                      onMembersUpdated={setSelectedMembers}
                    />
                  </div>
                ) : (
                  <div className="flex flex-row items-center justify-between">
                    {managementType === "manual" ? (
                      <SearchMembersPopover
                        owner={owner}
                        selectedMembers={deduplicatedMembers}
                        onMembersUpdated={setSelectedMembers}
                      />
                    ) : (
                      <UserGroupPopover
                        owner={owner}
                        selectedMembers={deduplicatedMembers}
                        onMembersUpdated={setSelectedMembers}
                      />
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" icon={MoreIcon} />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuRadioGroup
                          value={managementType}
                          onValueChange={handleManagementTypeChange}
                        >
                          <DropdownMenuRadioItem value="manual">
                            Manual group management
                          </DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value="group">
                            Group member management
                          </DropdownMenuRadioItem>
                        </DropdownMenuRadioGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
                <SearchInput
                  name="search"
                  placeholder={
                    managementType === "manual"
                      ? "Search (email)"
                      : "Search groups"
                  }
                  value={searchSelectedMembers}
                  onChange={(s) => {
                    setSearchSelectedMembers(s);
                  }}
                />
                <ScrollArea className="h-full">
                  {managementType === "manual" ? (
                    <MembersTable
                      onMembersUpdated={setSelectedMembers}
                      selectedMembers={deduplicatedMembers}
                      searchSelectedMembers={searchSelectedMembers}
                    />
                  ) : (
                    <GroupsTable
                      onGroupsUpdated={setSelectedGroups}
                      selectedGroups={selectedGroups}
                      searchSelectedGroups={searchSelectedMembers}
                      owner={owner}
                    />
                  )}
                </ScrollArea>
              </>
            )}

            {isAdmin && space && space.kind === "regular" && (
              <>
                <ConfirmDeleteSpaceDialog
                  space={space}
                  handleDelete={onDelete}
                  isOpen={showDeleteConfirmDialog}
                  isDeleting={isDeleting}
                  onClose={() => setShowDeleteConfirmDialog(false)}
                />
                <div className="flex w-full justify-end">
                  <Button
                    size="sm"
                    label="Delete Space"
                    variant="warning"
                    onClick={() => setShowDeleteConfirmDialog(true)}
                  />
                </div>
              </>
            )}
          </div>
        </SheetContainer>
        <SheetFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: onClose,
          }}
          rightButtonProps={{
            label: isSaving ? "Saving..." : space ? "Save" : "Create",
            onClick: onSave,
            disabled:
              !(
                !!spaceName &&
                (!isRestricted ||
                  (isRestricted &&
                    (deduplicatedMembers.length > 0 ||
                      selectedGroups.length > 0)))
              ) || isSaving,
          }}
        />
      </SheetContent>
    </Sheet>
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

type GroupRowData = {
  groupId: string;
  name: string;
  memberCount: number;
  onClick?: () => void;
};

type GroupInfo = CellContext<GroupRowData, unknown>;

function getGroupTableRows(allGroups: GroupType[]): GroupRowData[] {
  return allGroups.map((group) => ({
    groupId: group.sId,
    name: group.name,
    memberCount: 0,
  }));
}

interface GroupsTableProps {
  onGroupsUpdated: (groups: GroupType[]) => void;
  selectedGroups: GroupType[];
  searchSelectedGroups: string;
  owner: LightWorkspaceType;
}

function GroupsTable({
  onGroupsUpdated,
  selectedGroups,
  searchSelectedGroups,
  owner,
}: GroupsTableProps) {
  const sendNotifications = useSendNotification();
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 50,
  });
  const [sorting, setSorting] = useState<SortingState>([
    { id: "name", desc: false },
  ]);

  const getTableColumns = useCallback(() => {
    const removeGroup = (groupId: string) => {
      if (selectedGroups.length === 1) {
        sendNotifications({
          title: "Cannot remove last group.",
          description: "You cannot remove the last group.",
          type: "error",
        });
        return;
      }
      onGroupsUpdated(selectedGroups.filter((g) => g.sId !== groupId));
    };
    return [
      {
        id: "name",
        accessorKey: "name",
        cell: (info: GroupInfo) => (
          <DataTable.CellContent>
            {info.row.original.name}
          </DataTable.CellContent>
        ),
        enableSorting: true,
      },
      {
        id: "memberCount",
        accessorKey: "memberCount",
        cell: (info: GroupInfo) => (
          <DataTable.BasicCellContent
            label={`${info.row.original.memberCount} members`}
          />
        ),
        enableSorting: true,
      },
      {
        id: "action",
        meta: {
          className: "w-12",
        },
        cell: (info: GroupInfo) => {
          return (
            <DataTable.CellContent>
              <Button
                icon={XMarkIcon}
                size="xs"
                variant="ghost-secondary"
                onClick={() => removeGroup(info.row.original.groupId)}
              />
            </DataTable.CellContent>
          );
        },
      },
    ];
  }, [onGroupsUpdated, selectedGroups, sendNotifications]);

  const rows = useMemo(
    () => getGroupTableRows(selectedGroups),
    [selectedGroups]
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
      filter={searchSelectedGroups}
      filterColumn="name"
    />
  );
}
