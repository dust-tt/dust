import {
  Chip,
  DataTable,
  Hoverable,
  LoadingBlock,
  Page,
} from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import React, { useMemo, useState } from "react";

import { getPriceAsString } from "@app/lib/client/subscription";
import type { CreditDisplayData, CreditType } from "@app/types/credits";

type RowData = {
  sId: string;
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
  free: "Included",
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
  return credit.expirationDate !== null && credit.expirationDate <= now;
}

function getTableRows(credits: CreditDisplayData[]): RowData[] {
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
  }));
}

const Cell = (info: Info, children: React.ReactNode) => (
  <DataTable.CellContent
    className={info.row.original.isExpired ? "opacity-40" : ""}
  >
    {children}
  </DataTable.CellContent>
);

const creditColumns: ColumnDef<RowData, string>[] = [
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

  const displayedRows = useMemo(() => {
    const active = getTableRows(activeCredits);
    if (showExpired) {
      const expired = getTableRows(expiredCredits);
      return [...active, ...expired];
    }
    return active;
  }, [activeCredits, expiredCredits, showExpired]);

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
    <>
      <DataTable data={displayedRows} columns={creditColumns} />
      {expiredCredits.length > 0 && (
        <div className="flex w-full justify-end pt-2">
          <Hoverable
            className="cursor-pointer text-sm text-gray-400 hover:text-gray-500 hover:underline"
            onClick={() => setShowExpired(!showExpired)}
          >
            {showExpired ? "Hide expired" : "Show expired"}
          </Hoverable>
        </div>
      )}
    </>
  );
}
