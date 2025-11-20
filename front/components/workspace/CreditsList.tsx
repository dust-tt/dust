import { Button, Chip, DataTable, LoadingBlock, Page } from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import React, { useMemo, useState } from "react";

import { getPriceAsString } from "@app/lib/client/subscription";
import type { CreditDisplayData, CreditType } from "@app/types/credits";

type RowData = {
  id: number;
  type: CreditType;
  initialAmount: string;
  consumedAmount: string;
  remainingAmount: string;
  expirationDate: string;
  isExpired: boolean;
  onClick?: () => void;
};

type Info = CellContext<RowData, string>;

// Sorting priority for credit types: free -> committed -> payg
const TYPE_SORT_ORDER: Record<CreditType, number> = {
  free: 1,
  committed: 2,
  payg: 3,
};

// Display labels for credit types
const TYPE_LABELS: Record<CreditType, string> = {
  free: "Free",
  committed: "Committed",
  payg: "Pay-as-you-go",
};

// Chip colors for credit types
const TYPE_COLORS: Record<CreditType, "green" | "blue" | "primary"> = {
  free: "green",
  committed: "blue",
  payg: "primary",
};

function sortCredits(credits: CreditDisplayData[]): CreditDisplayData[] {
  return credits.sort((a, b) => {
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

function isExpired(credit: CreditDisplayData): boolean {
  const now = Date.now();
  return (
    (credit.expirationDate !== null && credit.expirationDate <= now) ||
    credit.remainingAmount === 0
  );
}

function getTableRows(credits: CreditDisplayData[]): RowData[] {
  return credits.map((credit) => ({
    id: credit.id,
    type: credit.type,
    initialAmount: getPriceAsString({
      currency: "usd",
      priceInCents: credit.initialAmount,
    }),
    consumedAmount: getPriceAsString({
      currency: "usd",
      priceInCents: credit.consumedAmount,
    }),
    remainingAmount: getPriceAsString({
      currency: "usd",
      priceInCents: credit.remainingAmount,
    }),
    expirationDate:
      credit.expirationDate !== null
        ? new Date(credit.expirationDate).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })
        : "Never",
    isExpired: isExpired(credit),
  }));
}

const creditColumns: ColumnDef<RowData, string>[] = [
  {
    id: "type" as const,
    header: "Type",
    meta: {
      className: "s-w-32",
    },
    cell: (info: Info) => (
      <DataTable.CellContent>
        <Chip
          size="xs"
          color={TYPE_COLORS[info.row.original.type]}
          label={TYPE_LABELS[info.row.original.type]}
        />
      </DataTable.CellContent>
    ),
  },
  {
    id: "initialAmount" as const,
    accessorKey: "initialAmount",
    header: "Initial Amount",
    meta: {
      className: "s-w-32",
    },
    cell: (info: Info) => (
      <DataTable.CellContent>
        {info.row.original.initialAmount}
      </DataTable.CellContent>
    ),
  },
  {
    id: "consumedAmount" as const,
    accessorKey: "consumedAmount",
    header: "Consumed",
    meta: {
      className: "s-w-32",
    },
    cell: (info: Info) => (
      <DataTable.CellContent>
        {info.row.original.consumedAmount}
      </DataTable.CellContent>
    ),
  },
  {
    id: "remainingAmount" as const,
    accessorKey: "remainingAmount",
    header: "Remaining",
    meta: {
      className: "s-w-32",
    },
    cell: (info: Info) => (
      <DataTable.CellContent>
        {info.row.original.remainingAmount}
      </DataTable.CellContent>
    ),
  },
  {
    id: "expirationDate" as const,
    accessorKey: "expirationDate",
    header: "Expiration Date",
    meta: {
      className: "s-w-40",
    },
    cell: (info: Info) => (
      <DataTable.CellContent>
        {info.row.original.expirationDate}
      </DataTable.CellContent>
    ),
  },
];

interface CreditsListProps {
  credits: CreditDisplayData[];
  isLoading: boolean;
}

export function CreditsList({ credits, isLoading }: CreditsListProps) {
  const [showExpired, setShowExpired] = useState(false);

  const { activeCredits, expiredCredits } = useMemo(() => {
    const sorted = sortCredits([...credits]);
    return {
      activeCredits: sorted.filter((c) => !isExpired(c)),
      expiredCredits: sorted.filter((c) => isExpired(c)),
    };
  }, [credits]);

  const activeRows = useMemo(
    () => getTableRows(activeCredits),
    [activeCredits]
  );
  const expiredRows = useMemo(
    () => getTableRows(expiredCredits),
    [expiredCredits]
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

  if (credits.length === 0) {
    return (
      <Page.P>
        No credits purchased yet. Purchase credits to get started with
        programmatic API usage.
      </Page.P>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {activeCredits.length > 0 ? (
        <DataTable data={activeRows} columns={creditColumns} />
      ) : (
        <Page.P>No active credits available.</Page.P>
      )}

      {expiredCredits.length > 0 && (
        <div className="flex flex-col gap-2">
          <Button
            label={
              showExpired ? "Hide expired credits" : "Show expired credits"
            }
            variant="secondary"
            size="sm"
            onClick={() => setShowExpired(!showExpired)}
          />
          {showExpired && (
            <DataTable data={expiredRows} columns={creditColumns} />
          )}
        </div>
      )}
    </div>
  );
}
