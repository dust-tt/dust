import { formatCredits } from "@app/lib/client/credits";
import { useAwuTopUpsHistory } from "@app/lib/swr/credits";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";
import type { DataTableSkeletonCellProps } from "@dust-tt/sparkle";
import {
  AlertCircle,
  ContentMessage,
  DataTable,
  DataTableSkeleton,
  TextCellSkeleton,
} from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";

interface TopUpsHistoryTableProps {
  owner: LightWorkspaceType;
}

type TopUpRowData = {
  date: string;
  name: string;
  credits: string;
  expiration: string;
  onClick?: () => void;
};

type TopUpColumnId = (typeof COLUMNS)[number]["id"];

function TopUpHistorySkeletonCell({
  columnId,
}: DataTableSkeletonCellProps<TopUpColumnId>) {
  switch (columnId) {
    case "date":
      return <TextCellSkeleton />;
    case "name":
      return <TextCellSkeleton className="w-40" />;
    case "credits":
      return <TextCellSkeleton className="ml-auto w-16" />;
    case "expiration":
      return <TextCellSkeleton className="ml-auto" />;
    default:
      return assertNever(columnId);
  }
}

const COLUMNS = [
  {
    id: "date" as const,
    accessorKey: "date",
    header: "Date",
    enableSorting: false,
    meta: { className: "w-[18%]" },
    cell: ({ row }) => <span className="text-sm">{row.original.date}</span>,
  },
  {
    id: "name" as const,
    accessorKey: "name",
    header: "Top-up",
    enableSorting: false,
    meta: { className: "w-[44%]" },
    cell: ({ row }) => <span className="text-sm">{row.original.name}</span>,
  },
  {
    id: "credits" as const,
    accessorKey: "credits",
    header: "Credits",
    enableSorting: false,
    meta: { headerAlign: "right", className: "w-[18%]" },
    cell: ({ row }) => (
      <span className="block text-right text-sm">{row.original.credits}</span>
    ),
  },
  {
    id: "expiration" as const,
    accessorKey: "expiration",
    header: "Expiration",
    enableSorting: false,
    meta: { headerAlign: "right", className: "w-[20%]" },
    cell: ({ row }) => (
      <span className="block text-right text-sm text-muted-foreground">
        {row.original.expiration}
      </span>
    ),
  },
] satisfies ColumnDef<TopUpRowData, string>[];

export function TopUpsHistoryTable({ owner }: TopUpsHistoryTableProps) {
  const { topUps, isTopUpsHistoryLoading, isTopUpsHistoryError } =
    useAwuTopUpsHistory({ workspaceId: owner.sId });

  const rows: TopUpRowData[] = useMemo(() => {
    const nowMs = Date.now();
    return topUps.map((topUp) => ({
      date: formatTimestampToFriendlyDate(topUp.grantedAtMs, "compactWithDay"),
      name: topUp.name,
      credits: formatCredits(topUp.amountCredits),
      expiration:
        topUp.expiresAtMs <= nowMs
          ? `Expired ${formatTimestampToFriendlyDate(topUp.expiresAtMs, "compactWithDay")}`
          : formatTimestampToFriendlyDate(topUp.expiresAtMs, "compactWithDay"),
    }));
  }, [topUps]);

  if (isTopUpsHistoryError) {
    return (
      <ContentMessage
        title="Failed to load top-ups history"
        icon={AlertCircle}
        variant="warning"
      >
        An error occurred while loading the top-ups history. Please refresh the
        page or contact support if the issue persists.
      </ContentMessage>
    );
  }

  if (isTopUpsHistoryLoading) {
    return (
      <DataTableSkeleton
        columns={COLUMNS}
        SkeletonCell={TopUpHistorySkeletonCell}
      />
    );
  }

  if (rows.length === 0) {
    return (
      <span className="copy-sm text-muted-foreground">
        No top-ups yet: credits you buy, free credits and coupon credits will
        appear here.
      </span>
    );
  }

  return <DataTable data={rows} columns={COLUMNS} hideRowDivider={false} />;
}
