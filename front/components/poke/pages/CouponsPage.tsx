import { CreateCouponForm } from "@app/components/poke/coupons/CreateCouponForm";
import { useDocumentTitle } from "@app/hooks/useDocumentTitle";
import {
  usePokeArchiveCoupon,
  usePokeCouponRedemptions,
  usePokeCoupons,
} from "@app/lib/swr/poke";
import type { CouponRedemptionType, CouponType } from "@app/types/coupon";
import {
  ArchiveIcon,
  Button,
  ChevronDownIcon,
  ChevronRightIcon,
  IconButton,
  PlusIcon,
  Spinner,
} from "@dust-tt/sparkle";
import { useState } from "react";

function formatUsd(microUsd: number): string {
  return `$${(microUsd / 1_000_000).toFixed(2)}`;
}

function formatDate(date: Date | string | null): string {
  if (!date) {
    return "—";
  }
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

interface CouponRedemptionsRowProps {
  couponId: string;
}

function CouponRedemptionsRow({ couponId }: CouponRedemptionsRowProps) {
  const { redemptions, isRedemptionsLoading } = usePokeCouponRedemptions({
    couponId,
    disabled: false,
  });

  if (isRedemptionsLoading) {
    return (
      <tr>
        <td colSpan={9} className="px-4 py-2 text-center">
          <Spinner size="xs" />
        </td>
      </tr>
    );
  }

  if (redemptions.length === 0) {
    return (
      <tr>
        <td
          colSpan={9}
          className="px-6 py-2 text-sm text-muted-foreground dark:text-muted-foreground-night"
        >
          No redemptions yet.
        </td>
      </tr>
    );
  }

  return (
    <>
      {redemptions.map((r: CouponRedemptionType) => (
        <tr
          key={r.sId}
          className="bg-muted/30 dark:bg-muted-night/30 text-xs text-muted-foreground dark:text-muted-foreground-night"
        >
          <td className="w-8" />
          <td className="border px-3 py-1 font-mono">↳ {r.workspaceId}</td>
          <td className="border px-3 py-1 font-mono">
            {r.redeemedByUserId ?? "—"}
          </td>
          <td className="border px-3 py-1">{formatDate(r.redeemedAt)}</td>
          <td colSpan={5} />
        </tr>
      ))}
    </>
  );
}

interface CouponRowProps {
  coupon: CouponType;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onArchive: () => void;
}

function CouponRow({
  coupon,
  isExpanded,
  onToggleExpand,
  onArchive,
}: CouponRowProps) {
  const isArchived = coupon.archivedAt !== null;

  return (
    <>
      <tr
        className={
          isArchived
            ? "cursor-pointer opacity-50"
            : "cursor-pointer hover:bg-muted/20 dark:hover:bg-muted-night/20"
        }
        onClick={onToggleExpand}
      >
        <td className="w-8 px-2 py-2 text-center">
          {isExpanded ? (
            <ChevronDownIcon className="h-4 w-4" />
          ) : (
            <ChevronRightIcon className="h-4 w-4" />
          )}
        </td>
        <td className="border px-4 py-2 font-semibold">
          <div className="flex items-center gap-2">
            {coupon.code}
            {isArchived && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs dark:bg-muted-night">
                archived
              </span>
            )}
          </div>
        </td>
        <td className="border px-4 py-2 text-sm">
          {coupon.description ?? "—"}
        </td>
        <td className="border px-4 py-2 text-sm">{coupon.discountType}</td>
        <td className="border px-4 py-2 text-sm font-mono">
          {formatUsd(coupon.amountMicroUsd)}
        </td>
        <td className="border px-4 py-2 text-sm text-center">
          {coupon.durationMonths ?? "—"}
        </td>
        <td className="border px-4 py-2 text-sm text-center font-mono">
          {coupon.redemptionCount}
          {coupon.maxRedemptions !== null ? ` / ${coupon.maxRedemptions}` : ""}
        </td>
        <td className="border px-4 py-2 text-sm">
          {formatDate(coupon.redeemBy)}
        </td>
        <td
          className="border px-4 py-2 text-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <IconButton
            icon={ArchiveIcon}
            size="xs"
            variant="ghost"
            disabled={isArchived}
            tooltip={isArchived ? "Already archived" : "Archive coupon"}
            onClick={onArchive}
          />
        </td>
      </tr>
      {isExpanded && <CouponRedemptionsRow couponId={coupon.sId} />}
    </>
  );
}

export function CouponsPage() {
  useDocumentTitle("Poke - Coupons");

  const { coupons, isCouponsLoading, mutate } = usePokeCoupons();
  const archiveCoupon = usePokeArchiveCoupon();

  const [expandedCouponId, setExpandedCouponId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  function toggleExpand(couponId: string) {
    setExpandedCouponId((prev) => (prev === couponId ? null : couponId));
  }

  async function handleArchive(couponId: string) {
    await archiveCoupon(couponId);
  }

  if (isCouponsLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center">
      <div className="py-8 text-2xl font-bold">Coupons</div>

      {showCreateForm && (
        <div className="mb-6 w-full max-w-3xl">
          <CreateCouponForm
            onCreated={async () => {
              await mutate();
              setShowCreateForm(false);
            }}
            onCancel={() => setShowCreateForm(false)}
          />
        </div>
      )}

      <div className="mb-4 flex w-full justify-end">
        <Button
          icon={PlusIcon}
          label="Create coupon"
          variant="outline"
          disabled={showCreateForm}
          onClick={() => setShowCreateForm(true)}
        />
      </div>

      <div className="w-full overflow-x-auto pb-24">
        <table className="w-full table-auto rounded-lg text-left">
          <thead className="bg-muted dark:bg-muted-night">
            <tr>
              <th className="w-8" />
              <th className="border px-4 py-2 text-sm">Code</th>
              <th className="border px-4 py-2 text-sm">Description</th>
              <th className="border px-4 py-2 text-sm">Type</th>
              <th className="border px-4 py-2 text-sm">Amount (USD)</th>
              <th className="border px-4 py-2 text-sm">Duration (mo)</th>
              <th className="border px-4 py-2 text-sm">Uses</th>
              <th className="border px-4 py-2 text-sm">Redeem by</th>
              <th className="border px-4 py-2 text-sm">Actions</th>
            </tr>
          </thead>
          <tbody>
            {coupons.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-4 py-8 text-center text-muted-foreground dark:text-muted-foreground-night"
                >
                  No coupons yet.
                </td>
              </tr>
            ) : (
              coupons.map((coupon: CouponType) => (
                <CouponRow
                  key={coupon.sId}
                  coupon={coupon}
                  isExpanded={expandedCouponId === coupon.sId}
                  onToggleExpand={() => toggleExpand(coupon.sId)}
                  onArchive={() => handleArchive(coupon.sId)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
