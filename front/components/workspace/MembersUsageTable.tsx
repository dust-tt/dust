import {
  getSeatBarClasses,
  getSeatIconColorClass,
  MUTED_BAR_CLASSES,
} from "@app/components/workspace/seat_styles";
import type { MemberUsageType } from "@app/lib/api/credits/members_usage";
import { formatCredits } from "@app/lib/client/credits";
import type { BillingFrequency } from "@app/lib/metronome/types";
import {
  isMembershipSeatType,
  type MembershipSeatType,
  SEAT_TYPE_ORDER,
} from "@app/types/memberships";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { ANONYMOUS_USER_IMAGE_URL } from "@app/types/user";
import {
  AlertCircle,
  Clock,
  Cube01,
  DataTable,
  Hexagon01,
  Icon,
  LoadingBlock,
  type MenuItem,
  SeatMax,
  Spinner,
  Tooltip,
} from "@dust-tt/sparkle";
import type {
  CellContext,
  ColumnDef,
  PaginationState,
  SortingState,
} from "@tanstack/react-table";
import type React from "react";
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
  billingFrequency: BillingFrequency | null;
  scheduledSeatType: MembershipSeatType | null;
  scheduledSeatChangeAt: string | null;
  isTotalAllowedUsagePending: boolean;
  isSeatChangePending: boolean;
  menuItems: MenuItem[];
};

type Info = CellContext<RowData, string>;

const SEAT_TYPE_ICONS: Partial<
  Record<MembershipSeatType, React.ComponentType<{ className?: string }>>
> = {
  none: AlertCircle,
  max: SeatMax,
  pro: Cube01,
  free: Hexagon01,
};

// Yearly seat types are billed yearly but render in the table identically to
// their monthly counterpart — the billing cadence is shown in the dedicated
// billing frequency column. Strip the suffix for icon lookup and display.
function getDisplaySeatType(seatType: MembershipSeatType): MembershipSeatType {
  if (seatType.endsWith("_yearly")) {
    const stripped = seatType.slice(0, -"_yearly".length);
    return isMembershipSeatType(stripped) ? stripped : seatType;
  }
  return seatType;
}

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
  const target = getDisplaySeatType(scheduledSeatType);
  const targetLabel = target.charAt(0).toUpperCase() + target.slice(1);
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
  const displaySeatType = getDisplaySeatType(seatType);
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
  const seatColors = getSeatBarClasses(seatType);
  const allowance = memberUsageLimit ?? 0;

  // The bar is up to four contiguous sections, each with its own tooltip:
  //   seat consumed · seat remaining · pool consumed · pool remaining
  // Zero-width sections are skipped, so in practice it renders as:
  //   - within allowance:   seat consumed · seat remaining · pool remaining
  //   - overflowed to pool: seat consumed · pool consumed · pool remaining
  //   - no seat allowance:  pool consumed · pool remaining
  // `pool remaining` is omitted when the user is uncapped (no finite headroom).
  const seatConsumed = consumedFromAllowance;
  const seatRemaining = Math.max(0, allowance - seatConsumed);
  const poolConsumed = consumedFromPool;
  const poolRemaining =
    limit !== null ? Math.max(0, limit - allowance - poolConsumed) : null;

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

  const total = sections.reduce((sum, s) => sum + s.value, 0);

  const hasSeatSections = seatConsumed > 0 || seatRemaining > 0;
  const hasPoolSections =
    poolConsumed > 0 || (poolRemaining !== null && poolRemaining > 0);

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
    const poolTotal = limit !== null ? limit - allowance : null;
    tooltipLines.push({
      track: MUTED_BAR_CLASSES.track,
      fill: MUTED_BAR_CLASSES.fill,
      legend: "Pool usage",
      usage:
        poolTotal !== null
          ? `${formatCredits(poolConsumed)} credits used out of ${formatCredits(poolTotal)}`
          : `${formatCredits(poolConsumed)} credits used`,
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
          <span>{limit === null ? "∞" : formatCredits(limit)}</span>
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

const nameColumn: ColumnDef<RowData, string> = {
  id: "name" as const,
  header: "Name",
  enableSorting: true,
  accessorFn: (row) => row.name,
  cell: (info: Info) => (
    <DataTable.CellContent
      avatarUrl={info.row.original.image ?? ANONYMOUS_USER_IMAGE_URL}
      roundedAvatar
    >
      <div>
        <div>{info.row.original.name}</div>
        {info.row.original.email &&
          info.row.original.email !== info.row.original.name && (
            <div className="text-xs text-muted-foreground dark:text-muted-foreground-night">
              {info.row.original.email}
            </div>
          )}
      </div>
    </DataTable.CellContent>
  ),
};

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
        <span className="flex items-center gap-1.5 text-sm font-semibold capitalize text-muted-foreground dark:text-muted-foreground-night">
          <SeatTypeIcon seatType={seatType} />
          {seatType ? getDisplaySeatType(seatType) : "—"}
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

const billingFrequencyColumn: ColumnDef<RowData, string> = {
  id: "billingFrequency" as const,
  header: "Period",
  enableSorting: false,
  accessorFn: (row) => row.billingFrequency ?? "",
  cell: (info: Info) => {
    const freq = info.row.original.billingFrequency;
    let label: string;
    switch (freq) {
      case "MONTHLY":
        label = "Monthly";
        break;
      case "ANNUAL":
        label = "Annual";
        break;
      case null:
        label = "—";
        break;
      default:
        assertNeverAndIgnore(freq);
        label = "—";
    }
    return (
      <DataTable.CellContent>
        <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          {label}
        </span>
      </DataTable.CellContent>
    );
  },
  meta: {
    className: "w-24",
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
  displayPeriodColumn,
}: {
  isSeatBased: boolean;
  displayPeriodColumn: boolean;
}): ColumnDef<RowData, string>[] {
  const optionalColumns = [];
  if (isSeatBased) {
    optionalColumns.push(seatTypeColumn);
  }
  if (displayPeriodColumn) {
    optionalColumns.push(billingFrequencyColumn);
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
  seatTypeFilter: MembershipSeatType | "none" | null;
  isSeatBased: boolean;
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
  seatTypeFilter,
  isSeatBased,
  onChangeSeat,
  onRemoveSeat,
  onEditSpendLimit,
  pagination,
  setPagination,
  totalRowCount,
  sorting,
  setSorting,
}: MembersUsageTableProps) {
  // Name/email search is handled server-side; only filter by seat type here.
  const filtered = useMemo(
    () =>
      members.filter((m) => {
        if (seatTypeFilter === "none" && m.seatType !== null) {
          return false;
        }
        if (
          seatTypeFilter !== null &&
          seatTypeFilter !== "none" &&
          m.seatType &&
          !m.seatType.startsWith(seatTypeFilter)
        ) {
          return false;
        }
        return true;
      }),
    [members, seatTypeFilter]
  );

  const rows: RowData[] = useMemo(
    () =>
      filtered.map((m) => ({
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
        billingFrequency: m.billingFrequency,
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
                  onClick: () => onChangeSeat(m),
                },
              ]
            : []),
          {
            kind: "item" as const,
            label: "Edit spend limit",
            onClick: () => onEditSpendLimit(m),
          },
          // Only members who currently hold a billable seat can have it removed.
          ...(isSeatBased && m.seatType && m.seatType !== "none"
            ? [
                {
                  kind: "item" as const,
                  label: "Remove seat",
                  variant: "warning" as const,
                  onClick: () => onRemoveSeat(m),
                },
              ]
            : []),
        ],
      })),
    [
      filtered,
      totalAllowedUsagePendingMemberIds,
      seatChangePendingMemberIds,
      isSeatBased,
      onChangeSeat,
      onRemoveSeat,
      onEditSpendLimit,
    ]
  );

  const displayPeriodColumn = useMemo(
    () => rows.some((row) => !!row.billingFrequency),
    [rows]
  );

  const columns = useMemo(
    () => buildColumns({ isSeatBased, displayPeriodColumn }),
    [isSeatBased, displayPeriodColumn]
  );

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
