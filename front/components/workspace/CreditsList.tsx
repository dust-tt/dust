import { getPriceAsString } from "@app/lib/client/subscription";
import { formatDate } from "@app/lib/i18n/format";
import type { CreditDisplayData, CreditType } from "@app/types/credits";
import { CREDIT_TYPE_SORT_ORDER } from "@app/types/credits";
import type { EditedByUser } from "@app/types/user";
import { Avatar, Chip, DataTable, LoadingBlock, Page } from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import type React from "react";
import { useMemo } from "react";

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

type Translate = (descriptor: MessageDescriptor) => string;

// Display labels for credit types
const TYPE_LABELS: Record<CreditType, MessageDescriptor> = {
  free: msg`Free`,
  committed: msg({ message: "Committed", context: "credit type" }),
  payg: msg`Pay-as-you-go`,
  excess: msg`Excess`,
};

// Chip colors for credit types
export const TYPE_COLORS: Record<
  CreditType,
  "success" | "highlight" | "primary" | "warning"
> = {
  free: "success",
  committed: "highlight",
  payg: "primary",
  excess: "warning",
};

function sortCredits(credits: CreditDisplayData[]): CreditDisplayData[] {
  return [...credits].sort((a, b) => {
    // First sort by type priority
    const typeDiff =
      CREDIT_TYPE_SORT_ORDER[a.type] - CREDIT_TYPE_SORT_ORDER[b.type];
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

export function getTableRows(
  credits: CreditDisplayData[],
  t: Translate
): RowData[] {
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
        ? formatDate(credit.expirationDate, {
            year: "numeric",
            month: "long",
            day: "numeric",
          })
        : t(msg`Never`),
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

export function getCreditColumns(t: Translate): ColumnDef<RowData, string>[] {
  return [
    {
      id: "type" as const,
      header: t(msg`Type`),
      cell: (info: Info) =>
        Cell(
          info,
          <Chip
            size="xs"
            color={TYPE_COLORS[info.row.original.type]}
            label={t(TYPE_LABELS[info.row.original.type])}
          />
        ),
    },
    {
      id: "initialAmount" as const,
      accessorKey: "initialAmount",
      header: t(msg`Initial Amount`),
      cell: (info: Info) => Cell(info, info.row.original.initialAmount),
    },
    {
      id: "consumedAmount" as const,
      accessorKey: "consumedAmount",
      header: t(msg`Consumed`),
      cell: (info: Info) => Cell(info, info.row.original.consumedAmount),
    },
    {
      id: "remainingAmount" as const,
      accessorKey: "remainingAmount",
      header: t(msg`Remaining`),
      cell: (info: Info) => Cell(info, info.row.original.remainingAmount),
    },
    {
      id: "expirationDate" as const,
      accessorKey: "expirationDate",
      header: t(msg`Expiration Date`),
      meta: {
        className: "text-right",
      },
      cell: (info: Info) => Cell(info, info.row.original.expirationDate),
    },
    {
      id: "by" as const,
      header: t(msg`Buyer`),
      cell: (info: Info) => {
        const boughtByUser = info.row.original.boughtByUser;
        return (
          <DataTable.CellContent
            className={info.row.original.isExpired ? "opacity-40" : ""}
            icon={() => (
              <Avatar
                name={boughtByUser?.fullName ?? t(msg`System`)}
                visual={boughtByUser?.imageUrl ?? undefined}
                className="mr-2"
                size="xs"
                isRounded
              />
            )}
          />
        );
      },
      meta: {
        className: "w-16",
      },
    },
  ];
}

interface CreditsListProps {
  credits: CreditDisplayData[];
  isLoading: boolean;
}

export function CreditsList({ credits, isLoading }: CreditsListProps) {
  const { t } = useLingui();
  const displayedRows = useMemo(() => {
    return getTableRows(sortCredits([...credits]), t);
  }, [credits, t]);
  const columns = useMemo(() => getCreditColumns(t), [t]);

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
        <Trans>
          No credits purchased yet. Purchase credits to get started with
          programmatic API usage.
        </Trans>
      </Page.P>
    );
  }

  return <DataTable data={displayedRows} columns={columns} />;
}
