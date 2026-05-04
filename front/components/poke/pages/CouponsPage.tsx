import { CreateCouponForm } from "@app/components/poke/coupons/CreateCouponForm";
import { useDocumentTitle } from "@app/hooks/useDocumentTitle";
import {
  usePokeArchiveCoupon,
  usePokeCouponRedemptions,
  usePokeCoupons,
} from "@app/lib/swr/poke";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type {
  CouponDiscountType,
  CouponRedemptionStatus,
  CouponRedemptionType,
  CouponType,
} from "@app/types/coupon";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { MenuItem } from "@dust-tt/sparkle";
import {
  ArchiveIcon,
  Button,
  ChevronDownIcon,
  ChevronRightIcon,
  Chip,
  DataTable,
  PlusIcon,
  Spinner,
} from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import type { MouseEvent } from "react";
import { useMemo, useState } from "react";

function formatAmount(amount: number): string {
  return String(amount);
}

function getStatusChipColor(status: CouponRedemptionStatus) {
  switch (status) {
    case "active":
      return "success";
    case "pending":
      return "primary";
    case "failed":
      return "rose";
    case "revoked":
      return "warning";
    default:
      assertNeverAndIgnore(status);
      return "primary";
  }
}

interface CouponRowData {
  sId: string;
  code: string;
  description: string | null;
  discountType: CouponDiscountType;
  amount: number;
  durationMonths: number | null;
  maxRedemptions: number | null;
  redemptionCount: number;
  expirationDate: Date | null;
  archivedAt: Date | null;
  isExpanded: boolean;
  onClick?: () => void;
  menuItems?: MenuItem[];
}

interface CouponRedemptionRowData {
  sId: string;
  workspaceId: string;
  redeemedByUserId: string | null;
  redeemedAt: Date;
  status: CouponRedemptionStatus;
  onClick?: () => void;
  menuItems?: MenuItem[];
}

const couponColumns: ColumnDef<CouponRowData>[] = [
  {
    id: "expand",
    header: "",
    cell: ({ row }) =>
      row.original.isExpanded ? (
        <ChevronDownIcon className="h-4 w-4" />
      ) : (
        <ChevronRightIcon className="h-4 w-4" />
      ),
    meta: { className: "w-8" },
  },
  {
    accessorKey: "code",
    header: "Code",
    cell: ({ row }) => (
      <DataTable.CellContent disabled={!!row.original.archivedAt}>
        <div className="flex items-center gap-2">
          <span>{row.original.code}</span>
          {row.original.archivedAt && (
            <Chip size="xs" color="primary" label="archived" />
          )}
        </div>
      </DataTable.CellContent>
    ),
  },
  {
    accessorKey: "description",
    header: "Description",
    cell: ({ row }) => (
      <DataTable.BasicCellContent
        label={row.original.description ?? "—"}
        disabled={!!row.original.archivedAt}
      />
    ),
  },
  {
    accessorKey: "discountType",
    header: "Type",
    cell: ({ row }) => (
      <DataTable.BasicCellContent
        label={row.original.discountType}
        disabled={!!row.original.archivedAt}
      />
    ),
  },
  {
    accessorKey: "amount",
    header: "Amount",
    cell: ({ row }) => (
      <DataTable.BasicCellContent
        label={formatAmount(row.original.amount)}
        disabled={!!row.original.archivedAt}
      />
    ),
  },
  {
    accessorKey: "durationMonths",
    header: "Duration (mo)",
    cell: ({ row }) => (
      <DataTable.BasicCellContent
        label={row.original.durationMonths ?? "—"}
        disabled={!!row.original.archivedAt}
      />
    ),
  },
  {
    id: "uses",
    header: "Uses",
    cell: ({ row }) => (
      <DataTable.BasicCellContent
        label={`${row.original.redemptionCount}${row.original.maxRedemptions !== null ? ` / ${row.original.maxRedemptions}` : ""}`}
        disabled={!!row.original.archivedAt}
      />
    ),
  },
  {
    accessorKey: "expirationDate",
    header: "Expiration date",
    cell: ({ row }) => (
      <DataTable.BasicCellContent
        label={
          row.original.expirationDate
            ? formatTimestampToFriendlyDate(
                new Date(row.original.expirationDate).getTime(),
                "compactWithDay"
              )
            : "—"
        }
        disabled={!!row.original.archivedAt}
      />
    ),
  },
  {
    id: "actions",
    header: "",
    cell: ({ row }) => (
      <DataTable.MoreButton menuItems={row.original.menuItems} />
    ),
    meta: { className: "w-14" },
  },
];

const redemptionColumns: ColumnDef<CouponRedemptionRowData>[] = [
  {
    accessorKey: "workspaceId",
    header: "Workspace",
    cell: ({ row }) => (
      <DataTable.BasicCellContent label={row.original.workspaceId} />
    ),
  },
  {
    accessorKey: "redeemedByUserId",
    header: "Redeemed by",
    cell: ({ row }) => (
      <DataTable.BasicCellContent
        label={row.original.redeemedByUserId ?? "—"}
      />
    ),
  },
  {
    accessorKey: "redeemedAt",
    header: "Redeemed at",
    cell: ({ row }) => (
      <DataTable.BasicCellContent
        label={formatTimestampToFriendlyDate(
          new Date(row.original.redeemedAt).getTime(),
          "compactWithDay"
        )}
      />
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <DataTable.CellContent>
        <Chip
          size="xs"
          color={getStatusChipColor(row.original.status)}
          label={row.original.status}
        />
      </DataTable.CellContent>
    ),
  },
];

interface CouponRedemptionsPanelProps {
  coupon: CouponType;
}

function CouponRedemptionsPanel({ coupon }: CouponRedemptionsPanelProps) {
  const { redemptions, isRedemptionsLoading } = usePokeCouponRedemptions({
    couponId: coupon.sId,
    disabled: false,
  });

  const data: CouponRedemptionRowData[] = useMemo(
    () =>
      redemptions.map((r: CouponRedemptionType) => ({
        sId: r.sId,
        workspaceId: r.workspaceId,
        redeemedByUserId: r.redeemedByUserId,
        redeemedAt: r.redeemedAt,
        status: r.status,
      })),
    [redemptions]
  );

  if (isRedemptionsLoading) {
    return (
      <div className="flex justify-center py-4">
        <Spinner size="sm" />
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-lg border p-4">
      <p className="mb-2 text-sm font-semibold">
        Redemptions for <span className="font-mono">{coupon.code}</span>
      </p>
      {redemptions.length === 0 ? (
        <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          No redemptions yet.
        </p>
      ) : (
        <DataTable
          data={data}
          columns={redemptionColumns}
          getRowId={(row) => row.sId}
        />
      )}
    </div>
  );
}

export function CouponsPage() {
  useDocumentTitle("Poke - Coupons");

  const { coupons, isCouponsLoading, mutate } = usePokeCoupons();
  const archiveCoupon = usePokeArchiveCoupon();

  const [expandedCouponId, setExpandedCouponId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const data: CouponRowData[] = useMemo(
    () =>
      coupons.map((coupon: CouponType) => ({
        ...coupon,
        isExpanded: expandedCouponId === coupon.sId,
        onClick: () =>
          setExpandedCouponId((prev) =>
            prev === coupon.sId ? null : coupon.sId
          ),
        menuItems: coupon.archivedAt
          ? []
          : [
              {
                kind: "item" as const,
                label: "Archive",
                icon: ArchiveIcon,
                onClick: (e: MouseEvent) => {
                  e.stopPropagation();
                  void archiveCoupon(coupon.sId);
                },
              },
            ],
      })),
    [coupons, expandedCouponId, archiveCoupon]
  );

  const expandedCoupon = useMemo(
    () => coupons.find((c) => c.sId === expandedCouponId) ?? null,
    [coupons, expandedCouponId]
  );

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

      <div className="w-full pb-24">
        <DataTable
          data={data}
          columns={couponColumns}
          getRowId={(row) => row.sId}
        />
        {expandedCoupon && <CouponRedemptionsPanel coupon={expandedCoupon} />}
      </div>
    </div>
  );
}
