import { Chip, DataTable, LoadingBlock, Page } from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import React, { useMemo } from "react";

import { getPriceAsString } from "@app/lib/client/subscription";
import type { CreditDisplayData, CreditType } from "@app/types/credits";
import type { EditedByUser } from "@app/types/user";
import { ANONYMOUS_USER_IMAGE_URL } from "@app/types/user";

type RowData = {
  sId: string;
  type: CreditType;
  initialAmount: string;
  consumedAmount: string;
  remainingAmount: string;
  expirationDate: string;
  isExpired: boolean;
  boughtByUser: EditedByUser | null;
  onClick?: () => void;
};

type Info = CellContext<RowData, string>;

// Sorting priority for credit types: free -> committed -> payg
// Note: excess credits should never be displayed in the UI
const TYPE_SORT_ORDER: Record<CreditType, number> = {
  free: 1,
  committed: 2,
  payg: 3,
  excess: 4,
};

// Display labels for credit types
const TYPE_LABELS: Record<CreditType, string> = {
  free: "Free",
  committed: "Committed",
  payg: "Pay-as-you-go",
  excess: "Excess",
};

// Chip colors for credit types
const TYPE_COLORS: Record<
  CreditType,
  "green" | "blue" | "primary" | "warning"
> = {
  free: "green",
  committed: "blue",
  payg: "primary",
  excess: "warning",
};

function sortCredits(credits: CreditDisplayData[]): CreditDisplayData[] {
  return [...credits].sort((a, b) => {
    // First sort by type priority
    const typeDiff = TYPE_SORT_ORDER[a.type] - TYPE_SORT_ORDER[b.type];
    if (typeDiff !== 0) {
      return typeDiff;
    }

    // Then sort by expiration date (earliest first)
    // Null expiration dates come last
    if (a.expirationDate === null && b.expirationDate === null) {
      return 0;
    }
    if (a.expirationDate === null) {
      return 1;
    }
    if (b.expirationDate === null) {
      return -1;
    }
    return a.expirationDate - b.expirationDate;
  });
}

export function isExpired(credit: CreditDisplayData): boolean {
  const now = Date.now();
  return credit.expirationDate !== null && credit.expirationDate <= now;
}

export function getTableRows(credits: CreditDisplayData[]): RowData[] {
  return credits.map((credit) => ({
    sId: credit.sId,
    type: credit.type,
    initialAmount: getPriceAsString({
      currency: "usd",
      priceInMicroUsd: credit.initialAmountMicroUsd,
    }),
    consumedAmount: getPriceAsString({
      currency: "usd",
      priceInMicroUsd: credit.consumedAmountMicroUsd,
    }),
    remainingAmount: getPriceAsString({
      currency: "usd",
      priceInMicroUsd: credit.remainingAmountMicroUsd,
    }),
    expirationDate:
      credit.expirationDate !== null
        ? new Date(credit.expirationDate).toLocaleDateString(undefined, {
            year: "numeric",
            month: "long",
            day: "numeric",
          })
        : "Never",
    isExpired: isExpired(credit),
    boughtByUser: credit.boughtByUser,
  }));
}

const Cell = (info: Info, children: React.ReactNode) => (
  <DataTable.CellContent
    className={info.row.original.isExpired ? "opacity-40" : ""}
  >
    {children}
  </DataTable.CellContent>
);

export const creditColumns: ColumnDef<RowData, string>[] = [
  {
    id: "type" as const,
    header: "Type",
    cell: (info: Info) =>
      Cell(
        info,
        <Chip
          size="xs"
          color={TYPE_COLORS[info.row.original.type]}
          label={TYPE_LABELS[info.row.original.type]}
        />
      ),
  },
  {
    id: "initialAmount" as const,
    accessorKey: "initialAmount",
    header: "Initial Amount",
    cell: (info: Info) => Cell(info, info.row.original.initialAmount),
  },
  {
    id: "consumedAmount" as const,
    accessorKey: "consumedAmount",
    header: "Consumed",
    cell: (info: Info) => Cell(info, info.row.original.consumedAmount),
  },
  {
    id: "remainingAmount" as const,
    accessorKey: "remainingAmount",
    header: "Remaining",
    cell: (info: Info) => Cell(info, info.row.original.remainingAmount),
  },
  {
    id: "expirationDate" as const,
    accessorKey: "expirationDate",
    header: "Expiration Date",
    meta: {
      className: "text-right",
    },
    cell: (info: Info) => Cell(info, info.row.original.expirationDate),
  },
  {
    id: "by" as const,
    header: "Buyer",
    cell: (info: Info) => {
      const boughtByUser = info.row.original.boughtByUser;
      return (
        <DataTable.CellContent
          className={info.row.original.isExpired ? "opacity-40" : ""}
          avatarUrl={boughtByUser?.imageUrl ?? ANONYMOUS_USER_IMAGE_URL}
          avatarTooltipLabel={boughtByUser?.fullName ?? "System"}
          roundedAvatar
        />
      );
    },
    meta: {
      className: "w-16",
    },
  },
];

interface CreditsListProps {
  credits: CreditDisplayData[];
  isLoading: boolean;
}

export function CreditsList({ credits, isLoading }: CreditsListProps) {
  const displayedRows = useMemo(() => {
    return getTableRows(sortCredits([...credits]));
  }, [credits]);

  if (isLoading) {
    return (
      <div className="flex w-full flex-col space-y-2">
        <LoadingBlock className="h-8 w-full rounded-xl" />
        <LoadingBlock className="h-8 w-full rounded-xl" />
        <LoadingBlock className="h-8 w-full rounded-xl" />
      </div>
    );
  }

  if (credits.length === 0) {
    return (
      <Page.P>
        No credits purchased yet. Purchase credits to get started with
        programmatic API usage.
      </Page.P>
    );
  }

  return <DataTable data={displayedRows} columns={creditColumns} />;
}
