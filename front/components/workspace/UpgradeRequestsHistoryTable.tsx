import { buildMemberNameColumn } from "@app/components/workspace/member_name_column";
import { getSeatIconColorClass } from "@app/components/workspace/seat_styles";
import {
  formatUpgradeRequestDate,
  UPGRADE_REQUEST_REASON_LABEL,
  upgradeRequestGrant,
  upgradeRequestGrantedLabel,
  upgradeRequestStatusLabel,
  upgradeRequestUntilLabel,
} from "@app/lib/api/credits/upgrade_requests_display";
import type { MembershipUpgradeRequestType } from "@app/types/memberships";
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

const issuedColumn: ColumnDef<RowData, string> = {
  id: "issued" as const,
  header: "Requested",
  accessorFn: (row) => row.createdAt.toString(),
  cell: (info: Info) => (
    <DataTable.CellContent>
      <span className="text-sm text-muted-foreground">
        {formatUpgradeRequestDate(info.row.original.createdAt)}
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
    const grant = upgradeRequestGrant(info.row.original.request);
    const label = upgradeRequestGrantedLabel(grant);
    const className =
      grant.kind === "none"
        ? "text-sm text-muted-foreground"
        : grant.kind === "seat_upgrade"
          ? `text-sm font-medium ${getSeatIconColorClass(grant.seatType)}`
          : "text-sm";

    return (
      <DataTable.CellContent>
        <span className={className}>{label}</span>
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
  cell: (info: Info) => (
    <DataTable.CellContent>
      <span className="text-sm text-muted-foreground">
        {upgradeRequestUntilLabel(info.row.original.request)}
      </span>
    </DataTable.CellContent>
  ),
  meta: {
    className: "w-28",
  },
};

function ReasonCell({ reason }: { reason: string | null }) {
  if (!reason) {
    return (
      <span className="text-sm text-muted-foreground">
        {UPGRADE_REQUEST_REASON_LABEL}
      </span>
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
        <Chip
          size="xs"
          color={status === "approved" ? "success" : "warning"}
          label={upgradeRequestStatusLabel(status)}
        />
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
          {resolvedAt ? formatUpgradeRequestDate(resolvedAt) : "—"}
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
