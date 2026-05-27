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
  Tooltip,
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
  memberUsageLimit: number | null;
  consumedAwuCredits: number;
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

interface AwuUsageBarProps {
  consumed: number;
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
  memberUsageLimit,
  limit,
  seatType,
}: AwuUsageBarProps) {
  const hasSeatAllocation = memberUsageLimit !== null && memberUsageLimit > 0;

  if (!hasSeatAllocation) {
    const percent =
      limit !== null && limit > 0 ? Math.min((consumed / limit) * 100, 100) : 0;
    return (
      <div className="flex w-full flex-col gap-1">
        <div className="flex justify-between text-xs tabular-nums text-foreground dark:text-foreground-night">
          <span>{formatCredits(consumed)}</span>
          <span>{limit === null ? "∞" : formatCredits(limit)}</span>
        </div>
        <div
          className={`h-0.5 w-full overflow-hidden rounded-full ${MUTED_BAR_CLASSES.track}`}
        >
          <div
            className={`h-full ${MUTED_BAR_CLASSES.fill} transition-all`}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    );
  }

  const seatColors = getSeatBarClasses(seatType);
  const seatConsumed = Math.min(consumed, memberUsageLimit);
  const seatFillPercent = (seatConsumed / memberUsageLimit) * 100;
  const overflow = Math.max(0, consumed - memberUsageLimit);
  const overflowRange =
    limit !== null ? Math.max(0, limit - memberUsageLimit) : null;
  const overflowFillPercent =
    overflowRange !== null && overflowRange > 0
      ? Math.min((overflow / overflowRange) * 100, 100)
      : overflow > 0
        ? 100
        : 0;
  const seatWidthPercent =
    limit !== null && limit > memberUsageLimit
      ? (memberUsageLimit / limit) * 100
      : 50;
  const overflowWidthPercent = 100 - seatWidthPercent;
  const remaining = limit !== null ? Math.max(0, limit - consumed) : null;

  return (
    <div className="flex w-full flex-col gap-1">
      <div className="flex justify-between text-xs tabular-nums text-foreground dark:text-foreground-night">
        <span>{formatCredits(consumed)}</span>
        <span>{limit === null ? "∞" : formatCredits(limit)}</span>
      </div>
      <div className="flex w-full items-center gap-0.5">
        <Tooltip
          tooltipTriggerAsChild
          label={`${formatCredits(seatConsumed)} credits consumed over ${formatCredits(memberUsageLimit)} seat limit`}
          trigger={
            <div
              className="flex h-3 items-center"
              style={{ width: `${seatWidthPercent}%` }}
            >
              <div
                className={`h-0.5 w-full overflow-hidden rounded-full ${seatColors.track}`}
              >
                <div
                  className={`h-full ${seatColors.fill} transition-all`}
                  style={{ width: `${seatFillPercent}%` }}
                />
              </div>
            </div>
          }
        />
        <Tooltip
          tooltipTriggerAsChild
          label={`${remaining === null ? "∞" : formatCredits(remaining)} credits remaining`}
          trigger={
            <div
              className="flex h-3 items-center"
              style={{ width: `${overflowWidthPercent}%` }}
            >
              <div
                className={`h-0.5 w-full overflow-hidden rounded-full ${MUTED_BAR_CLASSES.track}`}
              >
                <div
                  className={`h-full ${MUTED_BAR_CLASSES.fill} transition-all`}
                  style={{ width: `${overflowFillPercent}%` }}
                />
              </div>
            </div>
          }
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
    console.log(info.row);
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
  header: () => (
    <span className="flex items-center gap-1.5">
      <Icon visual={ActionCreditCoinsIcon} size="xs" />
      Credits usage
    </span>
  ),
  accessorFn: (row) => row.consumedAwuCredits.toString(),
  cell: (info: Info) => (
    <div className="w-full pr-3">
      <AwuUsageBar
        consumed={info.row.original.consumedAwuCredits}
        memberUsageLimit={info.row.original.memberUsageLimit}
        limit={info.row.original.spendLimitAwuCredits}
        seatType={info.row.original.seatType}
      />
    </div>
  ),
  meta: {
    className: "w-64",
  },
  enableSorting: true,
  sortingFn: (a, b) =>
    a.original.consumedAwuCredits - b.original.consumedAwuCredits,
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

function buildColumns({
  hasSeatSubscription,
  isEnterprise,
}: {
  hasSeatSubscription: boolean;
  isEnterprise: boolean;
}): ColumnDef<RowData, string>[] {
  const showActions = hasSeatSubscription || isEnterprise;
  const optionalColumns = [];
  if (hasSeatSubscription) {
    optionalColumns.push(seatTypeColumn);
  }
  if (!isEnterprise) {
    optionalColumns.push(billingFrequencyColumn);
  }
  return [
    nameColumn,
    ...optionalColumns,
    consumedAwuCreditsColumn,
    ...(showActions ? [actionsColumn] : []),
  ];
}

interface MembersUsageTableProps {
  members: MemberUsageType[];
  isLoading: boolean;
  searchTerm: string;
  seatTypeFilter: MembershipSeatType | "none" | null;
  hasSeatSubscription: boolean;
  isEnterprise: boolean;
  onChangeSeat: (member: MemberUsageType) => void;
  onEditSpendLimit: (member: MemberUsageType) => void;
}

export function MembersUsageTable({
  members,
  isLoading,
  searchTerm,
  seatTypeFilter,
  hasSeatSubscription,
  isEnterprise,
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
      m.seatType &&
      !m.seatType.startsWith(seatTypeFilter)
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
    memberUsageLimit: m.memberUsageLimit,
    consumedAwuCredits: m.consumedAwuCredits,
    spendLimitAwuCredits: m.spendLimitAwuCredits,
    billingFrequency: m.billingFrequency,
    scheduledSeatType: m.scheduledSeatType,
    scheduledSeatChangeAt: m.scheduledSeatChangeAt,
    menuItems: [
      ...(hasSeatSubscription
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
  }));

  return (
    <DataTable
      data={rows}
      columns={buildColumns({ hasSeatSubscription, isEnterprise })}
    />
  );
}
