import { Chip, IconButton } from "@dust-tt/sparkle";
import { ArrowsUpDownIcon } from "@heroicons/react/20/solid";
import type { ColumnDef } from "@tanstack/react-table";

import type { PokeCreditType } from "@app/pages/api/poke/workspaces/[wId]/credits";
import { dateToHumanReadable } from "@app/types";
import type { CreditType } from "@app/types/credits";

function formatMicroUsdToUsd(microUsdAmount: number): string {
  return `$${(microUsdAmount / 10_000).toFixed(2)}`;
}

export function makeColumnsForCredits(): ColumnDef<PokeCreditType>[] {
  return [
    {
      accessorKey: "id",
      header: "ID",
    },
    {
      accessorKey: "type",
      header: ({ column }) => {
        return (
          <div className="flex items-center space-x-2">
            <p>Type</p>
            <IconButton
              variant="outline"
              icon={ArrowsUpDownIcon}
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
            />
          </div>
        );
      },
      cell: ({ row }) => {
        const { type } = row.original;
        const colorMap: Record<CreditType, "blue" | "primary" | "green"> = {
          free: "blue",
          payg: "primary",
          committed: "green",
        };
        return (
          <Chip color={colorMap[type] ?? "highlight"} size="xs">
            {type}
          </Chip>
        );
      },
    },
    {
      accessorKey: "initialAmountMicroUsd",
      header: ({ column }) => {
        return (
          <div className="flex items-center space-x-2">
            <p>Initial</p>
            <IconButton
              variant="outline"
              icon={ArrowsUpDownIcon}
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
            />
          </div>
        );
      },
      cell: ({ row }) =>
        formatMicroUsdToUsd(row.original.initialAmountMicroUsd),
    },
    {
      accessorKey: "consumedAmountMicroUsd",
      header: ({ column }) => {
        return (
          <div className="flex items-center space-x-2">
            <p>Consumed</p>
            <IconButton
              variant="outline"
              icon={ArrowsUpDownIcon}
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
            />
          </div>
        );
      },
      cell: ({ row }) =>
        formatMicroUsdToUsd(row.original.consumedAmountMicroUsd),
    },
    {
      accessorKey: "remainingAmountCents",
      header: ({ column }) => {
        return (
          <div className="flex items-center space-x-2">
            <p>Remaining</p>
            <IconButton
              variant="outline"
              icon={ArrowsUpDownIcon}
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
            />
          </div>
        );
      },
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
      header: ({ column }) => {
        return (
          <div className="flex items-center space-x-2">
            <p>Start Date</p>
            <IconButton
              variant="outline"
              icon={ArrowsUpDownIcon}
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
            />
          </div>
        );
      },
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
      header: ({ column }) => {
        return (
          <div className="flex items-center space-x-2">
            <p>Expiration</p>
            <IconButton
              variant="outline"
              icon={ArrowsUpDownIcon}
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
            />
          </div>
        );
      },
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
      accessorKey: "discount",
      header: "Billed Discount",
      cell: ({ row }) => {
        const { discount } = row.original;
        if (discount === null) {
          return <span className="text-gray-400">—</span>;
        }
        return <span>{discount}%</span>;
      },
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => {
        return (
          <div className="flex items-center space-x-2">
            <p>Created</p>
            <IconButton
              variant="outline"
              icon={ArrowsUpDownIcon}
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
            />
          </div>
        );
      },
      cell: ({ row }) => {
        return (
          <span className="text-sm">
            {dateToHumanReadable(new Date(row.original.createdAt))}
          </span>
        );
      },
    },
  ];
}
