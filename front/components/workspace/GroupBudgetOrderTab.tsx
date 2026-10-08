import { SharedUsageLimitCell } from "@app/components/workspace/SharedUsageLimitCell";
import { useFormatErrorDescription } from "@app/hooks/useFormatErrorDescription";
import {
  ArrowDown,
  ArrowUp,
  Button,
  Chip,
  DataTable,
  Plus,
  Spinner,
} from "@dust-tt/sparkle";
import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";

export interface GroupBudgetOrderRow {
  groupId: string;
  name: string;
  position: number;
  limitAwuCredits: number | null;
  usedAwuCredits: number;
  sharedMemberCount: number | null;
  isCurrentGroup: boolean;
}

type GroupBudgetOrderRowData = GroupBudgetOrderRow & {
  isFirst: boolean;
  isLast: boolean;
  onClick?: () => void;
};

type GroupBudgetOrderInfo = CellContext<GroupBudgetOrderRowData, string>;

interface GroupBudgetOrderTabProps {
  groupName: string;
  rows: GroupBudgetOrderRow[];
  isLoading: boolean;
  error: unknown;
  disabled: boolean;
  onMove: (
    groupId: string,
    direction: "up" | "down",
    visibleGroupIds: string[]
  ) => void;
}

export function GroupBudgetOrderTab({
  groupName,
  rows,
  isLoading,
  error,
  disabled,
  onMove,
}: GroupBudgetOrderTabProps) {
  const { t } = useLingui();
  const formatErrorDescription = useFormatErrorDescription();
  const [isFiltered, setIsFiltered] = useState(true);

  const visibleRows = useMemo(
    () =>
      isFiltered
        ? rows.filter(
            (row) => row.isCurrentGroup || (row.sharedMemberCount ?? 0) > 0
          )
        : rows,
    [rows, isFiltered]
  );
  const visibleGroupIds = visibleRows.map((row) => row.groupId);
  const data: GroupBudgetOrderRowData[] = visibleRows.map((row, index) => ({
    ...row,
    isFirst: index === 0,
    isLast: index === visibleRows.length - 1,
  }));

  const columns: ColumnDef<GroupBudgetOrderRowData, string>[] = [
    {
      id: "position",
      header: "",
      meta: { className: "w-10" },
      cell: (info: GroupBudgetOrderInfo) => (
        <DataTable.BasicCellContent
          label={`${info.row.original.position}`}
          className="justify-end tabular-nums"
        />
      ),
    },
    {
      id: "name",
      header: t`Group`,
      cell: (info: GroupBudgetOrderInfo) => (
        <DataTable.CellContent>
          <span className="flex items-center gap-2">
            {info.row.original.name}
            {info.row.original.isCurrentGroup && (
              <Chip size="xs" color="highlight" label={t`This group`} />
            )}
          </span>
        </DataTable.CellContent>
      ),
    },
    {
      id: "budget",
      header: t`Group budget`,
      cell: (info: GroupBudgetOrderInfo) => {
        const { groupId, limitAwuCredits, usedAwuCredits } = info.row.original;
        return (
          <SharedUsageLimitCell
            usage={
              limitAwuCredits === null
                ? undefined
                : { groupId, limitAwuCredits, usedAwuCredits }
            }
          />
        );
      },
    },
    {
      id: "sharedMembers",
      header: t`Shared members`,
      cell: (info: GroupBudgetOrderInfo) => (
        <DataTable.BasicCellContent
          label={
            info.row.original.sharedMemberCount === null
              ? "-"
              : `${info.row.original.sharedMemberCount}`
          }
        />
      ),
    },
    {
      id: "move",
      header: "",
      meta: { className: "w-24" },
      cell: (info: GroupBudgetOrderInfo) => {
        const { groupId, isFirst, isLast } = info.row.original;
        return (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost-secondary"
              size="icon"
              icon={ArrowUp}
              tooltip={t`Move up`}
              disabled={disabled || isFirst}
              onClick={() => onMove(groupId, "up", visibleGroupIds)}
            />
            <Button
              variant="ghost-secondary"
              size="icon"
              icon={ArrowDown}
              tooltip={t`Move down`}
              disabled={disabled || isLast}
              onClick={() => onMove(groupId, "down", visibleGroupIds)}
            />
          </div>
        );
      },
    },
  ];

  if (isLoading) {
    return <Spinner size="sm" />;
  }
  if (error) {
    return (
      <div className="flex flex-col gap-1 text-sm">
        <span className="text-foreground dark:text-foreground-night">
          {t`The order of group budgets could not be loaded.`}
        </span>
        <span className="text-muted-foreground dark:text-muted-foreground-night">
          {formatErrorDescription(error)}
        </span>
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
        {t`No group has a budget yet.`}
      </span>
    );
  }

  const visibleCount = visibleRows.length;
  const totalCount = rows.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        {isFiltered ? (
          <Chip color="highlight" onRemove={() => setIsFiltered(false)}>
            <Trans>
              Shares members with <strong>{groupName}</strong>
            </Trans>
          </Chip>
        ) : (
          <Chip
            color="primary"
            icon={Plus}
            className="border border-dashed border-border"
            onClick={() => setIsFiltered(true)}
          >
            <Trans>
              Shares members with <strong>{groupName}</strong>
            </Trans>
          </Chip>
        )}
        <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          {t`${visibleCount} of ${plural(totalCount, {
            one: "# group",
            other: "# groups",
          })}`}
        </span>
      </div>
      <DataTable data={data} columns={columns} />
    </div>
  );
}
