import { buildMemberNameColumn } from "@app/components/workspace/member_name_column";
import { timeAgoFrom } from "@app/lib/utils";
import type { MembershipUpgradeRequestType } from "@app/types/memberships";
import { Chip, DataTable, LoadingBlock } from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
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

const nameColumn = buildMemberNameColumn<RowData>();

const REASON_LABEL = "Reached credit limit";

function formatDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

const statusColumn: ColumnDef<RowData, string> = {
  id: "status" as const,
  header: "",
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

const reasonColumn: ColumnDef<RowData, string> = {
  id: "reason" as const,
  header: "",
  enableSorting: false,
  cell: (info: Info) => {
    const { reason } = info.row.original.request;
    return (
      <DataTable.CellContent>
        <span
          className="line-clamp-2 text-sm text-muted-foreground"
          title={reason ?? undefined}
        >
          {reason || REASON_LABEL}
        </span>
      </DataTable.CellContent>
    );
  },
  meta: {
    className: "max-w-64",
  },
};

// The pool-cap override this request actually resulted in, if any (only set
// when approved through the linked "Edit limit" flow — see
// `MembershipUpgradeRequestResource.recordGrant`). A denied request, or one
// approved through a different flow (e.g. a seat upgrade), has no grant to
// show.
const grantedColumn: ColumnDef<RowData, string> = {
  id: "granted" as const,
  header: "",
  enableSorting: false,
  cell: (info: Info) => {
    const { grantedAwuCredits, grantedExpiresAt, expiredAt } =
      info.row.original.request;
    if (grantedAwuCredits === null) {
      return (
        <DataTable.CellContent>
          <span className="text-sm text-muted-foreground">—</span>
        </DataTable.CellContent>
      );
    }

    const isExpired = expiredAt !== null;
    const expiryLabel = grantedExpiresAt
      ? `${isExpired ? "Expired" : "Expires"} ${formatDate(isExpired ? expiredAt : grantedExpiresAt)}`
      : isExpired
        ? `Superseded ${formatDate(expiredAt)}`
        : "No expiry";

    return (
      <DataTable.CellContent className={isExpired ? "opacity-50" : undefined}>
        <div className="flex flex-col">
          <span className="text-sm">
            {grantedAwuCredits.toLocaleString("en-US")} credits
          </span>
          <span className="text-xs text-muted-foreground">{expiryLabel}</span>
        </div>
      </DataTable.CellContent>
    );
  },
  meta: {
    className: "w-40",
  },
};

const resolvedColumn: ColumnDef<RowData, string> = {
  id: "resolved" as const,
  header: "",
  accessorFn: (row) => (row.request.resolvedAt ?? row.createdAt).toString(),
  cell: (info: Info) => {
    const { resolvedAt, resolvedBy } = info.row.original.request;
    return (
      <DataTable.CellContent>
        <span className="text-sm text-muted-foreground">
          {resolvedAt
            ? `${timeAgoFrom(resolvedAt, { useLongFormat: true })} ago`
            : "—"}
          {resolvedBy ? ` by ${resolvedBy.name}` : ""}
        </span>
      </DataTable.CellContent>
    );
  },
  meta: {
    className: "w-48",
  },
};

interface UpgradeRequestsHistoryTableProps {
  requests: MembershipUpgradeRequestType[];
  isLoading: boolean;
}

export function UpgradeRequestsHistoryTable({
  requests,
  isLoading,
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
      statusColumn,
      reasonColumn,
      grantedColumn,
      resolvedColumn,
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

  if (rows.length === 0) {
    return (
      <div className="flex w-full justify-center py-8">
        <span className="text-sm text-muted-foreground">
          No resolved upgrade requests yet.
        </span>
      </div>
    );
  }

  return <DataTable<RowData> data={rows} columns={columns} />;
}
