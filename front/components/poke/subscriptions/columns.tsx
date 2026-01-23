import { IconButton } from "@dust-tt/sparkle";
import { ArrowsUpDownIcon } from "@heroicons/react/20/solid";
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
      header: ({ column }) => {
        return (
          <div className="flex space-x-2">
            <p>Id</p>
            <IconButton
              variant="ghost"
              icon={ArrowsUpDownIcon}
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
            />
          </div>
        );
      },
    },
    {
      accessorKey: "name",
      header: ({ column }) => {
        return (
          <div className="flex space-x-2">
            <p>Plan Code</p>
            <IconButton
              variant="ghost"
              icon={ArrowsUpDownIcon}
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
            />
          </div>
        );
      },
    },
    {
      accessorKey: "status",
      header: ({ column }) => {
        return (
          <div className="flex space-x-2">
            <p>Status</p>
            <IconButton
              variant="ghost"
              icon={ArrowsUpDownIcon}
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
            />
          </div>
        );
      },
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
      header: ({ column }) => {
        return (
          <div className="flex space-x-2">
            <p>Start Date</p>
            <IconButton
              variant="ghost"
              icon={ArrowsUpDownIcon}
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
            />
          </div>
        );
      },
    },
    {
      accessorKey: "endDate",
      sortingFn: sortDate,
      header: ({ column }) => {
        return (
          <div className="flex space-x-2">
            <p>End Date</p>
            <IconButton
              variant="ghost"
              icon={ArrowsUpDownIcon}
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
            />
          </div>
        );
      },
    },
  ];
}
