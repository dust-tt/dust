import {
  Button,
  ContentMessage,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyCTA,
  Input,
  Page,
  ScrollArea,
  SearchInput,
  Separator,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SliderToggle,
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
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type { SpaceCategoryInfo } from "@app/pages/api/w/[wId]/spaces/[spaceId]";
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
  const { hasFeature } = useFeatureFlags({
    workspaceId: owner.sId,
  });
  const [spaceName, setSpaceName] = useState<string>(space?.name ?? "");
  const [conversationsEnabled, setConversationsEnabled] = useState<boolean>(
    space?.conversationsEnabled ?? false
  );
  const [selectedMembers, setSelectedMembers] = useState<UserType[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<GroupType[]>([]);

  const [isSaving, setIsSaving] = useState(false);
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
        : (defaultRestricted ?? false);
      setIsRestricted(isRestricted);

      let initialMembers: UserType[] = [];
      if (spaceMembers && space) {
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
    setSpaceName,
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
      setIsDeleting(false);
      setIsSaving(false);
      setIsDirty(false);
    }, 500);
  }, [onClose]);

  const onSave = useCallback(async () => {
    const trimmedName = spaceName.trim();
    if (!trimmedName) {
      return;
    }

    setIsSaving(true);

    if (space) {
      if (planAllowsSCIM && managementType === "group") {
        await doUpdate(space, {
          isRestricted,
          conversationsEnabled,
          groupIds: selectedGroups.map((group) => group.sId),
          managementMode: "group",
          name: trimmedName,
        });
      } else {
        await doUpdate(space, {
          isRestricted,
          conversationsEnabled,
          memberIds: selectedMembers.map((vm) => vm.sId),
          managementMode: "manual",
          name: trimmedName,
        });
      }

      // FIXME: we should update the page space's name as well.
      await mutateSpaceInfo();
    } else if (!space) {
      let createdSpace;

      if (planAllowsSCIM && managementType === "group") {
        createdSpace = await doCreate({
          name: trimmedName,
          isRestricted,
          groupIds: selectedGroups.map((group) => group.sId),
          managementMode: "group",
        });
      } else {
        createdSpace = await doCreate({
          name: trimmedName,
          isRestricted,
          memberIds: selectedMembers.map((vm) => vm.sId),
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
    space,
    selectedMembers,
    spaceName,
    managementType,
    selectedGroups,
    planAllowsSCIM,
    conversationsEnabled,
  ]);

  const onDelete = useCallback(async () => {
    if (!space) {
      return;
    }

    setIsDeleting(true);

    const res = await doDelete(space);
    setIsDeleting(false);

    if (res) {
      handleClose();
      await router.push(`/w/${owner.sId}/spaces`);
    }
  }, [doDelete, handleClose, owner.sId, router, space]);

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
    const hasName = spaceName.trim().length > 0;

    const canSave =
      !isRestricted ||
      (managementType === "manual" && selectedMembers.length > 0) ||
      (managementType === "group" && selectedGroups.length > 0);

    if (!spaceInfo) {
      return !canSave || !hasName;
    }

    return !isDirty || !canSave || !hasName;
  }, [
    isRestricted,
    managementType,
    selectedMembers.length,
    selectedGroups.length,
    spaceInfo,
    isDirty,
    spaceName,
  ]);
  const isManual = !planAllowsSCIM || managementType === "manual";

  const handleNameChange = useCallback((value: string) => {
    setSpaceName(value);
    setIsDirty(true);
  }, []);

  const handleConversationsEnabledChange = useCallback((value: boolean) => {
    setConversationsEnabled(value);
    setIsDirty(true);
  }, []);

  return (
    <Sheet open={isOpen} onOpenChange={handleClose}>
      <SheetContent trapFocusScope={false} size="lg">
        <SheetHeader>
          <SheetTitle>
            Space Settings{space ? ` - ${spaceName}` : ""}
          </SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <div className="flex w-full flex-col gap-y-4">
            <SpaceNameSection
              spaceName={spaceName}
              onChange={handleNameChange}
            />
            <SpaceDeleteSection
              isAdmin={isAdmin}
              space={space}
              spaceInfoByCategory={spaceInfo?.categories}
              onDelete={onDelete}
              isDeleting={isDeleting}
            />

            <RestrictedAccessHeader
              isRestricted={isRestricted}
              onToggle={() => {
                const newRestricted = !isRestricted;
                setIsRestricted(newRestricted);
                setIsDirty(true);
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
            {hasFeature("conversations_groups") &&
              space?.kind === "regular" && (
                <div>
                  <ContentMessage
                    title="Alpha: Conversations in Spaces"
                    variant="info"
                    action={
                      <SliderToggle
                        selected={conversationsEnabled}
                        onClick={() => {
                          handleConversationsEnabledChange(
                            !conversationsEnabled
                          );
                        }}
                      />
                    }
                  >
                    <p>
                      This feature is currently in internal testing. It is only
                      available in the Dust workspace ("conversations_groups"
                      feature flag enabled).
                      <br />
                      Enabling this feature will make the space show in the
                      "Chat" sidebar for all members of the space.
                      {!isRestricted && (
                        <>
                          <br />
                          Since this space is not restricted, you can pick which
                          members will see the chat sidebar.
                        </>
                      )}
                    </p>
                  </ContentMessage>
                </div>
              )}
            <RestrictedAccessBody
              isRestricted={isRestricted}
              isManual={isManual}
              areConversationsEnabled={conversationsEnabled}
              planAllowsSCIM={planAllowsSCIM}
              managementType={managementType}
              owner={owner}
              selectedMembers={selectedMembers}
              selectedGroups={selectedGroups}
              searchSelectedMembers={searchSelectedMembers}
              onSearchChange={setSearchSelectedMembers}
              onManagementTypeChange={(value) => {
                void handleManagementTypeChange(value);
              }}
              onMembersUpdated={(members) => {
                setSelectedMembers(members);
                setIsDirty(true);
              }}
              onGroupsUpdated={(groups) => {
                setSelectedGroups(groups);
                setIsDirty(true);
              }}
            />
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

interface SpaceNameSectionProps {
  spaceName: string;
  onChange: (value: string) => void;
}

function SpaceNameSection({ spaceName, onChange }: SpaceNameSectionProps) {
  return (
    <div className="flex w-full flex-col gap-y-4">
      <Page.SectionHeader title="Name" />
      <Input
        placeholder="Space's name"
        value={spaceName}
        name="spaceName"
        message="Space name must be unique"
        messageStatus="info"
        onChange={(e) => {
          onChange(e.target.value);
        }}
      />
    </div>
  );
}

interface SpaceDeleteSectionProps {
  isAdmin: boolean;
  space?: SpaceType;
  spaceInfoByCategory: { [key: string]: SpaceCategoryInfo } | undefined;
  onDelete: () => void;
  isDeleting: boolean;
}

function SpaceDeleteSection({
  isAdmin,
  space,
  spaceInfoByCategory,
  onDelete,
  isDeleting,
}: SpaceDeleteSectionProps) {
  if (!isAdmin || !space || space.kind !== "regular") {
    return null;
  }

  return (
    <>
      <ConfirmDeleteSpaceDialog
        spaceInfoByCategory={spaceInfoByCategory}
        space={space}
        handleDelete={onDelete}
        isDeleting={isDeleting}
      />
      <Separator />
    </>
  );
}

interface RestrictedAccessHeaderProps {
  isRestricted: boolean;
  onToggle: () => void;
}

function RestrictedAccessHeader({
  isRestricted,
  onToggle,
}: RestrictedAccessHeaderProps) {
  return (
    <>
      <div className="flex w-full items-center justify-between overflow-visible">
        <Page.SectionHeader title="Restricted Access" />
        <SliderToggle selected={isRestricted} onClick={onToggle} />
      </div>
      {isRestricted ? (
        <span>Restricted access is active.</span>
      ) : (
        <span>
          Restricted access is disabled. The space is accessible to everyone in
          the workspace.
        </span>
      )}
    </>
  );
}

interface RestrictedAccessBodyProps {
  isRestricted: boolean;
  isManual: boolean;
  areConversationsEnabled: boolean;
  planAllowsSCIM: boolean;
  managementType: MembersManagementType;
  owner: LightWorkspaceType;
  selectedMembers: UserType[];
  selectedGroups: GroupType[];
  searchSelectedMembers: string;
  onSearchChange: (value: string) => void;
  onManagementTypeChange: (value: string) => void;
  onMembersUpdated: (members: UserType[]) => void;
  onGroupsUpdated: (groups: GroupType[]) => void;
}

function RestrictedAccessBody({
  isRestricted,
  isManual,
  areConversationsEnabled,
  planAllowsSCIM,
  managementType,
  owner,
  selectedMembers,
  selectedGroups,
  searchSelectedMembers,
  onSearchChange,
  onManagementTypeChange,
  onMembersUpdated,
  onGroupsUpdated,
}: RestrictedAccessBodyProps) {
  const { hasFeature } = useFeatureFlags({
    workspaceId: owner.sId,
  });
  if (
    isRestricted ||
    (hasFeature("conversations_groups") && areConversationsEnabled)
  ) {
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
                    if (isMembersManagementType("manual")) {
                      onManagementTypeChange("manual");
                    }
                  }}
                />
                <DropdownMenuItem
                  label="Provisioned group access"
                  onClick={() => {
                    if (isMembersManagementType("group")) {
                      onManagementTypeChange("group");
                    }
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
              onChange={onSearchChange}
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
              onChange={onSearchChange}
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

  return null;
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
