import { ConfirmContext } from "@app/components/Confirm";
import { GroupDialog } from "@app/components/groups/GroupDialog";
import { getGroupKindChip } from "@app/components/groups/GroupKinds";
import { ProvisionedGroupDialog } from "@app/components/groups/ProvisionedGroupDialog";
import { ROLE_LABELS, ROLES_DATA } from "@app/components/members/Roles";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useDeleteGroup, useGroups } from "@app/lib/swr/groups";
import type { GroupGrantableRole, GroupKind } from "@app/types/groups";
import {
  isRegularManualGroupKind,
  MANAGEABLE_GROUP_KINDS,
} from "@app/types/groups";
import type { WorkspaceType } from "@app/types/user";
import {
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
  Page,
  Plus,
  SearchInput,
  Spinner,
  Trash01,
  Users01,
} from "@dust-tt/sparkle";
import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { useCallback, useContext, useMemo, useState } from "react";

const DEFAULT_PAGE_SIZE = 25;
const MAX_VISIBLE_MANAGERS = 3;

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

export function WorkspaceGroupsList({ owner }: WorkspaceGroupsListProps) {
  const { t } = useLingui();
  const { isManager } = useAuth();
  const { groups, isGroupsLoading } = useGroups({
    owner,
    kinds: MANAGEABLE_GROUP_KINDS,
    withManagers: true,
    managedOnly: !isManager,
  });

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

  const columns: ColumnDef<GroupRowData>[] = useMemo(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: t`Name`,
        meta: { className: "w-full" },
        cell: ({ row }) => {
          const { name, memberCount } = row.original;
          return (
            <DataTable.CellContent
              icon={Users01}
              description={t`${plural(memberCount, {
                one: "# member",
                other: "# members",
              })}`}
            >
              {name}
            </DataTable.CellContent>
          );
        },
      },
      {
        id: "managers",
        header: t`Group Manager`,
        meta: { className: "w-[240px]" },
        cell: ({ row }) => {
          const { managers } = row.original;
          if (managers.length === 0) {
            return <DataTable.CellContent>-</DataTable.CellContent>;
          }
          return (
            <DataTable.CellContent
              className="gap-2"
              avatarStack={{
                items: managers.map(({ fullName, image }) => ({
                  name: fullName,
                  visual: image ?? undefined,
                  isRounded: true,
                })),
                maxVisibleAvatars: MAX_VISIBLE_MANAGERS,
                hasMagnifier: false,
              }}
            >
              {managers.length === 1 && managers[0].fullName}
            </DataTable.CellContent>
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
                <Chip size="xs" color={color} label={t(label)} />
                {grantedRole && (
                  <Chip
                    size="xs"
                    color={ROLES_DATA[grantedRole].color}
                    label={t(ROLE_LABELS[grantedRole])}
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
                      label={t`Delete`}
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
    ],
    [t]
  );

  const openCreateDialog = () => {
    setEditedGroupId(null);
    setIsDialogOpen(true);
  };

  const handleDeleteGroup = useCallback(
    async (groupId: string, groupName: string) => {
      const confirmed = await confirm({
        title: t`Delete group`,
        message: t`Are you sure you want to delete ${groupName}? This action cannot be undone.`,
        validateLabel: t`Delete`,
        validateVariant: "warning",
      });
      if (confirmed) {
        await doDeleteGroup({ groupId, groupName });
      }
    },
    [confirm, doDeleteGroup, t]
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
    <Page.Vertical gap="sm" align="stretch">
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
                placeholder={t`Search groups`}
                value={searchTerm}
                name="search"
                onChange={setSearchTerm}
                className="w-full"
              />
              {isManager && (
                <Button
                  icon={Plus}
                  label={t`Create group`}
                  onClick={openCreateDialog}
                />
              )}
            </div>
            <DataTable
              data={rows}
              columns={columns}
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
                  label={t`Create group`}
                  onClick={openCreateDialog}
                />
              ) : undefined
            }
            message={t`You don’t have any groups yet.`}
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
    </Page.Vertical>
  );
}
