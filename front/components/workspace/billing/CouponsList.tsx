import { formatCredits } from "@app/lib/client/credits";
import { formatTimestampToFriendlyDate } from "@app/lib/client/friendly_date";
import { formatCurrencyAmountCents } from "@app/lib/metronome/amounts";
import { useWorkspaceCoupons } from "@app/lib/swr/workspaces";
import type {
  CreditPoolTopUpCouponData,
  SeatCouponData,
} from "@app/types/api/coupons";
import type { SupportedCurrency } from "@app/types/currency";
import {
  ChevronDown,
  ChevronRight,
  Chip,
  cn,
  DataTable,
  Spinner,
} from "@dust-tt/sparkle";
import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { useSubscriptionContext } from "./SubscriptionContext";

interface CouponRow {
  name: string;
  redeemedOn: string;
  amount: string;
  remaining: string;
  isRevoked?: boolean;
  isBold?: boolean;
  isGroup?: boolean;
  isExpanded?: boolean;
  isChild?: boolean;
  onClick?: () => void;
  menuItems?: never[];
}

function nameColumn(
  header: string,
  revokedLabel: string
): ColumnDef<CouponRow> {
  return {
    accessorKey: "name",
    header,
    enableSorting: false,
    meta: { className: "w-1/2" },
    cell: ({ row }) => {
      const { name, isRevoked, isGroup, isExpanded, isChild, isBold } =
        row.original;
      return (
        <div
          className={cn(
            "flex items-center gap-3",
            isGroup && "cursor-pointer",
            isChild && "pl-5"
          )}
        >
          <span
            className={cn(
              "text-sm",
              isChild && "text-muted-foreground",
              isBold && "font-semibold"
            )}
          >
            {name}
          </span>
          {isRevoked ? (
            <Chip label={revokedLabel} size="mini" color="warning" />
          ) : null}
          {isGroup ? (
            isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )
          ) : null}
        </div>
      );
    },
  };
}

function redeemedOnColumn(header: string): ColumnDef<CouponRow> {
  return {
    accessorKey: "redeemedOn",
    header,
    enableSorting: false,
    meta: { className: "w-[18%]" },
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">
        {row.original.redeemedOn}
      </span>
    ),
  };
}

function amountColumn(header: string): ColumnDef<CouponRow> {
  return {
    accessorKey: "amount",
    header,
    enableSorting: false,
    meta: { headerAlign: "right", className: "w-[16%]" },
    cell: ({ row }) => (
      <span
        className={cn(
          "block text-right text-sm",
          row.original.isChild && "text-muted-foreground"
        )}
      >
        {row.original.amount}
      </span>
    ),
  };
}

function remainingColumn(header: string): ColumnDef<CouponRow> {
  return {
    accessorKey: "remaining",
    header,
    enableSorting: false,
    meta: { headerAlign: "right", className: "w-[16%]" },
    cell: ({ row }) => (
      <span
        className={cn(
          "block text-right text-sm",
          !row.original.isChild && "font-semibold"
        )}
      >
        {row.original.remaining}
      </span>
    ),
  };
}

function formatRedeemedOn(redeemedAtMs: number): string {
  return formatTimestampToFriendlyDate(redeemedAtMs, "compactWithDay");
}

function buildSeatRows(
  coupons: SeatCouponData[],
  expandedCoupons: Set<string>,
  toggleCoupon: (redemptionId: string) => void,
  totalLabel: string
): CouponRow[] {
  const rows: CouponRow[] = [];
  for (const coupon of coupons) {
    const base = {
      name: coupon.code,
      redeemedOn: formatRedeemedOn(coupon.redeemedAtMs),
      isRevoked: coupon.status === "revoked",
      amount: formatCurrencyAmountCents({
        amountCents: coupon.totalAmountCents,
        currency: coupon.currency,
      }),
      remaining: formatCurrencyAmountCents({
        amountCents: coupon.remainingAmountCents,
        currency: coupon.currency,
      }),
    };

    if (coupon.consumptions.length === 0) {
      rows.push(base);
      continue;
    }

    const isExpanded = expandedCoupons.has(coupon.redemptionId);
    rows.push({
      ...base,
      isGroup: true,
      isExpanded,
      onClick: () => toggleCoupon(coupon.redemptionId),
    });
    if (isExpanded) {
      for (const consumption of coupon.consumptions) {
        rows.push({
          name: formatTimestampToFriendlyDate(
            consumption.timestampMs,
            "compactWithDay"
          ),
          redeemedOn: "",
          amount: `-${formatCurrencyAmountCents({
            amountCents: consumption.amountCents,
            currency: coupon.currency,
          })}`,
          remaining: "",
          isChild: true,
        });
      }
    }
  }

  // Total of the remaining money across seat coupons. Grouped by currency —
  // in practice a workspace's coupons are all in its billing currency, so
  // this renders a single line.
  const remainingByCurrency = new Map<SupportedCurrency, number>();
  for (const coupon of coupons) {
    remainingByCurrency.set(
      coupon.currency,
      (remainingByCurrency.get(coupon.currency) ?? 0) +
        coupon.remainingAmountCents
    );
  }
  for (const [currency, remainingCents] of remainingByCurrency) {
    rows.push({
      name: totalLabel,
      redeemedOn: "",
      amount: "",
      remaining: formatCurrencyAmountCents({
        amountCents: remainingCents,
        currency,
      }),
      isBold: true,
    });
  }

  return rows;
}

function buildTopUpRows(
  coupons: CreditPoolTopUpCouponData[],
  formatCreditsAmount: (amountCredits: number) => string
): CouponRow[] {
  return coupons.map((coupon) => ({
    name: coupon.code,
    redeemedOn: formatRedeemedOn(coupon.redeemedAtMs),
    amount: formatCreditsAmount(coupon.amountCredits),
    remaining: "",
    isRevoked: coupon.status === "revoked",
  }));
}

export function CouponsList() {
  const { t } = useLingui();
  const { owner } = useSubscriptionContext();
  const [expandedCoupons, setExpandedCoupons] = useState<Set<string>>(
    new Set()
  );

  const { coupons, isCouponsLoading } = useWorkspaceCoupons({
    workspaceId: owner.sId,
  });

  const seatColumns = useMemo<ColumnDef<CouponRow>[]>(
    () => [
      nameColumn(t`Coupon`, t`Revoked`),
      redeemedOnColumn(t`Redeemed on`),
      amountColumn(t`Credits`),
      remainingColumn(t`Remaining`),
    ],
    [t]
  );

  const topUpColumns = useMemo<ColumnDef<CouponRow>[]>(
    () => [
      nameColumn(t`Coupon`, t`Revoked`),
      redeemedOnColumn(t`Redeemed on`),
      amountColumn(t`Credits`),
    ],
    [t]
  );

  if (isCouponsLoading) {
    return (
      <div className="w-full p-6">
        <Spinner />
      </div>
    );
  }

  if (coupons.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        <Trans>No coupons have been redeemed on this workspace.</Trans>
      </div>
    );
  }

  const toggleCoupon = (redemptionId: string) => {
    setExpandedCoupons((prev) => {
      const next = new Set(prev);
      if (next.has(redemptionId)) {
        next.delete(redemptionId);
      } else {
        next.add(redemptionId);
      }
      return next;
    });
  };

  const seatCoupons = coupons.filter(
    (c): c is SeatCouponData => c.discountType === "seat"
  );
  const topUpCoupons = coupons.filter(
    (c): c is CreditPoolTopUpCouponData =>
      c.discountType === "credit_pool_top_up"
  );

  return (
    <>
      {seatCoupons.length > 0 && (
        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold text-foreground">
            <Trans>Seat coupons</Trans>
          </h2>
          <DataTable
            data={buildSeatRows(
              seatCoupons,
              expandedCoupons,
              toggleCoupon,
              t`Total`
            )}
            columns={seatColumns}
            hideRowDivider={false}
          />
        </div>
      )}
      {topUpCoupons.length > 0 && (
        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold text-foreground">
            <Trans>Credit top-ups</Trans>
          </h2>
          <DataTable
            data={buildTopUpRows(topUpCoupons, (amountCredits) => {
              const credits = formatCredits(amountCredits);
              return t`${plural(amountCredits, {
                one: `${credits} credit`,
                other: `${credits} credits`,
              })}`;
            })}
            columns={topUpColumns}
            hideRowDivider={false}
          />
        </div>
      )}
    </>
  );
}
