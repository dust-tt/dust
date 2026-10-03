import { formatCredits } from "@app/lib/client/credits";
import { formatTimestampToFriendlyDate } from "@app/lib/client/friendly_date";
import { useAwuTopUpsHistory } from "@app/lib/swr/credits";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";
import type { DataTableSkeletonCellProps } from "@dust-tt/sparkle";
import {
  AlertCircle,
  ContentMessage,
  DataTable,
  DataTableSkeleton,
  TextCellSkeleton,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";

interface TopUpsHistoryTableProps {
  owner: LightWorkspaceType;
}

type TopUpRowData = {
  date: string;
  name: string;
  credits: string;
  expiration: string;
  onClick?: () => void;
};

type TopUpColumnId = "date" | "name" | "credits" | "expiration";

function TopUpHistorySkeletonCell({
  columnId,
}: DataTableSkeletonCellProps<TopUpColumnId>) {
  switch (columnId) {
    case "date":
      return <TextCellSkeleton />;
    case "name":
      return <TextCellSkeleton className="w-40" />;
    case "credits":
      return <TextCellSkeleton className="ml-auto w-16" />;
    case "expiration":
      return <TextCellSkeleton className="ml-auto" />;
    default:
      assertNeverAndIgnore(columnId);
      return null;
  }
}

export function TopUpsHistoryTable({ owner }: TopUpsHistoryTableProps) {
  const { t } = useLingui();
  const columns = useMemo(
    () =>
      [
        {
          id: "date" as const,
          accessorKey: "date",
          header: t`Date`,
          enableSorting: false,
          meta: { className: "w-[18%]" },
          cell: ({ row }) => (
            <span className="text-sm">{row.original.date}</span>
          ),
        },
        {
          id: "name" as const,
          accessorKey: "name",
          header: t`Top-up`,
          enableSorting: false,
          meta: { className: "w-[44%]" },
          cell: ({ row }) => (
            <span className="text-sm">{row.original.name}</span>
          ),
        },
        {
          id: "credits" as const,
          accessorKey: "credits",
          header: t`Credits`,
          enableSorting: false,
          meta: { headerAlign: "right", className: "w-[18%]" },
          cell: ({ row }) => (
            <span className="block text-right text-sm">
              {row.original.credits}
            </span>
          ),
        },
        {
          id: "expiration" as const,
          accessorKey: "expiration",
          header: t`Expiration`,
          enableSorting: false,
          meta: { headerAlign: "right", className: "w-[20%]" },
          cell: ({ row }) => (
            <span className="block text-right text-sm text-muted-foreground">
              {row.original.expiration}
            </span>
          ),
        },
      ] satisfies ColumnDef<TopUpRowData, string>[],
    [t]
  );

  const { topUps, isTopUpsHistoryLoading, isTopUpsHistoryError } =
    useAwuTopUpsHistory({ workspaceId: owner.sId });

  const rows: TopUpRowData[] = useMemo(() => {
    const nowMs = Date.now();
    return topUps.map((topUp) => {
      const expirationDate = formatTimestampToFriendlyDate(
        topUp.expiresAtMs,
        "compactWithDay"
      );
      return {
        date: formatTimestampToFriendlyDate(
          topUp.grantedAtMs,
          "compactWithDay"
        ),
        name: topUp.name,
        credits: formatCredits(topUp.amountCredits),
        expiration:
          topUp.expiresAtMs <= nowMs
            ? t`Expired ${expirationDate}`
            : expirationDate,
      };
    });
  }, [topUps, t]);

  if (isTopUpsHistoryError) {
    return (
      <ContentMessage
        title={t`Failed to load top-ups history`}
        icon={AlertCircle}
        variant="warning"
      >
        <Trans>
          An error occurred while loading the top-ups history. Please refresh
          the page or contact support if the issue persists.
        </Trans>
      </ContentMessage>
    );
  }

  if (isTopUpsHistoryLoading) {
    return (
      <DataTableSkeleton
        columns={columns}
        SkeletonCell={TopUpHistorySkeletonCell}
      />
    );
  }

  if (rows.length === 0) {
    return (
      <span className="copy-sm text-muted-foreground">
        <Trans>
          No top-ups yet: credits you buy, free credits and coupon credits will
          appear here.
        </Trans>
      </span>
    );
  }

  return <DataTable data={rows} columns={columns} hideRowDivider={false} />;
}
