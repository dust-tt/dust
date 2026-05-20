import type { MemberUsageType } from "@app/lib/api/credits/members_usage";
import type { BillingFrequency } from "@app/lib/metronome/types";
import type { MembershipSeatType } from "@app/types/memberships";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import {
  ActionCreditCoinsIcon,
  DataTable,
  Icon,
  LoadingBlock,
  type MenuItem,
  SeatFreeIcon,
  SeatMaxIcon,
  SeatProIcon,
} from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import type React from "react";

type RowData = {
  sId: string;
  name: string;
  email: string | null;
  image: string | null;
  seatType: MembershipSeatType | null;
  seatUsagePercent: number | null;
  consumedWorkplacePoolCredits: number;
  spendLimitAwuCredits: number | null;
  billingFrequency: BillingFrequency | null;
  scheduledSeatType: MembershipSeatType | null;
  scheduledSeatChangeAt: string | null;
  menuItems: MenuItem[];
};

type Info = CellContext<RowData, string>;

interface CircleProgressProps {
  percentage: number;
}

function CircleProgress({ percentage }: CircleProgressProps) {
  const size = 16;
  const strokeWidth = 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedPct = Math.min(100, Math.max(0, percentage));
  const offset = circumference - (clampedPct / 100) * circumference;
  const strokeColor =
    percentage >= 100
      ? "#ef4444"
      : percentage >= 80
        ? "#f59e0b"
        : "currentColor";

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        opacity={0.2}
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="butt"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

const SEAT_TYPE_ICONS: Partial<
  Record<MembershipSeatType, React.ComponentType>
> = {
  max: SeatMaxIcon,
  pro: SeatProIcon,
  free: SeatFreeIcon,
};

interface SeatTypeIconProps {
  seatType: MembershipSeatType | null;
}

function SeatTypeIcon({ seatType }: SeatTypeIconProps) {
  if (!seatType) {
    return null;
  }
  const Icon = SEAT_TYPE_ICONS[seatType];
  if (!Icon) {
    return null;
  }
  return <Icon />;
}

function formatCredits(credits: number): string {
  return credits.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

interface WorkspaceUsageBarProps {
  consumed: number;
  limit: number | null;
}

function WorkspaceUsageBar({ consumed, limit }: WorkspaceUsageBarProps) {
  const percentage =
    limit !== null && limit > 0 ? Math.min((consumed / limit) * 100, 100) : 0;

  return (
    <div className="flex w-full flex-col gap-1">
      <div className="flex justify-between text-xs tabular-nums text-foreground dark:text-foreground-night">
        <span>{formatCredits(consumed)}</span>
        <span>{limit === null ? "∞" : formatCredits(limit)}</span>
      </div>
      <div className="h-0.5 w-full overflow-hidden rounded-full bg-muted-foreground/10 dark:bg-muted-foreground-night/10">
        <div
          className="h-full transition-all"
          style={{ width: `${percentage}%`, backgroundColor: "#596170" }}
        />
      </div>
    </div>
  );
}

const nameColumn: ColumnDef<RowData, string> = {
  id: "name" as const,
  header: "Name",
  accessorFn: (row) => row.name,
  cell: (info: Info) => (
    <DataTable.CellContent
      avatarUrl={info.row.original.image ?? undefined}
      roundedAvatar
    >
      <div>
        <div>{info.row.original.name}</div>
        {info.row.original.email && (
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
            {seatType ?? "—"}
          </span>
          {scheduledSeatType && scheduledDate && (
            <span className="text-xs capitalize text-amber-600 dark:text-amber-400">
              → {scheduledSeatType} on {scheduledDate}
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

const seatUsagePercentColumn: ColumnDef<RowData, string> = {
  id: "seatUsagePercent" as const,
  header: "Seat usage",
  accessorFn: (row) => (row.seatUsagePercent ?? 0).toString(),
  cell: (info: Info) => {
    const pct = info.row.original.seatUsagePercent;
    let textColor: string | undefined;
    if (pct !== null) {
      if (pct >= 100) {
        textColor = "#ef4444";
      } else if (pct >= 80) {
        textColor = "#FE9C1A";
      }
    }
    return (
      <DataTable.CellContent>
        {pct !== null ? (
          <span
            className="flex items-center gap-1.5 text-sm font-semibold tabular-nums"
            style={textColor ? { color: textColor } : undefined}
          >
            {`${Math.round(pct)}%`}
            <CircleProgress percentage={pct} />
          </span>
        ) : (
          <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            —
          </span>
        )}
      </DataTable.CellContent>
    );
  },
  meta: {
    className: "w-32",
  },
  enableSorting: true,
  sortingFn: (a, b) =>
    (a.original.seatUsagePercent ?? -1) - (b.original.seatUsagePercent ?? -1),
};

const consumedWorkplacePoolCreditsColumn: ColumnDef<RowData, string> = {
  id: "consumedWorkplacePoolCredits" as const,
  header: () => (
    <span className="flex items-center gap-1.5">
      <Icon visual={ActionCreditCoinsIcon} size="xs" />
      Workspace usage
    </span>
  ),
  accessorFn: (row) => row.consumedWorkplacePoolCredits.toString(),
  cell: (info: Info) => (
    <div className="w-full pr-3">
      <WorkspaceUsageBar
        consumed={info.row.original.consumedWorkplacePoolCredits}
        limit={info.row.original.spendLimitAwuCredits}
      />
    </div>
  ),
  meta: {
    className: "w-64",
  },
  enableSorting: true,
  sortingFn: (a, b) =>
    a.original.consumedWorkplacePoolCredits -
    b.original.consumedWorkplacePoolCredits,
};

const actionsColumn: ColumnDef<RowData, string> = {
  id: "actions" as const,
  header: "",
  accessorKey: "actions",
  cell: (info: Info) => (
    <DataTable.MoreButton menuItems={info.row.original.menuItems} />
  ),
  meta: {
    className: "w-14",
  },
};

function buildColumns(showSeatColumns: boolean): ColumnDef<RowData, string>[] {
  return [
    nameColumn,
    ...(showSeatColumns
      ? [seatTypeColumn, billingFrequencyColumn, seatUsagePercentColumn]
      : []),
    consumedWorkplacePoolCreditsColumn,
    ...(showSeatColumns ? [actionsColumn] : []),
  ];
}

interface MembersUsageTableProps {
  members: MemberUsageType[];
  isLoading: boolean;
  searchTerm: string;
  seatTypeFilter: MembershipSeatType | "none" | null;
  showSeatColumns: boolean;
  onChangeSeat: (member: MemberUsageType) => void;
  onEditSpendLimit: (member: MemberUsageType) => void;
}

export function MembersUsageTable({
  members,
  isLoading,
  searchTerm,
  seatTypeFilter,
  showSeatColumns,
  onChangeSeat,
  onEditSpendLimit,
}: MembersUsageTableProps) {
  if (isLoading) {
    return (
      <div className="flex w-full flex-col space-y-2">
        <LoadingBlock className="h-8 w-full rounded-xl" />
        <LoadingBlock className="h-8 w-full rounded-xl" />
        <LoadingBlock className="h-8 w-full rounded-xl" />
      </div>
    );
  }

  const lowerSearch = searchTerm.toLowerCase();
  const filtered = members.filter((m) => {
    if (
      searchTerm &&
      !m.name.toLowerCase().includes(lowerSearch) &&
      !(m.email ?? "").toLowerCase().includes(lowerSearch)
    ) {
      return false;
    }
    if (seatTypeFilter === "none" && m.seatType !== null) {
      return false;
    }
    if (
      seatTypeFilter !== null &&
      seatTypeFilter !== "none" &&
      m.seatType !== seatTypeFilter
    ) {
      return false;
    }
    return true;
  });

  const rows: RowData[] = filtered.map((m) => ({
    sId: m.sId,
    name: m.name,
    email: m.email,
    image: m.image,
    seatType: m.seatType,
    seatUsagePercent: m.seatUsagePercent,
    consumedWorkplacePoolCredits: m.consumedWorkplacePoolCredits,
    spendLimitAwuCredits: m.spendLimitAwuCredits,
    billingFrequency: m.billingFrequency,
    scheduledSeatType: m.scheduledSeatType,
    scheduledSeatChangeAt: m.scheduledSeatChangeAt,
    menuItems: [
      {
        kind: "item" as const,
        label: "Change Seat Type",
        onClick: () => onChangeSeat(m),
      },
      {
        kind: "item" as const,
        label: "Update User Spend Limit",
        onClick: () => onEditSpendLimit(m),
      },
    ],
  }));

  return <DataTable data={rows} columns={buildColumns(showSeatColumns)} />;
}
