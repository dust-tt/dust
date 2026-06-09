import {
  SEAT_TYPE_ICONS,
  seatTypeAvatarColors,
} from "@app/components/workspace/billing/seatTypeUtils";
import { SEAT_PRODUCT_YEARLY_SUFFIX } from "@app/lib/metronome/constants";
import {
  FREE_SEAT_PRODUCT_NAME,
  MAX_SEAT_PRODUCT_NAME,
  PRO_SEAT_PRODUCT_NAME,
} from "@app/lib/metronome/setup_common";
import { useMetronomeInvoiceLines } from "@app/lib/swr/workspaces";
import type { MembershipSeatType } from "@app/types/memberships";
import type { SubscriptionType } from "@app/types/plan";
import type { LightWorkspaceType } from "@app/types/user";
import { Avatar, cn, DataTable, Spinner } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";

function formatAmount(cents: number, currency: string): string {
  const locale = currency.toUpperCase() === "USD" ? "en-US" : "fr-FR";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

interface InvoiceSeatsPreviewProps {
  owner: LightWorkspaceType;
  subscription: SubscriptionType;
}

interface InvoiceRow {
  name: string;
  quantity: string;
  cost: string;
  subtotal: string;
  isNegative?: boolean;
  isBold?: boolean;
  onClick?: () => void;
  menuItems?: never[];
}

// Maps Metronome product names (monthly and yearly variants) to seat group type.
const PRODUCT_NAME_TO_SEAT_TYPE: Record<string, MembershipSeatType> = {
  [FREE_SEAT_PRODUCT_NAME]: "free",
  [PRO_SEAT_PRODUCT_NAME]: "pro",
  [PRO_SEAT_PRODUCT_NAME + SEAT_PRODUCT_YEARLY_SUFFIX]: "pro",
  [MAX_SEAT_PRODUCT_NAME]: "max",
  [MAX_SEAT_PRODUCT_NAME + SEAT_PRODUCT_YEARLY_SUFFIX]: "max",
};

function buildColumns(currency: string): ColumnDef<InvoiceRow>[] {
  return [
    {
      accessorKey: "name",
      header: "Name",
      enableSorting: false,
      meta: { className: "w-1/2" },
      cell: ({ row }) => {
        const { name } = row.original;
        const seatType = PRODUCT_NAME_TO_SEAT_TYPE[name];
        const avatarColors = seatType ? seatTypeAvatarColors(seatType) : null;
        return (
          <div className="flex items-center gap-1">
            {seatType && avatarColors && (
              <Avatar
                icon={SEAT_TYPE_ICONS[seatType]}
                size="xs"
                backgroundColor={avatarColors.backgroundColor}
                iconColor={avatarColors.iconColor}
              />
            )}
            <span
              className={cn("text-sm", row.original.isBold && "font-semibold")}
            >
              {name}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: "quantity",
      header: "Quantity",
      enableSorting: false,
      meta: { headerAlign: "right", className: "w-[16%]" },
      cell: ({ row }) => (
        <span className="block text-right text-sm">
          {row.original.quantity}
        </span>
      ),
    },
    {
      accessorKey: "cost",
      header: `Cost (${currency})`,
      enableSorting: false,
      meta: { headerAlign: "right", className: "w-[17%]" },
      cell: ({ row }) => (
        <span className="block text-right text-sm text-muted-foreground dark:text-muted-foreground-night">
          {row.original.cost}
        </span>
      ),
    },
    {
      accessorKey: "subtotal",
      header: "Subtotal",
      enableSorting: false,
      meta: { headerAlign: "right", className: "w-[17%]" },
      cell: ({ row }) => (
        <span
          className={cn(
            "block text-right text-sm",
            row.original.isBold && "font-semibold",
            row.original.isNegative
              ? "text-success-600 dark:text-success-500"
              : undefined
          )}
        >
          {row.original.subtotal}
        </span>
      ),
    },
  ];
}

export function InvoiceSeatsPreview({
  owner,
  subscription,
}: InvoiceSeatsPreviewProps) {
  const { invoiceLines, isMetronomeInvoiceLinesLoading } =
    useMetronomeInvoiceLines({
      workspaceId: owner.sId,
      disabled: !subscription.metronomeContractId,
      fiatOnly: true,
    });

  if (isMetronomeInvoiceLinesLoading) {
    return (
      <div className="w-full p-6">
        <Spinner />
      </div>
    );
  }

  if (!invoiceLines || invoiceLines.lineItems.length === 0) {
    return null;
  }

  const currency = invoiceLines.currency?.toUpperCase() ?? "USD";

  const totalCents = invoiceLines.lineItems.reduce(
    (sum, item) => sum + item.totalCents,
    0
  );

  const rows: InvoiceRow[] = [
    ...invoiceLines.lineItems.map((item) => ({
      name: item.name,
      quantity: item.quantity !== null ? item.quantity.toLocaleString() : "—",
      cost:
        item.unitPriceCents !== null
          ? formatAmount(item.unitPriceCents, currency)
          : "—",
      subtotal: formatAmount(item.totalCents, currency),
      isNegative: item.totalCents < 0,
    })),
    {
      name: "Total",
      quantity: "",
      cost: "",
      subtotal: formatAmount(totalCents, currency),
      isBold: true,
    },
  ];

  return (
    <DataTable
      data={rows}
      columns={buildColumns(currency)}
      hideRowDivider={false}
    />
  );
}
