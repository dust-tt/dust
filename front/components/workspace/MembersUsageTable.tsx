import {
  SEAT_TYPE_ICONS,
  seatTypeDisplayName,
} from "@app/components/workspace/billing/seatTypeUtils";
import { buildMemberNameColumn } from "@app/components/workspace/member_name_column";
import {
  getSeatBarClasses,
  getSeatIconColorClass,
  MUTED_BAR_CLASSES,
  OVERAGE_BAR_CLASSES,
} from "@app/components/workspace/seat_styles";
import type { MemberUsageType } from "@app/lib/api/credits/members_usage";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { formatCredits } from "@app/lib/client/credits";
import { useDefaultUserSpendLimit } from "@app/lib/swr/usage_settings";
import {
  type MembershipSeatType,
  SEAT_TYPE_ORDER,
  toBaseSeatType,
} from "@app/types/memberships";
import {
  Clock,
  DataTable,
  Icon,
  LoadingBlock,
  type MenuItem,
  Spinner,
  Tooltip,
} from "@dust-tt/sparkle";
import type {
  CellContext,
  ColumnDef,
  PaginationState,
  SortingState,
} from "@tanstack/react-table";
import { useMemo } from "react";

type RowData = {
  sId: string;
  name: string;
  email: string | null;
  image: string | null;
  seatType: MembershipSeatType | null;
  memberUsageLimit: number | null;
  consumedAwuCredits: number;
  consumedFromAllowanceAwuCredits: number;
  consumedFromPoolAwuCredits: number;
  spendLimitAwuCredits: number | null;
  scheduledSeatType: MembershipSeatType | null;
  scheduledSeatChangeAt: string | null;
  isTotalAllowedUsagePending: boolean;
  isSeatChangePending: boolean;
  menuItems: MenuItem[];
};

type Info = CellContext<RowData, string>;

// Builds the tooltip explaining a scheduled seat change, e.g.
// "This user will be downgraded to Free at the end of the billing period (July 1)".
function getScheduledSeatChangeLabel(
  currentSeatType: MembershipSeatType | null,
  scheduledSeatType: MembershipSeatType,
  scheduledSeatChangeAt: string | null
): string {
  const currentRank = currentSeatType ? SEAT_TYPE_ORDER[currentSeatType] : 0;
  const scheduledRank = SEAT_TYPE_ORDER[scheduledSeatType];
  const verb =
    scheduledRank > currentRank
      ? "upgraded"
      : scheduledRank < currentRank
        ? "downgraded"
        : "changed";
  const targetLabel = seatTypeDisplayName(scheduledSeatType);
  const dateSuffix = scheduledSeatChangeAt
    ? ` (${new Date(scheduledSeatChangeAt).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      })})`
    : "";
  return `This user will be ${verb} to ${targetLabel} at the end of the billing period${dateSuffix}`;
}

interface SeatTypeIconProps {
  seatType: MembershipSeatType | null;
}

function SeatTypeIcon({ seatType }: SeatTypeIconProps) {
  if (!seatType) {
    return null;
  }
  const displaySeatType = toBaseSeatType(seatType);
  const visual = SEAT_TYPE_ICONS[displaySeatType];
  if (!visual) {
    return null;
  }
  return (
    <Icon
      visual={visual}
      size="sm"
      className={getSeatIconColorClass(displaySeatType)}
    />
  );
}

interface AwuUsageBarProps {
  consumed: number;
  // Of `consumed`, the part drawn from the seat allowance vs. the workspace
  // pool (+ overage). Provided by the API so the bar doesn't re-derive the
  // split. `consumedFromAllowance + consumedFromPool === consumed`.
  consumedFromAllowance: number;
  consumedFromPool: number;
  memberUsageLimit: number | null;
  limit: number | null;
  seatType: MembershipSeatType | null;
  isTotalAllowedUsagePending: boolean;
}

function AwuUsageBar({
  consumed,
  consumedFromAllowance,
  consumedFromPool,
  memberUsageLimit,
  limit,
  seatType,
  isTotalAllowedUsagePending: isPending,
}: AwuUsageBarProps) {
  const { sId: workspaceId } = useWorkspace();
  const { defaultUserSpendLimit } = useDefaultUserSpendLimit({ workspaceId });

  const seatColors = getSeatBarClasses(seatType);
  const allowance = memberUsageLimit ?? 0;

  // When no Metronome cap alert exists for this user (`limit` is null), fall
  // back to displaying the workspace default: seat allowance + default pool.
  const effectiveLimit =
    limit ??
    (defaultUserSpendLimit?.awuCredits != null
      ? allowance + defaultUserSpendLimit.awuCredits
      : null);

  // The bar splits consumption into seat → pool → overage:
  //   seat consumed · seat remaining · pool consumed · pool remaining · overage
  // `poolLimit` is the headroom on top of the seat allowance (null = uncapped).
  // A seat with no pool (poolLimit === 0, e.g. free) shows no pool section —
  // any spend beyond the seat allowance is overage. Zero-width sections are
  // skipped. `pool remaining` is omitted when uncapped (no finite headroom).
  const seatConsumed = consumedFromAllowance;
  const seatRemaining = Math.max(0, allowance - seatConsumed);
  const poolLimit =
    effectiveLimit !== null ? Math.max(0, effectiveLimit - allowance) : null;
  // Of the pool consumption, the part within the pool limit vs. the overage
  // beyond it (only capped seats can have overage).
  const poolConsumed =
    poolLimit !== null
      ? Math.min(consumedFromPool, poolLimit)
      : consumedFromPool;
  const poolRemaining =
    poolLimit !== null ? Math.max(0, poolLimit - poolConsumed) : null;
  const overage =
    poolLimit !== null ? Math.max(0, consumedFromPool - poolLimit) : 0;

  const sections: Array<{
    key: string;
    value: number;
    className: string;
    label: string;
  }> = [];
  if (seatConsumed > 0) {
    sections.push({
      key: "seat-consumed",
      value: seatConsumed,
      className: seatColors.fill,
      label: `${formatCredits(seatConsumed)} of ${formatCredits(allowance)} seat allowance used`,
    });
  }
  if (seatRemaining > 0) {
    sections.push({
      key: "seat-remaining",
      value: seatRemaining,
      className: seatColors.track,
      label: `${formatCredits(seatRemaining)} of ${formatCredits(allowance)} seat allowance remaining`,
    });
  }
  if (poolConsumed > 0) {
    sections.push({
      key: "pool-consumed",
      value: poolConsumed,
      className: MUTED_BAR_CLASSES.fill,
      label: `${formatCredits(poolConsumed)} credits used from the workspace pool`,
    });
  }
  if (poolRemaining !== null && poolRemaining > 0) {
    sections.push({
      key: "pool-remaining",
      value: poolRemaining,
      className: MUTED_BAR_CLASSES.track,
      label: `${formatCredits(poolRemaining)} credits remaining before spend limit`,
    });
  }
  // Overage is surfaced in the tooltip only, not as a bar segment.

  const total = sections.reduce((sum, s) => sum + s.value, 0);

  const hasSeatSections = seatConsumed > 0 || seatRemaining > 0;
  // Only surface the pool when there's actually a pool to spend from: a finite
  // positive limit, or uncapped (null). A zero pool limit (free) has no pool.
  const hasPoolSections =
    (poolLimit === null || poolLimit > 0) &&
    (poolConsumed > 0 || (poolRemaining !== null && poolRemaining > 0));

  const tooltipLines: Array<{
    track: string;
    fill: string;
    legend: string;
    usage: string;
  }> = [];
  if (hasSeatSections) {
    tooltipLines.push({
      track: seatColors.track,
      fill: seatColors.fill,
      legend: "Seat usage",
      usage: `${formatCredits(seatConsumed)} credits used out of ${formatCredits(allowance)}`,
    });
  }
  if (hasPoolSections) {
    tooltipLines.push({
      track: MUTED_BAR_CLASSES.track,
      fill: MUTED_BAR_CLASSES.fill,
      legend: "Pool usage",
      usage:
        poolLimit !== null
          ? `${formatCredits(poolConsumed)} credits used out of ${formatCredits(poolLimit)}`
          : `${formatCredits(poolConsumed)} credits used`,
    });
  }
  if (overage > 0) {
    tooltipLines.push({
      track: OVERAGE_BAR_CLASSES.track,
      fill: OVERAGE_BAR_CLASSES.fill,
      legend: "Overage",
      usage: `${formatCredits(overage)} credits over the spend limit`,
    });
  }

  const tooltipContent =
    tooltipLines.length > 0 ? (
      <div className="flex flex-col gap-1">
        {tooltipLines.map((line) => (
          <div key={line.legend} className="flex items-center gap-2">
            <div className="relative h-2.5 w-2.5 overflow-hidden rounded-sm">
              <div
                className={`absolute inset-0 ${line.track}`}
                style={{ clipPath: "polygon(0 0, 100% 0, 0 100%)" }}
              />
              <div
                className={`absolute inset-0 ${line.fill}`}
                style={{ clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }}
              />
            </div>
            <span>
              {line.legend} — {line.usage}
            </span>
          </div>
        ))}
      </div>
    ) : null;

  const bar = (
    <div className="flex w-full items-center">
      <div className="flex w-full items-center gap-px">
        {total > 0 ? (
          sections.map((s) => (
            <div
              key={s.key}
              className="flex h-3 items-center"
              style={{ width: `${(s.value / total) * 100}%` }}
            >
              <div
                className={`h-1 w-full rounded-full ${s.className} transition-all`}
              />
            </div>
          ))
        ) : (
          <div
            className={`h-1 w-full rounded-full ${MUTED_BAR_CLASSES.track}`}
          />
        )}
      </div>
    </div>
  );

  return (
    <div className="flex w-full flex-col gap-1">
      <div className="flex justify-between text-xs tabular-nums text-foreground dark:text-foreground-night">
        <span>{formatCredits(consumed)}</span>
        {isPending ? (
          <Spinner size="xs" />
        ) : (
          <span>
            {effectiveLimit === null ? "∞" : formatCredits(effectiveLimit)}
          </span>
        )}
      </div>
      {tooltipContent ? (
        <Tooltip tooltipTriggerAsChild label={tooltipContent} trigger={bar} />
      ) : (
        bar
      )}
    </div>
  );
}

const nameColumn = buildMemberNameColumn<RowData>();

const seatTypeColumn: ColumnDef<RowData, string> = {
  id: "seatType" as const,
  header: "Seat",
  enableSorting: false,
  accessorFn: (row) => row.seatType ?? "",
  cell: (info: Info) => {
    if (info.row.original.isSeatChangePending) {
      return (
        <DataTable.CellContent>
          <Spinner size="xs" />
        </DataTable.CellContent>
      );
    }
    const seatType = info.row.original.seatType;
    const scheduledSeatType = info.row.original.scheduledSeatType;
    const scheduledSeatChangeAt = info.row.original.scheduledSeatChangeAt;
    return (
      <DataTable.CellContent>
        <span className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground dark:text-muted-foreground-night">
          <SeatTypeIcon seatType={seatType} />
          {seatType ? seatTypeDisplayName(seatType) : seatType}
          {scheduledSeatType && (
            <Tooltip
              label={getScheduledSeatChangeLabel(
                seatType,
                scheduledSeatType,
                scheduledSeatChangeAt
              )}
              tooltipTriggerAsChild
              trigger={
                <span className="cursor-default">
                  <Icon visual={Clock} size="xs" />
                </span>
              }
            />
          )}
        </span>
      </DataTable.CellContent>
    );
  },
  meta: {
    className: "w-36",
  },
};

const consumedAwuCreditsColumn: ColumnDef<RowData, string> = {
  id: "consumedAwuCredits" as const,
  header: () => <span>Credits usage</span>,
  accessorFn: (row) => row.consumedAwuCredits.toString(),
  cell: (info: Info) => (
    <div className="w-full pr-3">
      <AwuUsageBar
        consumed={info.row.original.consumedAwuCredits}
        consumedFromAllowance={
          info.row.original.consumedFromAllowanceAwuCredits
        }
        consumedFromPool={info.row.original.consumedFromPoolAwuCredits}
        memberUsageLimit={info.row.original.memberUsageLimit}
        limit={info.row.original.spendLimitAwuCredits}
        seatType={info.row.original.seatType}
        isTotalAllowedUsagePending={
          info.row.original.isTotalAllowedUsagePending
        }
      />
    </div>
  ),
  meta: {
    className: "w-64",
  },
  // Consumed is computed per-page from Metronome usage, not a server-sortable
  // field, so it can't participate in server-side sorting.
  enableSorting: false,
};

const actionsColumn: ColumnDef<RowData, string> = {
  id: "actions" as const,
  header: "",
  enableSorting: false,
  accessorKey: "actions",
  cell: (info: Info) => (
    <DataTable.MoreButton menuItems={info.row.original.menuItems} />
  ),
  meta: {
    className: "w-14",
  },
};

function buildColumns({
  isSeatBased,
}: {
  isSeatBased: boolean;
}): ColumnDef<RowData, string>[] {
  const optionalColumns = [];
  if (isSeatBased) {
    optionalColumns.push(seatTypeColumn);
  }
  return [
    nameColumn,
    ...optionalColumns,
    consumedAwuCreditsColumn,
    actionsColumn,
  ];
}

interface MembersUsageTableProps {
  members: MemberUsageType[];
  isLoading: boolean;
  totalAllowedUsagePendingMemberIds: ReadonlySet<string>;
  seatChangePendingMemberIds: ReadonlySet<string>;
  isSeatBased: boolean;
  showSpendLimit: boolean;
  readOnly: boolean;
  onChangeSeat: (member: MemberUsageType) => void;
  onRemoveSeat: (member: MemberUsageType) => void;
  onEditSpendLimit: (member: MemberUsageType) => void;
  pagination: PaginationState;
  setPagination: (pagination: PaginationState) => void;
  totalRowCount: number;
  sorting: SortingState;
  setSorting: (sorting: SortingState) => void;
}

export function MembersUsageTable({
  members,
  isLoading,
  totalAllowedUsagePendingMemberIds,
  seatChangePendingMemberIds,
  isSeatBased,
  showSpendLimit,
  readOnly,
  onChangeSeat,
  onRemoveSeat,
  onEditSpendLimit,
  pagination,
  setPagination,
  totalRowCount,
  sorting,
  setSorting,
}: MembersUsageTableProps) {
  const rows: RowData[] = useMemo(
    () =>
      members.map((m) => ({
        sId: m.sId,
        name: m.name,
        email: m.email,
        image: m.image,
        seatType: m.seatType,
        memberUsageLimit: m.memberUsageLimit,
        consumedAwuCredits: m.consumedAwuCredits,
        consumedFromAllowanceAwuCredits: m.consumedFromAllowanceAwuCredits,
        consumedFromPoolAwuCredits: m.consumedFromPoolAwuCredits,
        spendLimitAwuCredits: m.spendLimitAwuCredits,
        scheduledSeatType: m.scheduledSeatType,
        scheduledSeatChangeAt: m.scheduledSeatChangeAt,
        isTotalAllowedUsagePending: totalAllowedUsagePendingMemberIds.has(
          m.sId
        ),
        isSeatChangePending: seatChangePendingMemberIds.has(m.sId),
        menuItems: [
          ...(isSeatBased
            ? [
                {
                  kind: "item" as const,
                  label: m.seatType ? "Change seat type" : "Assign seat",
                  disabled: readOnly,
                  onClick: () => onChangeSeat(m),
                },
              ]
            : []),
          ...(showSpendLimit
            ? [
                {
                  kind: "item" as const,
                  label: "Edit spend limit",
                  disabled: readOnly,
                  onClick: () => onEditSpendLimit(m),
                },
              ]
            : []),
          // Only members who currently hold a billable seat can have it removed.
          ...(isSeatBased && m.seatType && m.seatType !== "none"
            ? [
                {
                  kind: "item" as const,
                  label: "Remove seat",
                  variant: "warning" as const,
                  disabled: readOnly,
                  onClick: () => onRemoveSeat(m),
                },
              ]
            : []),
        ],
      })),
    [
      members,
      totalAllowedUsagePendingMemberIds,
      seatChangePendingMemberIds,
      isSeatBased,
      showSpendLimit,
      readOnly,
      onChangeSeat,
      onRemoveSeat,
      onEditSpendLimit,
    ]
  );

  const columns = useMemo(() => buildColumns({ isSeatBased }), [isSeatBased]);

  if (isLoading) {
    return (
      <div className="flex w-full flex-col space-y-2">
        <LoadingBlock className="h-8 w-full rounded-xl" />
        <LoadingBlock className="h-8 w-full rounded-xl" />
        <LoadingBlock className="h-8 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <DataTable
      data={rows}
      columns={columns}
      pagination={pagination}
      setPagination={setPagination}
      totalRowCount={totalRowCount}
      sorting={sorting}
      setSorting={setSorting}
      isServerSideSorting
    />
  );
}
