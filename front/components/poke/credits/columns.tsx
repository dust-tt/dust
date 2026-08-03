import { PokeColumnSortableHeader } from "@app/components/poke/PokeColumnSortableHeader";
import { TYPE_COLORS } from "@app/components/workspace/CreditsList";
import type { PokeCreditType } from "@app/types/api/poke/credits";
import { dateToHumanReadable } from "@app/types/shared/utils/date_utils";
import { Chip } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";

export function formatMicroUsdToUsd(microUsdAmount: number): string {
  return `$${(microUsdAmount / 1_000_000).toFixed(2)}`;
}

export function makeColumnsForCredits(): ColumnDef<PokeCreditType>[] {
  return [
    {
      id: "id",
      accessorFn: (row) => row.id,
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="ID" />
      ),
    },
    {
      id: "type",
      accessorFn: (row) => row.type,
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
      id: "initial",
      header: "Initial",
      cell: ({ row }) => (
        <span>{formatMicroUsdToUsd(row.original.initialAmountMicroUsd)}</span>
      ),
    },
    {
      id: "consumed",
      header: "Consumed",
      cell: ({ row }) => (
        <span>{formatMicroUsdToUsd(row.original.consumedAmountMicroUsd)}</span>
      ),
    },
    {
      id: "remaining",
      header: "Remaining",
      cell: ({ row }) => (
        <span>{formatMicroUsdToUsd(row.original.remainingAmountMicroUsd)}</span>
      ),
    },
    {
      id: "startDate",
      accessorFn: (row) =>
        row.startDate ? new Date(row.startDate).getTime() : 0,
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
      id: "expirationDate",
      accessorFn: (row) =>
        row.expirationDate ? new Date(row.expirationDate).getTime() : 0,
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
    {
      id: "discount",
      accessorFn: (row) => row.discount ?? -1,
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Billed discount" />
      ),
      cell: ({ row }) => {
        const { discount } = row.original;
        if (discount === null) {
          return <span className="text-gray-400">—</span>;
        }
        return <span>{discount}%</span>;
      },
    },
    {
      id: "createdAt",
      accessorFn: (row) => new Date(row.createdAt).getTime(),
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Created" />
      ),
      cell: ({ row }) => (
        <span className="text-sm">
          {dateToHumanReadable(new Date(row.original.createdAt))}
        </span>
      ),
    },
  ];
}
