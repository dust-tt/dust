import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { formatCredits } from "@app/lib/client/credits";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import { usePokeTopUpsHistory } from "@app/poke/swr/credits";
import type { WorkspaceType } from "@app/types/user";
import { AlertCircle, ContentMessage } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";

interface PokeTopUpsHistoryTableProps {
  owner: WorkspaceType;
}

type TopUpRowData = {
  date: string;
  name: string;
  credits: string;
  expiration: string;
};

const COLUMNS: ColumnDef<TopUpRowData>[] = [
  {
    accessorKey: "date",
    header: "Date",
    enableSorting: false,
  },
  {
    accessorKey: "name",
    header: "Top-up",
    enableSorting: false,
  },
  {
    accessorKey: "credits",
    header: "Credits",
    enableSorting: false,
  },
  {
    accessorKey: "expiration",
    header: "Expiration",
    enableSorting: false,
  },
];

export function PokeTopUpsHistoryTable({ owner }: PokeTopUpsHistoryTableProps) {
  const { topUps, isTopUpsHistoryLoading, isTopUpsHistoryError } =
    usePokeTopUpsHistory({ owner });

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
        Could not load the top-ups history for this workspace.
      </ContentMessage>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
      <span className="text-sm font-medium text-foreground">
        Top-ups history
      </span>
      <PokeDataTable
        columns={COLUMNS}
        data={rows}
        isLoading={isTopUpsHistoryLoading}
      />
    </div>
  );
}
