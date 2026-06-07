import type { MemberUsageType } from "@app/lib/api/credits/members_usage";
import { formatCredits } from "@app/lib/client/credits";
import type { BillingFrequency } from "@app/lib/metronome/types";
import {
  isMembershipSeatType,
  type MembershipSeatType,
} from "@app/types/memberships";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { ANONYMOUS_USER_IMAGE_URL } from "@app/types/user";
import {
  AlertCircle,
  Cube01,
  DataTable,
  Hexagon01,
  LoadingBlock,
  type MenuItem,
  SeatMax,
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
  menuItems: MenuItem[];
};

type Info = CellContext<RowData, string>;

const SEAT_TYPE_ICONS: Partial<
  Record<MembershipSeatType, React.ComponentType>
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

interface SeatTypeIconProps {
  seatType: MembershipSeatType | null;
}

function SeatTypeIcon({ seatType }: SeatTypeIconProps) {
  if (!seatType) {
    return null;
  }
  const Icon = SEAT_TYPE_ICONS[getDisplaySeatType(seatType)];
  if (!Icon) {
    return null;
  }
  return <Icon />;
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
}

const MUTED_BAR_CLASSES = {
  track: "bg-muted-background dark:bg-muted-background-night",
  fill: "bg-muted-foreground dark:bg-muted-foreground-night",
};

function getSeatBarClasses(seatType: MembershipSeatType | null) {
  if (seatType?.startsWith("pro")) {
    return {
      track: "bg-blue-100 dark:bg-blue-100-night",
      fill: "bg-highlight dark:bg-highlight-night",
    };
  }
  if (seatType?.startsWith("max")) {
    return {
      track: "bg-golden-100 dark:bg-golden-100-night",
      fill: "bg-brand-orange-golden",
    };
  }
  return MUTED_BAR_CLASSES;
}

function AwuUsageBar({
  consumed,
  consumedFromAllowance,
  consumedFromPool,
  memberUsageLimit,
  limit,
  seatType,
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

  return (
    <div className="flex w-full flex-col gap-1">
      <div className="flex justify-between text-xs tabular-nums text-foreground dark:text-foreground-night">
        <span>{formatCredits(consumed)}</span>
        <span>{limit === null ? "∞" : formatCredits(limit)}</span>
      </div>
      <div className="flex w-full items-center gap-px">
        {total > 0 ? (
          sections.map((s) => (
            <Tooltip
              key={s.key}
              tooltipTriggerAsChild
              label={s.label}
              trigger={
                <div
                  className="flex h-3 items-center"
                  style={{ width: `${(s.value / total) * 100}%` }}
                >
                  <div
                    className={`h-1 w-full rounded-full ${s.className} transition-all`}
                  />
                </div>
              }
            />
          ))
        ) : (
          <div
            className={`h-1 w-full rounded-full ${MUTED_BAR_CLASSES.track}`}
          />
        )}
      </div>
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
    const seatType = info.row.original.seatType;
    const scheduledSeatType = info.row.original.scheduledSeatType;
    const scheduledSeatChangeAt = info.row.original.scheduledSeatChangeAt;
    const scheduledDate = scheduledSeatChangeAt
      ? new Date(scheduledSeatChangeAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        })
      : null;
    return (
      <DataTable.CellContent>
        <span className="flex flex-col">
          <span className="flex items-center gap-1.5 text-sm font-semibold capitalize text-muted-foreground dark:text-muted-foreground-night">
            <SeatTypeIcon seatType={seatType} />
            {seatType ? getDisplaySeatType(seatType) : "—"}
          </span>
          {scheduledSeatType && scheduledDate && (
            <span className="text-xs capitalize text-amber-600 dark:text-amber-400">
              → {getDisplaySeatType(scheduledSeatType)} on {scheduledDate}
            </span>
          )}
        </span>
      </DataTable.CellContent>
    );
  },
  meta: {
    className: "w-28",
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
  seatTypeFilter: MembershipSeatType | "none" | null;
  isSeatBased: boolean;
  onChangeSeat: (member: MemberUsageType) => void;
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
  seatTypeFilter,
  isSeatBased,
  onChangeSeat,
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
        menuItems: [
          ...(isSeatBased
            ? [
                {
                  kind: "item" as const,
                  label: "Change seat type",
                  onClick: () => onChangeSeat(m),
                },
              ]
            : []),
          {
            kind: "item" as const,
            label: "Edit spend limit",
            onClick: () => onEditSpendLimit(m),
          },
        ],
      })),
    [filtered, isSeatBased, onChangeSeat, onEditSpendLimit]
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
