import type {
  EditGroupUsageGroup,
  EditGroupUsageSeatOptions,
} from "@app/components/workspace/EditGroupUsageDialog";
import { EditGroupUsageDialog } from "@app/components/workspace/EditGroupUsageDialog";
import { GroupModelTierPickerDropdown } from "@app/components/workspace/GroupModelTierPickerDropdown";
import { ModelTiersInfoButton } from "@app/components/workspace/ModelTiersInfoModal";
import { SharedUsageLimitCell } from "@app/components/workspace/SharedUsageLimitCell";
import { useGroupsUsage } from "@app/hooks/useGroupsUsage";
import { formatCredits } from "@app/lib/client/credits";
import { useGroups } from "@app/lib/swr/groups";
import { CAP_ELIGIBLE_GROUP_KINDS } from "@app/types/groups";
import type { LightWorkspaceType } from "@app/types/user";
import type { DataTableSkeletonCellProps } from "@dust-tt/sparkle";
import {
  DataTable,
  DataTableSkeleton,
  LoadingBlock,
  Users01,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";

interface GroupsUsageTableProps {
  owner: LightWorkspaceType;
  visibleGroupIds?: ReadonlySet<string>;
  editableGroupIds?: ReadonlySet<string>;
  showSpendLimitColumn?: boolean;
  showModelTiersColumn?: boolean;
  showSharedUsageLimitColumn?: boolean;
  canEditSharedUsageLimit?: boolean;
  seatOptions?: EditGroupUsageSeatOptions;
}

type GroupRowData = EditGroupUsageGroup & {
  onClick?: () => void;
};

type GroupInfo = CellContext<GroupRowData, string>;

function GroupUsageSkeletonCell({ columnId }: DataTableSkeletonCellProps) {
  switch (columnId) {
    case "name":
      return (
        <div className="flex items-center gap-2">
          <LoadingBlock className="h-5 w-5 shrink-0" />
          <LoadingBlock className="h-3 w-28 max-w-full" />
        </div>
      );
    case "memberCount":
      return <LoadingBlock className="h-3 w-8" />;
    case "cap":
      return <LoadingBlock className="h-3 w-24" />;
    case "sharedUsageLimit":
      return <LoadingBlock className="h-3 w-40" />;
    case "modelTiers":
      return <LoadingBlock className="h-8 w-48 rounded-xl" />;
    default:
      return null;
  }
}

export function GroupsUsageTable({
  owner,
  visibleGroupIds,
  editableGroupIds,
  showSpendLimitColumn = true,
  showModelTiersColumn = false,
  showSharedUsageLimitColumn = false,
  canEditSharedUsageLimit = false,
  seatOptions,
}: GroupsUsageTableProps) {
  const { t } = useLingui();
  const { groups, isGroupsLoading } = useGroups({
    owner,
    kinds: [...CAP_ELIGIBLE_GROUP_KINDS],
  });
  const { usageByGroupId, isGroupsUsageLoading, isGroupsUsageError } =
    useGroupsUsage({
      owner,
      disabled: !showSharedUsageLimitColumn,
    });
  const [editedGroupId, setEditedGroupId] = useState<string | null>(null);
  const isSharedUsageLimitShown =
    showSharedUsageLimitColumn && !isGroupsUsageError;
  const sharedUsageLimitAccess = !isSharedUsageLimitShown
    ? "hidden"
    : canEditSharedUsageLimit
      ? "editable"
      : "readOnly";
  const isGroupDialogEnabled =
    showSpendLimitColumn && !(isSharedUsageLimitShown && isGroupsUsageLoading);

  const rows: GroupRowData[] = useMemo(
    () =>
      groups
        .filter((group) => !visibleGroupIds || visibleGroupIds.has(group.sId))
        .map((group) => ({
          groupId: group.sId,
          name: group.name,
          memberCount: group.memberCount,
          poolCapAwuCredits: group.poolCapAwuCredits,
          grantedSeatType: group.grantedSeatType,
          sharedUsageLimitUsage: usageByGroupId.get(group.sId),
          onClick:
            isGroupDialogEnabled &&
            (!editableGroupIds || editableGroupIds.has(group.sId))
              ? () => setEditedGroupId(group.sId)
              : undefined,
        })),
    [
      groups,
      visibleGroupIds,
      editableGroupIds,
      usageByGroupId,
      isGroupDialogEnabled,
    ]
  );
  const editedGroup = rows.find((row) => row.groupId === editedGroupId) ?? null;

  const columns: ColumnDef<GroupRowData, string>[] = useMemo(
    () => [
      {
        id: "name",
        accessorFn: (row) => row.name,
        header: t`Group`,
        cell: (info: GroupInfo) => (
          <DataTable.CellContent icon={Users01} className="capitalize">
            {info.row.original.name}
          </DataTable.CellContent>
        ),
        enableSorting: true,
      },
      {
        id: "memberCount",
        accessorFn: (row) => String(row.memberCount),
        header: t`Members`,
        meta: { className: "w-[120px]" },
        cell: (info: GroupInfo) => (
          <DataTable.BasicCellContent
            label={`${info.row.original.memberCount}`}
          />
        ),
        enableSorting: false,
      },
      ...(showSpendLimitColumn
        ? [
            {
              id: "cap",
              header: t`Limit per member`,
              meta: { className: "hidden @3xl:table-cell @3xl:w-48" },
              cell: (info: GroupInfo) => {
                const { poolCapAwuCredits } = info.row.original;
                return (
                  <DataTable.BasicCellContent
                    label={
                      poolCapAwuCredits === null
                        ? t`No limit`
                        : formatCredits(poolCapAwuCredits)
                    }
                  />
                );
              },
              enableSorting: false,
            } satisfies ColumnDef<GroupRowData, string>,
          ]
        : []),
      ...(isSharedUsageLimitShown
        ? [
            {
              id: "sharedUsageLimit",
              header: t`Group budget`,
              meta: { className: "hidden @3xl:table-cell @3xl:w-48" },
              cell: (info: GroupInfo) =>
                isGroupsUsageLoading ? (
                  <LoadingBlock className="h-3 w-40" />
                ) : (
                  <SharedUsageLimitCell
                    usage={info.row.original.sharedUsageLimitUsage}
                  />
                ),
              enableSorting: false,
            } satisfies ColumnDef<GroupRowData, string>,
          ]
        : []),
      ...(showModelTiersColumn
        ? [
            {
              id: "modelTiers",
              header: () => (
                <span className="flex items-center gap-1">
                  <Trans>Models tier</Trans>
                  <ModelTiersInfoButton />
                </span>
              ),
              meta: { className: "hidden @2xl:table-cell @2xl:w-64" },
              cell: (info: GroupInfo) => (
                <div
                  className="-ml-3"
                  onClick={(event) => event.stopPropagation()}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <GroupModelTierPickerDropdown
                    owner={owner}
                    groupId={info.row.original.groupId}
                    variant="ghost"
                  />
                </div>
              ),
              enableSorting: false,
            } satisfies ColumnDef<GroupRowData, string>,
          ]
        : []),
    ],
    [
      owner,
      showSpendLimitColumn,
      isSharedUsageLimitShown,
      isGroupsUsageLoading,
      showModelTiersColumn,
      t,
    ]
  );

  return (
    <div className="flex flex-col gap-3">
      {showSpendLimitColumn && (
        <span className="copy-sm text-muted-foreground">
          <Trans>
            A group's monthly spend limit applies to each of its members. When a
            member belongs to several groups, the highest limit is used.
          </Trans>
          {isSharedUsageLimitShown && (
            <>
              {" "}
              <Trans>
                A group budget caps what all the group's members spend together.
              </Trans>
            </>
          )}
        </span>
      )}
      {isGroupsLoading ? (
        <DataTableSkeleton
          columns={columns}
          SkeletonCell={GroupUsageSkeletonCell}
          rowHeight={49}
        />
      ) : (
        <DataTable filterColumn="name" data={rows} columns={columns} />
      )}
      <EditGroupUsageDialog
        isOpen={editedGroup !== null}
        onClose={() => setEditedGroupId(null)}
        owner={owner}
        group={editedGroup}
        seatOptions={seatOptions}
        sharedUsageLimitAccess={sharedUsageLimitAccess}
      />
    </div>
  );
}
