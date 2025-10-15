import {
  Button,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyCTA,
  Input,
  MoreIcon,
  Page,
  PencilSquareIcon,
  ScrollArea,
  SearchInput,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SliderToggle,
  TrashIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type {
  CellContext,
  PaginationState,
  SortingState,
} from "@tanstack/react-table";
import { useRouter } from "next/router";
import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ConfirmContext } from "@app/components/Confirm";
import { GroupsList } from "@app/components/groups/GroupsList";
import { ConfirmDeleteSpaceDialog } from "@app/components/spaces/ConfirmDeleteSpaceDialog";
import { EditSpaceNameDialog } from "@app/components/spaces/EditSpaceNameDialog";
import { SearchGroupsDropdown } from "@app/components/spaces/SearchGroupsDropdown";
import { SearchMembersDropdown } from "@app/components/spaces/SearchMembersDropdown";
import { useSendNotification } from "@app/hooks/useNotification";
import { useGroups } from "@app/lib/swr/groups";
import {
  useCreateSpace,
  useDeleteSpace,
  useSpaceInfo,
  useUpdateSpace,
} from "@app/lib/swr/spaces";
import { useUser } from "@app/lib/swr/user";
import type {
  GroupType,
  LightWorkspaceType,
  PlanType,
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
  plan: PlanType;
}

export function CreateOrEditSpaceModal({
  defaultRestricted,
  isAdmin,
  isOpen,
  onClose,
  onCreated,
  owner,
  space,
  plan,
}: CreateOrEditSpaceModalProps) {
  const confirm = React.useContext(ConfirmContext);
  const [spaceName, setSpaceName] = useState<string>(space?.name ?? "");
  const [selectedMembers, setSelectedMembers] = useState<UserType[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<GroupType[]>([]);

  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirmDialog, setShowDeleteConfirmDialog] = useState(false);
  const [showEditNameDialog, setShowEditNameDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRestricted, setIsRestricted] = useState(false);
  const [searchSelectedMembers, setSearchSelectedMembers] =
    useState<string>("");
  const [managementType, setManagementType] =
    useState<MembersManagementType>("manual");
  const [isDirty, setIsDirty] = useState(false);

  const planAllowsSCIM = plan.limits.users.isSCIMAllowed;
  const { user } = useUser();

  useEffect(() => {
    if (!planAllowsSCIM) {
      setManagementType("manual");
    }
  }, [planAllowsSCIM]);

  const doCreate = useCreateSpace({ owner });
  const doUpdate = useUpdateSpace({ owner });
  const doDelete = useDeleteSpace({ owner, force: true });

  const router = useRouter();

  const { spaceInfo, mutateSpaceInfo } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId: space?.sId ?? null,
    includeAllMembers: true, // Always include all members so we can see suspended ones when switching modes
  });

  const { groups } = useGroups({
    owner,
    kinds: ["provisioned"],
    disabled: !planAllowsSCIM,
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

      // Initialize selected groups based on space's groupIds (only if workos feature is enabled)
      if (
        planAllowsSCIM &&
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

      const isRestricted = spaceInfo
        ? spaceInfo.isRestricted
        : defaultRestricted ?? false;
      setIsRestricted(isRestricted);

      let initialMembers: UserType[] = [];
      if (spaceMembers && isRestricted) {
        initialMembers = spaceMembers;
      } else if (!space) {
        initialMembers = [];
      }

      // Auto-add current user when opening with restricted access for new spaces
      if (isRestricted && !space && user && initialMembers.length === 0) {
        initialMembers = [user];
      }

      setSelectedMembers(initialMembers);
    }
  }, [
    defaultRestricted,
    groups,
    isOpen,
    planAllowsSCIM,
    spaceInfo,
    user,
    space,
  ]);

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
      setShowEditNameDialog(false);
      setIsDeleting(false);
      setIsSaving(false);
    }, 500);
  }, [onClose]);

  const onSave = useCallback(async () => {
    setIsSaving(true);

    if (space) {
      if (isRestricted) {
        if (planAllowsSCIM && managementType === "group") {
          await doUpdate(space, {
            isRestricted: true,
            groupIds: selectedGroups.map((group) => group.sId),
            managementMode: "group",
            name: spaceName,
          });
        } else {
          await doUpdate(space, {
            isRestricted: true,
            memberIds: selectedMembers.map((vm) => vm.sId),
            managementMode: "manual",
            name: spaceName,
          });
        }
      } else {
        await doUpdate(space, {
          isRestricted: false,
          name: spaceName,
        });
      }

      // FIXME: we should update the page space's name as well.
      await mutateSpaceInfo();
    } else if (!space) {
      let createdSpace;

      if (isRestricted) {
        if (planAllowsSCIM && managementType === "group") {
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
            memberIds: selectedMembers.map((vm) => vm.sId),
            managementMode: "manual",
          });
        }
      } else {
        createdSpace = await doCreate({
          name: spaceName,
          isRestricted: false,
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
    space,
    selectedMembers,
    spaceName,
    managementType,
    selectedGroups,
    planAllowsSCIM,
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

  const onEditName = async (newName: string) => {
    if (!space || !newName.trim()) {
      setShowEditNameDialog(false);
      return;
    }

    if (spaceInfo) {
      await doUpdate(space, {
        name: newName.trim(),
        isRestricted: spaceInfo.isRestricted,
      });
      await mutateSpaceInfo();
    }

    setSpaceName(newName.trim());
    setShowEditNameDialog(false);
  };

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
          setManagementType("group");
          setIsDirty(true);
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
          setManagementType("manual");
          setIsDirty(true);
        }
      } else {
        // For direct switches without selections, clear everything and let the user start fresh.
        setManagementType(value);
        setIsDirty(true);
      }
    },
    [
      confirm,
      managementType,
      selectedMembers.length,
      selectedGroups.length,
      planAllowsSCIM,
    ]
  );

  const disabled = useMemo(() => {
    const canSave =
      !isRestricted ||
      (managementType === "manual" && selectedMembers.length > 0) ||
      (managementType === "group" && selectedGroups.length > 0);

    if (!spaceInfo) {
      return !canSave;
    }

    return !isDirty || !canSave;
  }, [
    isRestricted,
    managementType,
    selectedMembers,
    selectedGroups,
    spaceInfo,
    isDirty,
  ]);
  const isManual = !planAllowsSCIM || managementType === "manual";
  return (
    <Sheet open={isOpen} onOpenChange={handleClose}>
      <SheetContent trapFocusScope={false} size="lg">
        <SheetHeader>
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-0">
              <SheetTitle>
                Space Settings{space ? `- ${spaceName}` : ""}
              </SheetTitle>
            </div>

            {isAdmin && space && space.kind === "regular" && (
              <>
                <ConfirmDeleteSpaceDialog
                  spaceInfoByCategory={spaceInfo?.categories}
                  space={space}
                  handleDelete={onDelete}
                  isOpen={showDeleteConfirmDialog}
                  isDeleting={isDeleting}
                  onClose={() => setShowDeleteConfirmDialog(false)}
                />
                <EditSpaceNameDialog
                  spaceInfo={spaceInfo}
                  handleEditName={onEditName}
                  isOpen={showEditNameDialog}
                  isSaving={isSaving}
                  onClose={() => setShowEditNameDialog(false)}
                />
                <div className="flex w-full justify-end">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button icon={MoreIcon} size="sm" variant="ghost" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem
                        label="Rename space"
                        onClick={() => setShowEditNameDialog(true)}
                        icon={PencilSquareIcon}
                      />
                      <DropdownMenuItem
                        label="Delete Space"
                        onClick={() => setShowDeleteConfirmDialog(true)}
                        icon={TrashIcon}
                        variant="warning"
                      />
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </>
            )}
          </div>
        </SheetHeader>
        <SheetContainer>
          <div className="flex w-full flex-col gap-y-4">
            {!space && (
              <div className="mb-4 flex w-full flex-col gap-y-4">
                <Page.SectionHeader title="Name" />
                <Input
                  placeholder="Space's name"
                  value={spaceName}
                  name="spaceName"
                  message="Space name must be unique"
                  messageStatus="info"
                  onChange={(e) => {
                    setSpaceName(e.target.value);
                    setIsDirty(true);
                  }}
                />
              </div>
            )}

            <div className="flex w-full items-center justify-between overflow-visible">
              <Page.SectionHeader title="Restricted Access" />
              <SliderToggle
                selected={isRestricted}
                onClick={() => {
                  const newRestricted = !isRestricted;
                  setIsRestricted(newRestricted);
                  setIsDirty(true);

                  // Auto-add current user when enabling restricted access for new spaces
                  if (
                    newRestricted &&
                    !space &&
                    user &&
                    selectedMembers.length === 0
                  ) {
                    setSelectedMembers([user, ...selectedMembers]);
                  }
                }}
              />
            </div>
            {isRestricted ? (
              <span>Restricted access is active.</span>
            ) : (
              <span>
                Restricted access is disabled. The space is accessible to
                everyone in the workspace.
              </span>
            )}

            {isRestricted && (
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
                            if (isMembersManagementType("manual")) {
                              void handleManagementTypeChange("manual");
                            }
                          }}
                        />
                        <DropdownMenuItem
                          label="Provisioned group access"
                          onClick={() => {
                            if (isMembersManagementType("group")) {
                              void handleManagementTypeChange("group");
                            }
                          }}
                        />
                      </DropdownMenuContent>
                    </DropdownMenu>
                    {isManual && selectedMembers.length > 0 && (
                      <SearchMembersDropdown
                        owner={owner}
                        selectedMembers={selectedMembers}
                        onMembersUpdated={(members) => {
                          setSelectedMembers(members);
                          setIsDirty(true);
                        }}
                      />
                    )}
                    {!isManual && selectedGroups.length > 0 && (
                      <SearchGroupsDropdown
                        owner={owner}
                        selectedGroups={selectedGroups}
                        onGroupsUpdated={(groups) => {
                          setSelectedGroups(groups);
                          setIsDirty(true);
                        }}
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
                        onMembersUpdated={(members) => {
                          setSelectedMembers(members);
                          setIsDirty(true);
                        }}
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
                        onMembersUpdated={(members) => {
                          setSelectedMembers(members);
                          setIsDirty(true);
                        }}
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
                        onGroupsUpdated={(groups) => {
                          setSelectedGroups(groups);
                          setIsDirty(true);
                        }}
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
                      onChange={(s) => {
                        setSearchSelectedMembers(s);
                      }}
                    />
                    <ScrollArea className="h-full">
                      <MembersTable
                        onMembersUpdated={(members) => {
                          setSelectedMembers(members);
                          setIsDirty(true);
                        }}
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
                      onChange={(s) => {
                        setSearchSelectedMembers(s);
                      }}
                    />
                    <ScrollArea className="h-full">
                      <GroupsTable
                        onGroupsUpdated={(groups) => {
                          setSelectedGroups(groups);
                          setIsDirty(true);
                        }}
                        selectedGroups={selectedGroups}
                        searchSelectedGroups={searchSelectedMembers}
                      />
                    </ScrollArea>
                  </>
                )}
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
            disabled: disabled,
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
