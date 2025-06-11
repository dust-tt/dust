import {
  Button,
  DataTable,
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
  Tabs,
  TabsList,
  TabsTrigger,
  useSendNotification,
  XMarkIcon,
} from "@dust-tt/sparkle";
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
import { SearchGroupsDropdown } from "@app/components/spaces/SearchGroupsDropdown";
import { SearchMembersPopover } from "@app/components/spaces/SearchMembersPopover";
import { useGroups } from "@app/lib/swr/groups";
import {
  useCreateSpace,
  useDeleteSpace,
  useSpaceInfo,
  useUpdateSpace,
} from "@app/lib/swr/spaces";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
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
  const [spaceName, setSpaceName] = useState<string>(space?.name ?? "");
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

  const { hasFeature } = useFeatureFlags({
    workspaceId: owner.sId,
  });

  const isWorkOSFeatureEnabled = hasFeature("workos");

  useEffect(() => {
    if (!isWorkOSFeatureEnabled) {
      setManagementType("manual");
    }
  }, [isWorkOSFeatureEnabled]);

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

  const { groups } = useGroups({
    owner,
    kinds: ["provisioned"],
    spaceId: space?.sId,
    disabled: !isWorkOSFeatureEnabled,
  });

  useEffect(() => {
    if (isOpen) {
      const spaceMembers = spaceInfo?.members ?? null;

      // Initialize management type from space data (if editing) or default to manual for new spaces
      if (spaceInfo?.managementMode !== undefined) {
        setManagementType(spaceInfo.managementMode);
      } else {
        setManagementType("manual");
      }

      if (spaceMembers && spaceInfo?.isRestricted) {
        setSelectedMembers(spaceMembers);
      } else {
        setSelectedMembers([]);
      }

      // Initialize selected groups based on space's groupIds (only if workos feature is enabled)
      if (
        isWorkOSFeatureEnabled &&
        spaceInfo?.groupIds &&
        spaceInfo.groupIds.length > 0 &&
        groups
      ) {
        const spaceGroups = groups.filter((group) =>
          spaceInfo.groupIds.includes(group.sId)
        );
        setSelectedGroups(spaceGroups);
      } else {
        setSelectedGroups([]);
      }

      setSpaceName(spaceInfo?.name ?? "");

      setIsRestricted(
        spaceInfo ? spaceInfo.isRestricted : defaultRestricted ?? false
      );
    }
  }, [defaultRestricted, groups, isOpen, isWorkOSFeatureEnabled, spaceInfo]);

  const handleClose = useCallback(() => {
    // Call the original onClose function.
    onClose();

    setTimeout(() => {
      // Reset state.
      setSpaceName("");
      setIsRestricted(false);
      setSelectedMembers([]);
      setSelectedGroups([]);
      setManagementType("manual");
      setShowDeleteConfirmDialog(false);
      setIsDeleting(false);
      setIsSaving(false);
    }, 500);
  }, [onClose]);

  const onSave = useCallback(async () => {
    setIsSaving(true);

    if (space) {
      if (isRestricted) {
        if (isWorkOSFeatureEnabled && managementType === "group") {
          await doUpdate(space, {
            isRestricted: true,
            groupIds: selectedGroups.map((group) => group.sId),
            managementMode: "group",
            name: spaceName,
          });
        } else {
          await doUpdate(space, {
            isRestricted: true,
            memberIds: deduplicatedMembers.map((vm) => vm.sId),
            managementMode: "manual",
            name: spaceName,
          });
        }
      } else {
        await doUpdate(space, {
          isRestricted: false,
          memberIds: null,
          managementMode: "manual",
          name: spaceName,
        });
      }

      // FIXME: we should update the page space's name as well.
      await mutateSpaceInfo();
    } else if (!space) {
      let createdSpace;

      if (isRestricted) {
        if (isWorkOSFeatureEnabled && managementType === "group") {
          createdSpace = await doCreate({
            name: spaceName,
            isRestricted: true,
            groupIds: selectedGroups.map((group) => group.sId),
            managementMode: "group",
          });
        } else {
          createdSpace = await doCreate({
            name: spaceName,
            isRestricted: true,
            memberIds: deduplicatedMembers.map((vm) => vm.sId),
            managementMode: "manual",
          });
        }
      } else {
        createdSpace = await doCreate({
          name: spaceName,
          isRestricted: false,
          memberIds: null,
          managementMode: "manual",
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
    managementType,
    selectedGroups,
    isWorkOSFeatureEnabled,
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
      if (!isMembersManagementType(value) || !isWorkOSFeatureEnabled) {
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
          setManagementType("group");
        }
      }
      // If switching from group to manual mode with selected groups
      else if (
        managementType === "group" &&
        value === "manual" &&
        selectedGroups.length > 0
      ) {
        const confirmed = await confirm({
          title: "Switch to Manual Management",
          message:
            "Switching to manual member management will remove all selected groups",
          validateLabel: "Switch to Manual",
          validateVariant: "warning",
        });

        if (confirmed) {
          setSelectedGroups([]);
          setManagementType("manual");
        }
      } else {
        // For direct switches without selections, clear everything and let user start fresh
        setSelectedMembers([]);
        setSelectedGroups([]);
        setManagementType(value);
      }
    },
    [
      confirm,
      managementType,
      selectedMembers.length,
      selectedGroups.length,
      isWorkOSFeatureEnabled,
    ]
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
                {isWorkOSFeatureEnabled ? (
                  <Tabs
                    value={managementType}
                    onValueChange={(tabId) => {
                      if (isMembersManagementType(tabId)) {
                        void handleManagementTypeChange(tabId);
                      }
                    }}
                  >
                    <TabsList>
                      <TabsTrigger value="manual" label="Members management" />
                      <TabsTrigger value="group" label="Group management" />
                    </TabsList>
                  </Tabs>
                ) : null}

                <div className="flex flex-row items-center justify-between">
                  {!isWorkOSFeatureEnabled || managementType === "manual" ? (
                    <SearchMembersPopover
                      owner={owner}
                      selectedMembers={deduplicatedMembers}
                      onMembersUpdated={setSelectedMembers}
                    />
                  ) : (
                    <SearchGroupsDropdown
                      owner={owner}
                      selectedGroups={selectedGroups}
                      onGroupsUpdated={setSelectedGroups}
                    />
                  )}
                </div>
                <SearchInput
                  name="search"
                  placeholder={
                    !isWorkOSFeatureEnabled || managementType === "manual"
                      ? "Search (email)"
                      : "Search groups"
                  }
                  value={searchSelectedMembers}
                  onChange={(s) => {
                    setSearchSelectedMembers(s);
                  }}
                />
                <ScrollArea className="h-full">
                  {!isWorkOSFeatureEnabled || managementType === "manual" ? (
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
                spaceName.trim().length > 0 &&
                (!isRestricted ||
                  (isRestricted &&
                    (deduplicatedMembers.length > 0 ||
                      (isWorkOSFeatureEnabled && selectedGroups.length > 0))))
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
    memberCount: group.memberCount,
  }));
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
