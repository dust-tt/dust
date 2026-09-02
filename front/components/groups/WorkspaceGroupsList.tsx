import { ConfirmContext } from "@app/components/Confirm";
import { GroupDialog } from "@app/components/groups/GroupDialog";
import { getGroupKindChip } from "@app/components/groups/GroupKinds";
import { ProvisionedGroupDialog } from "@app/components/groups/ProvisionedGroupDialog";
import { GroupModelTierPickerDropdown } from "@app/components/workspace/GroupModelTierPickerDropdown";
import { LinkedSectionNotice } from "@app/components/workspace/LinkedSectionNotice";
import { ModelTiersInfoButton } from "@app/components/workspace/ModelTiersInfoModal";
import { useAuth } from "@app/lib/auth/AuthContext";
import { isSCIMEnabled } from "@app/lib/plans/scim";
import { useAppRouter } from "@app/lib/platform";
import { useDeleteGroup, useGroups } from "@app/lib/swr/groups";
import { useWorkspacePermissions } from "@app/lib/swr/permissions";
import type { GroupKind } from "@app/types/groups";
import {
  isRegularManualGroupKind,
  MANAGEABLE_GROUP_KINDS,
} from "@app/types/groups";
import { pluralize } from "@app/types/shared/utils/string_utils";
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
  kind: GroupKind;
  onClick?: () => void;
  onDelete?: () => void;
};

interface WorkspaceGroupsListProps {
  owner: WorkspaceType;
  showModelTiers: boolean;
}

const baseColumns: ColumnDef<GroupRowData>[] = [
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
    id: "kind",
    header: "",
    meta: { className: "w-[160px]" },
    cell: ({ row }) => {
      const { label, color } = getGroupKindChip(row.original.kind);
      return (
        <DataTable.CellContent>
          <Chip size="xs" color={color} label={label} />
        </DataTable.CellContent>
      );
    },
  },
];

function buildModelTiersColumn(owner: WorkspaceType): ColumnDef<GroupRowData> {
  return {
    id: "modelTiers",
    header: () => (
      <span className="flex items-center gap-1">
        Models tier
        <ModelTiersInfoButton />
      </span>
    ),
    meta: { className: "w-64" },
    cell: ({ row }) => (
      <div
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <GroupModelTierPickerDropdown
          owner={owner}
          groupId={row.original.groupId}
        />
      </div>
    ),
  };
}

const actionsColumn: ColumnDef<GroupRowData> = {
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
};

export function WorkspaceGroupsList({
  owner,
  showModelTiers,
}: WorkspaceGroupsListProps) {
  const { groups, isGroupsLoading } = useGroups({
    owner,
    kinds: MANAGEABLE_GROUP_KINDS,
  });

  const router = useAppRouter();
  const { subscription } = useAuth();
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
        kind: group.kind,
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
        onDelete: isManual
          ? () => handleDeleteGroup(group.sId, group.name)
          : undefined,
      };
    });
  }, [groups, handleDeleteGroup]);

  const columns = useMemo(
    () => [
      ...baseColumns,
      ...(showModelTiers ? [buildModelTiersColumn(owner)] : []),
      actionsColumn,
    ],
    [owner, showModelTiers]
  );

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
              <Button
                icon={Plus}
                label="Create group"
                onClick={openCreateDialog}
              />
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
              <Button
                icon={Plus}
                label="Create group"
                onClick={openCreateDialog}
              />
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
