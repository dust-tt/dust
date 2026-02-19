import { PokeColumnSortableHeader } from "@app/components/poke/PokeColumnSortableHeader";
import type { ColumnDef, Row } from "@tanstack/react-table";

export type SubscriptionsDisplayType = {
  id: string;
  name: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  startDateValue: number | null; // timestamp for sorting
  endDateValue: number | null; // timestamp for sorting
};

const sortDate = (
  rowA: Row<SubscriptionsDisplayType>,
  rowB: Row<SubscriptionsDisplayType>
) => {
  const a = rowA.original.startDateValue;
  const b = rowB.original.startDateValue;
  if (a === null && b === null) {
    return 0;
  }
  if (a === null) {
    return 1;
  }
  if (b === null) {
    return -1;
  }
  return a - b;
};

export function makeColumnsForSubscriptions(): ColumnDef<SubscriptionsDisplayType>[] {
  return [
    {
      accessorKey: "id",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="ID" />
      ),
    },
    {
      accessorKey: "name",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Plan code" />
      ),
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Status" />
      ),
    },
    {
      accessorKey: "stripeSubscriptionId",
      cell: ({ row }) => {
        const sId: string = row.getValue("stripeSubscriptionId");

        return (
          <a
            className="font-bold hover:underline"
            target="_blank"
            href={`https://dashboard.stripe.com/subscriptions/${sId}`}
          >
            {sId}
          </a>
        );
      },
      header: "stripeSubscriptionId",
    },
    {
      accessorKey: "startDate",
      sortingFn: sortDate,
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Start date" />
      ),
    },
    {
      accessorKey: "endDate",
      sortingFn: sortDate,
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="End date" />
      ),
    },
  ];
}
