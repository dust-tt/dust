import { formatCredits } from "@app/lib/client/credits";
import { useAwuTopUpsHistory } from "@app/lib/swr/credits";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { LightWorkspaceType } from "@app/types/user";
import {
  AlertCircle,
  ContentMessage,
  DataTable,
  Spinner,
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

const COLUMNS: ColumnDef<TopUpRowData, string>[] = [
  {
    accessorKey: "date",
    header: "Date",
    enableSorting: false,
    meta: { className: "w-[18%]" },
    cell: ({ row }) => <span className="text-sm">{row.original.date}</span>,
  },
  {
    accessorKey: "name",
    header: "Top-up",
    enableSorting: false,
    meta: { className: "w-[44%]" },
    cell: ({ row }) => <span className="text-sm">{row.original.name}</span>,
  },
  {
    accessorKey: "credits",
    header: "Credits",
    enableSorting: false,
    meta: { headerAlign: "right", className: "w-[18%]" },
    cell: ({ row }) => (
      <span className="block text-right text-sm">{row.original.credits}</span>
    ),
  },
  {
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
];

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
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
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
