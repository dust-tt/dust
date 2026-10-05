import { ConfirmContext } from "@app/components/Confirm";
import { GroupDialog } from "@app/components/groups/GroupDialog";
import { getGroupKindChip } from "@app/components/groups/GroupKinds";
import { ProvisionedGroupDialog } from "@app/components/groups/ProvisionedGroupDialog";
import {
  displayRoleCapitalized,
  ROLES_DATA,
} from "@app/components/members/Roles";
import { LinkedSectionNotice } from "@app/components/workspace/LinkedSectionNotice";
import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import { isSCIMEnabled } from "@app/lib/plans/scim";
import { useAppRouter } from "@app/lib/platform";
import { useDeleteGroup, useGroups } from "@app/lib/swr/groups";
import { useWorkspacePermissions } from "@app/lib/swr/permissions";
import type { GroupGrantableRole, GroupKind } from "@app/types/groups";
import {
  isRegularManualGroupKind,
  MANAGEABLE_GROUP_KINDS,
} from "@app/types/groups";
import { pluralize } from "@app/types/shared/utils/string_utils";
import type { WorkspaceType } from "@app/types/user";
import {
  Avatar,
  Button,
  Chip,
  DataTable,
  DotsHorizontal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  EmptyCTA,
  Plus,
  SearchInput,
  Spinner,
  Trash01,
  Users01,
} from "@dust-tt/sparkle";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { useCallback, useContext, useMemo, useState } from "react";

const DEFAULT_PAGE_SIZE = 25;

type GroupRowData = {
  groupId: string;
  name: string;
  memberCount: number;
  managers: { fullName: string; image: string | null }[];
  kind: GroupKind;
  grantedRole: GroupGrantableRole | null;
  onClick?: () => void;
  onDelete?: () => void;
};

interface WorkspaceGroupsListProps {
  owner: WorkspaceType;
}

/**
 * @cc [owner:philipperolet,label:product] group-manager-avatars
 * Manager avatar circles MUST remain fully visible, including when the stack expands on hover.
 */
const columns: ColumnDef<GroupRowData>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: "Name",
    meta: { className: "w-full" },
    cell: ({ row }) => {
      const { name, memberCount } = row.original;
      return (
        <DataTable.CellContent
          icon={Users01}
          description={`${memberCount} member${pluralize(memberCount)}`}
        >
          {name}
        </DataTable.CellContent>
      );
    },
  },
  {
    id: "managers",
    header: "Group Manager",
    meta: { className: "w-[240px]" },
    cell: ({ row }) => {
      const { managers } = row.original;
      if (managers.length === 0) {
        return <DataTable.CellContent>-</DataTable.CellContent>;
      }
      return (
        <div className="flex items-center gap-2 text-sm">
          <Avatar.Stack
            avatars={managers.map(({ fullName, image }) => ({
              name: fullName,
              visual: image ?? undefined,
              isRounded: true,
            }))}
            nbVisibleItems={4}
            size="xs"
            hasMagnifier={false}
          />
          {managers.length === 1 && (
            <span className="truncate">{managers[0].fullName}</span>
          )}
        </div>
      );
    },
  },
  {
    id: "kind",
    header: "",
    meta: { className: "w-[240px]" },
    cell: ({ row }) => {
      const { kind, grantedRole } = row.original;
      const { label, color } = getGroupKindChip(kind);
      return (
        <DataTable.CellContent>
          <div className="flex flex-row items-center gap-1">
            <Chip size="xs" color={color} label={label} />
            {grantedRole && (
              <Chip
                size="xs"
                color={ROLES_DATA[grantedRole].color}
                label={displayRoleCapitalized(grantedRole)}
              />
            )}
          </div>
        </DataTable.CellContent>
      );
    },
  },
  {
    id: "actions",
    header: "",
    meta: { className: "w-12" },
    cell: ({ row }) => {
      const { onDelete } = row.original;
      if (!onDelete) {
        return null;
      }
      return (
        <DataTable.CellContent>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                icon={DotsHorizontal}
                size="mini"
                variant="ghost-secondary"
                onClick={(e) => e.stopPropagation()}
              />
            </DropdownMenuTrigger>
            <DropdownMenuPortal>
              <DropdownMenuContent
                align="end"
                onClick={(e) => e.stopPropagation()}
              >
                <DropdownMenuItem
                  label="Delete"
                  icon={Trash01}
                  variant="warning"
                  onClick={onDelete}
                />
              </DropdownMenuContent>
            </DropdownMenuPortal>
          </DropdownMenu>
        </DataTable.CellContent>
      );
    },
  },
];
const columnsWithoutManagers = columns.filter(
  (column) => column.id !== "managers"
);

export function WorkspaceGroupsList({ owner }: WorkspaceGroupsListProps) {
  const { hasFeature } = useFeatureFlags();
  const { subscription, isManager } = useAuth();
  const isGroupManagementEnabled = hasFeature("group_management");
  const { groups, isGroupsLoading } = useGroups({
    owner,
    kinds: MANAGEABLE_GROUP_KINDS,
    withManagers: isGroupManagementEnabled,
    managedOnly: !isManager,
  });

  const router = useAppRouter();
  const isScimAllowed = isSCIMEnabled(subscription.plan);
  const [searchTerm, setSearchTerm] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editedGroupId, setEditedGroupId] = useState<string | null>(null);
  const [isProvisionedDialogOpen, setIsProvisionedDialogOpen] = useState(false);
  const [viewedProvisionedGroup, setViewedProvisionedGroup] = useState<{
    groupId: string;
    name: string;
  } | null>(null);

  const confirm = useContext(ConfirmContext);
  const { doDeleteGroup } = useDeleteGroup({ owner });
  const { hasPermission } = useWorkspacePermissions();

  const openCreateDialog = () => {
    setEditedGroupId(null);
    setIsDialogOpen(true);
  };

  const handleDeleteGroup = useCallback(
    async (groupId: string, groupName: string) => {
      const confirmed = await confirm({
        title: "Delete group",
        message: `Are you sure you want to delete ${groupName}? This action cannot be undone.`,
        validateLabel: "Delete",
        validateVariant: "warning",
      });
      if (confirmed) {
        await doDeleteGroup({ groupId, groupName });
      }
    },
    [confirm, doDeleteGroup]
  );

  const rows = useMemo<GroupRowData[]>(() => {
    return groups.map((group) => {
      // Only manually-managed groups can be edited or deleted.
      const isManual = isRegularManualGroupKind(group.kind);
      return {
        groupId: group.sId,
        name: group.name,
        memberCount: group.memberCount,
        managers: group.managers ?? [],
        kind: group.kind,
        grantedRole: group.grantedRole,
        onClick: isManual
          ? () => {
              setEditedGroupId(group.sId);
              setIsDialogOpen(true);
            }
          : // Provisioned groups open a read-only member list.
            () => {
              setViewedProvisionedGroup({
                groupId: group.sId,
                name: group.name,
              });
              setIsProvisionedDialogOpen(true);
            },
        onDelete:
          isManual && group.allowedActions?.canEditDetails
            ? () => handleDeleteGroup(group.sId, group.name)
            : undefined,
      };
    });
  }, [groups, handleDeleteGroup]);

  return (
    <div className="flex flex-col gap-4">
      {isScimAllowed && hasPermission("admin", "security") && (
        <LinkedSectionNotice
          description="User provisioning is configured in"
          linkLabel="IT & Security → User provisioning"
          onLinkClick={() =>
            void router.push(`/w/${owner.sId}/identity-and-provisioning`)
          }
        />
      )}
      {isGroupsLoading && (
        <div className="flex items-center justify-center py-8">
          <Spinner size="lg" />
        </div>
      )}
      {!isGroupsLoading &&
        (rows.length > 0 ? (
          <>
            <div className="flex flex-row gap-2">
              <SearchInput
                placeholder="Search groups"
                value={searchTerm}
                name="search"
                onChange={setSearchTerm}
                className="w-full"
              />
              {isManager && (
                <Button
                  icon={Plus}
                  label="Create group"
                  onClick={openCreateDialog}
                />
              )}
            </div>
            <DataTable
              data={rows}
              columns={
                isGroupManagementEnabled ? columns : columnsWithoutManagers
              }
              filter={searchTerm}
              filterColumn="name"
              pagination={pagination}
              setPagination={setPagination}
            />
          </>
        ) : (
          <EmptyCTA
            action={
              isManager ? (
                <Button
                  icon={Plus}
                  label="Create group"
                  onClick={openCreateDialog}
                />
              ) : undefined
            }
            message="You don’t have any groups yet."
          />
        ))}
      <GroupDialog
        owner={owner}
        isOpen={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        groupId={editedGroupId}
      />
      <ProvisionedGroupDialog
        owner={owner}
        isOpen={isProvisionedDialogOpen}
        onOpenChange={setIsProvisionedDialogOpen}
        groupId={viewedProvisionedGroup?.groupId ?? null}
        groupName={viewedProvisionedGroup?.name ?? ""}
      />
    </div>
  );
}
