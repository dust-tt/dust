import { seatTypeDisplayName } from "@app/components/workspace/billing/seatTypeUtils";
import { buildMemberNameColumn } from "@app/components/workspace/member_name_column";
import { getSeatIconColorClass } from "@app/components/workspace/seat_styles";
import type { SpendLimitExpiryKind } from "@app/types/api/users/spend_limit";
import type { MembershipUpgradeRequestType } from "@app/types/memberships";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { ANONYMOUS_USER_IMAGE_URL } from "@app/types/user";
import {
  AlertCircle,
  Avatar,
  ChevronRight,
  Chip,
  ContentMessage,
  DataTable,
  Icon,
  LoadingBlock,
  Popover,
  Tooltip,
} from "@dust-tt/sparkle";
import type {
  CellContext,
  ColumnDef,
  PaginationState,
} from "@tanstack/react-table";
import { useMemo } from "react";

type RowData = {
  sId: string;
  name: string;
  email: string | null;
  image: string | null;
  createdAt: number;
  request: MembershipUpgradeRequestType;
  // Rows are not clickable, but DataTable's row type requires at least one
  // of its optional fields to be present.
  onClick?: () => void;
};

type Info = CellContext<RowData, string>;

const nameColumn = buildMemberNameColumn<RowData>("User");

const REASON_LABEL = "Reached credit limit";

function formatDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function durationLabel(expiryKind: SpendLimitExpiryKind | null): string | null {
  if (expiryKind === null) {
    return null;
  }
  switch (expiryKind) {
    case "one_day":
      return "1 day";
    case "next_credit_reset":
      return "Until next billing";
    case "never":
      return "Forever";
    default:
      assertNeverAndIgnore(expiryKind);
      return null;
  }
}

const issuedColumn: ColumnDef<RowData, string> = {
  id: "issued" as const,
  header: "Requested",
  accessorFn: (row) => row.createdAt.toString(),
  cell: (info: Info) => (
    <DataTable.CellContent>
      <span className="text-sm text-muted-foreground">
        {formatDate(info.row.original.createdAt)}
      </span>
    </DataTable.CellContent>
  ),
  meta: {
    className: "w-28",
  },
};

// The pool-cap override or seat upgrade this request actually resulted in, if
// any.
const grantedColumn: ColumnDef<RowData, string> = {
  id: "granted" as const,
  header: "Granted",
  enableSorting: false,
  cell: (info: Info) => {
    const {
      status,
      grantedAwuCredits,
      grantedUnlimitedSpend,
      grantedSeatType,
    } = info.row.original.request;

    if (status !== "approved") {
      return (
        <DataTable.CellContent>
          <span className="text-sm text-muted-foreground">—</span>
        </DataTable.CellContent>
      );
    }

    if (grantedSeatType) {
      return (
        <DataTable.CellContent>
          <span
            className={`text-sm font-medium ${getSeatIconColorClass(grantedSeatType)}`}
          >
            Upgraded to {seatTypeDisplayName(grantedSeatType)}
          </span>
        </DataTable.CellContent>
      );
    }

    if (grantedUnlimitedSpend) {
      return (
        <DataTable.CellContent>
          <span className="text-sm">Unlimited spend</span>
        </DataTable.CellContent>
      );
    }

    if (grantedAwuCredits !== null) {
      return (
        <DataTable.CellContent>
          <span className="text-sm">
            {grantedAwuCredits.toLocaleString("en-US")} credits
          </span>
        </DataTable.CellContent>
      );
    }

    return (
      <DataTable.CellContent>
        <span className="text-sm text-muted-foreground">—</span>
      </DataTable.CellContent>
    );
  },
  meta: {
    className: "w-36",
  },
};

// When the grant reverts, if ever. only a credit-amount grant
// can carry the admin's duration choice.
const untilColumn: ColumnDef<RowData, string> = {
  id: "until" as const,
  header: "For",
  enableSorting: false,
  cell: (info: Info) => {
    const {
      status,
      grantedAwuCredits,
      grantedExpiryKind,
      grantedUnlimitedSpend,
      grantedSeatType,
    } = info.row.original.request;

    const hasGrant =
      grantedAwuCredits !== null || grantedUnlimitedSpend || grantedSeatType;
    if (status !== "approved" || !hasGrant) {
      return (
        <DataTable.CellContent>
          <span className="text-sm text-muted-foreground">—</span>
        </DataTable.CellContent>
      );
    }

    const label =
      grantedSeatType || grantedUnlimitedSpend
        ? "Forever"
        : (durationLabel(grantedExpiryKind) ?? "—");

    return (
      <DataTable.CellContent>
        <span className="text-sm text-muted-foreground">{label}</span>
      </DataTable.CellContent>
    );
  },
  meta: {
    className: "w-28",
  },
};

function ReasonCell({ reason }: { reason: string | null }) {
  if (!reason) {
    return (
      <span className="text-sm text-muted-foreground">{REASON_LABEL}</span>
    );
  }

  return (
    <Popover
      popoverTriggerAsChild
      trigger={
        <button
          type="button"
          className="flex flex-col items-start gap-0.5 text-left"
        >
          <span className="line-clamp-2 text-sm text-muted-foreground">
            {reason}
          </span>
          <span className="flex items-center gap-0.5 text-xs font-medium text-highlight">
            Show more
            <Icon visual={ChevronRight} size="xs" />
          </span>
        </button>
      }
      content={
        <p className="whitespace-pre-wrap text-sm text-foreground">{reason}</p>
      }
    />
  );
}

const reasonColumn: ColumnDef<RowData, string> = {
  id: "reason" as const,
  header: "Reason",
  enableSorting: false,
  cell: (info: Info) => (
    <DataTable.CellContent>
      <ReasonCell reason={info.row.original.request.reason} />
    </DataTable.CellContent>
  ),
  meta: {
    className: "max-w-64",
  },
};

const statusColumn: ColumnDef<RowData, string> = {
  id: "status" as const,
  header: "Decision",
  enableSorting: false,
  cell: (info: Info) => {
    const { status } = info.row.original.request;
    return (
      <DataTable.CellContent>
        {status === "approved" ? (
          <Chip size="xs" color="success" label="Approved" />
        ) : (
          <Chip size="xs" color="warning" label="Denied" />
        )}
      </DataTable.CellContent>
    );
  },
  meta: {
    className: "w-28",
  },
};

const resolvedAtColumn: ColumnDef<RowData, string> = {
  id: "resolvedAt" as const,
  header: "Resolved",
  accessorFn: (row) => (row.request.resolvedAt ?? row.createdAt).toString(),
  cell: (info: Info) => {
    const { resolvedAt } = info.row.original.request;
    return (
      <DataTable.CellContent>
        <span className="text-sm text-muted-foreground">
          {resolvedAt ? formatDate(resolvedAt) : "—"}
        </span>
      </DataTable.CellContent>
    );
  },
  meta: {
    className: "w-28",
  },
};

// Logo-only (avatar, no name) to save space — the name is available on hover.
const resolvedByColumn: ColumnDef<RowData, string> = {
  id: "resolvedBy" as const,
  header: "Resolved by",
  enableSorting: false,
  cell: (info: Info) => {
    const { resolvedBy } = info.row.original.request;
    if (!resolvedBy) {
      return (
        <DataTable.CellContent>
          <span className="text-sm text-muted-foreground">—</span>
        </DataTable.CellContent>
      );
    }
    return (
      <DataTable.CellContent>
        <Tooltip
          tooltipTriggerAsChild
          label={resolvedBy.name}
          trigger={
            <Avatar
              visual={resolvedBy.image ?? ANONYMOUS_USER_IMAGE_URL}
              name={resolvedBy.name}
              size="sm"
              isRounded
            />
          }
        />
      </DataTable.CellContent>
    );
  },
  meta: {
    className: "w-16",
  },
};

interface UpgradeRequestsHistoryTableProps {
  requests: MembershipUpgradeRequestType[];
  isLoading: boolean;
  isError: boolean;
  totalRowCount: number;
  pagination: PaginationState;
  setPagination: (pagination: PaginationState) => void;
}

export function UpgradeRequestsHistoryTable({
  requests,
  isLoading,
  isError,
  totalRowCount,
  pagination,
  setPagination,
}: UpgradeRequestsHistoryTableProps) {
  const rows: RowData[] = useMemo(
    () =>
      requests.map((request) => ({
        sId: request.sId,
        name: request.requester.name,
        email: request.requester.email,
        image: request.requester.image,
        createdAt: request.createdAt,
        request,
      })),
    [requests]
  );

  const columns = useMemo(
    () => [
      nameColumn,
      issuedColumn,
      grantedColumn,
      untilColumn,
      reasonColumn,
      statusColumn,
      resolvedAtColumn,
      resolvedByColumn,
    ],
    []
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

  if (isError) {
    return (
      <ContentMessage
        title="Failed to load upgrade request history"
        icon={AlertCircle}
        variant="warning"
      >
        An error occurred while loading the upgrade request history. Please
        refresh the page or contact support if the issue persists.
      </ContentMessage>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex w-full justify-center py-8">
        <span className="text-sm text-muted-foreground">
          No resolved upgrade requests yet.
        </span>
      </div>
    );
  }

  return (
    <DataTable<RowData>
      data={rows}
      columns={columns}
      pagination={pagination}
      setPagination={setPagination}
      totalRowCount={totalRowCount}
    />
  );
}
