import { formatMicroUsdToUsd } from "@app/components/poke/credits/columns";
import { PokeColumnSortableHeader } from "@app/components/poke/PokeColumnSortableHeader";
import { TYPE_COLORS } from "@app/components/workspace/CreditsList";
import type { CreditDisplayData } from "@app/types/credits";
import { dateToHumanReadable } from "@app/types/shared/utils/date_utils";
import { Chip } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";

export function makeColumnsForMetronomeBalances(): ColumnDef<CreditDisplayData>[] {
  return [
    {
      accessorKey: "sId",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="ID" />
      ),
      cell: ({ row }) => (
        <span className="font-mono text-xs">
          {row.original.sId.slice(0, 8)}
        </span>
      ),
    },
    {
      accessorKey: "type",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Type" />
      ),
      cell: ({ row }) => {
        const { type } = row.original;
        return (
          <Chip color={TYPE_COLORS[type] ?? "highlight"} size="xs">
            {type}
          </Chip>
        );
      },
    },
    {
      accessorKey: "initialAmountMicroUsd",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Initial" />
      ),
      cell: ({ row }) =>
        formatMicroUsdToUsd(row.original.initialAmountMicroUsd),
    },
    {
      accessorKey: "consumedAmountMicroUsd",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Consumed" />
      ),
      cell: ({ row }) =>
        formatMicroUsdToUsd(row.original.consumedAmountMicroUsd),
    },
    {
      accessorKey: "remainingAmountMicroUsd",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Remaining" />
      ),
      cell: ({ row }) => {
        const remaining = row.original.remainingAmountMicroUsd;
        const initial = row.original.initialAmountMicroUsd;
        const percentUsed =
          initial > 0 ? ((initial - remaining) / initial) * 100 : 0;
        const color =
          percentUsed > 90
            ? "text-red-600"
            : percentUsed > 70
              ? "text-warning-500"
              : "text-green-600";
        return <span className={color}>{formatMicroUsdToUsd(remaining)}</span>;
      },
    },
    {
      accessorKey: "startDate",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Start date" />
      ),
      cell: ({ row }) => {
        const { startDate } = row.original;
        if (!startDate) {
          return <span className="text-warning">Not started</span>;
        }
        return (
          <span className="text-sm">
            {dateToHumanReadable(new Date(startDate))}
          </span>
        );
      },
    },
    {
      accessorKey: "expirationDate",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Expiration" />
      ),
      cell: ({ row }) => {
        const { expirationDate } = row.original;
        if (!expirationDate) {
          return <span className="text-warning">No expiration</span>;
        }
        const expDate = new Date(expirationDate);
        const isExpired = expDate < new Date();
        return (
          <span className={`text-sm ${isExpired ? "text-warning" : ""}`}>
            {dateToHumanReadable(expDate)}
            {isExpired && " (Expired)"}
          </span>
        );
      },
    },
  ];
}
