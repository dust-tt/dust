import type { MemberUsageType } from "@app/lib/api/credits/members_usage";
import type { MembershipSeatType } from "@app/types/memberships";
import {
  DataTable,
  LoadingBlock,
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
  consumedMicroUsd: number;
  onClick?: () => void;
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

function formatMicroUsd(amountMicroUsd: number): string {
  const dollars = amountMicroUsd / 1_000_000;
  return `$${dollars.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
    return (
      <DataTable.CellContent>
        <span className="flex items-center gap-1.5 text-sm font-semibold capitalize text-muted-foreground dark:text-muted-foreground-night">
          <SeatTypeIcon seatType={seatType} />
          {seatType ?? "—"}
        </span>
      </DataTable.CellContent>
    );
  },
  meta: {
    className: "w-28",
  },
};

const seatUsagePercentColumn: ColumnDef<RowData, string> = {
  id: "seatUsagePercent" as const,
  header: "Seat usage",
  accessorFn: (row) => (row.seatUsagePercent ?? 0).toString(),
  cell: (info: Info) => {
    const pct = info.row.original.seatUsagePercent;
    return (
      <DataTable.CellContent>
        {pct !== null ? (
          <span className="flex items-center gap-1.5 text-sm font-semibold tabular-nums text-muted-foreground dark:text-muted-foreground-night">
            <CircleProgress percentage={pct} />
            {`${Math.round(pct)}%`}
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
    className: "w-28",
  },
  enableSorting: true,
  sortingFn: (a, b) =>
    (a.original.seatUsagePercent ?? -1) - (b.original.seatUsagePercent ?? -1),
};

const consumedMicroUsdColumn: ColumnDef<RowData, string> = {
  id: "consumedMicroUsd" as const,
  header: "Workspace usage",
  accessorFn: (row) => row.consumedMicroUsd.toString(),
  cell: (info: Info) => (
    <DataTable.CellContent>
      <span className="text-sm tabular-nums text-muted-foreground dark:text-muted-foreground-night">
        {formatMicroUsd(info.row.original.consumedMicroUsd)}
      </span>
    </DataTable.CellContent>
  ),
  meta: {
    className: "w-36 text-right",
  },
  enableSorting: true,
  sortingFn: (a, b) =>
    a.original.consumedMicroUsd - b.original.consumedMicroUsd,
};

function buildColumns(showSeatColumns: boolean): ColumnDef<RowData, string>[] {
  return [
    nameColumn,
    ...(showSeatColumns ? [seatTypeColumn, seatUsagePercentColumn] : []),
    consumedMicroUsdColumn,
  ];
}

interface MembersUsageTableProps {
  members: MemberUsageType[];
  isLoading: boolean;
  searchTerm: string;
  seatTypeFilter: MembershipSeatType | "none" | null;
  showSeatColumns: boolean;
}

export function MembersUsageTable({
  members,
  isLoading,
  searchTerm,
  seatTypeFilter,
  showSeatColumns,
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
    consumedMicroUsd: m.consumedMicroUsd,
  }));

  return <DataTable data={rows} columns={buildColumns(showSeatColumns)} />;
}
