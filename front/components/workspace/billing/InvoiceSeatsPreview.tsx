import { useMetronomeInvoiceLines } from "@app/lib/swr/workspaces";
import type { SubscriptionType } from "@app/types/plan";
import type { LightWorkspaceType } from "@app/types/user";
import {
  ChevronDown,
  ChevronRight,
  cn,
  DataTable,
  Icon,
  Spinner,
} from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import { useState } from "react";

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
  isGroupRow?: boolean;
  isExpanded?: boolean;
  isSubRow?: boolean;
  isNegative?: boolean;
  isBold?: boolean;
  onClick?: () => void;
  menuItems?: never[];
}

function buildColumns(currency: string): ColumnDef<InvoiceRow>[] {
  return [
    {
      accessorKey: "name",
      header: "Name",
      enableSorting: false,
      meta: { className: "w-1/2" },
      cell: ({ row }) => {
        const { isGroupRow, isExpanded, isSubRow, name } = row.original;
        return (
          <div className={cn("flex items-center gap-1", isSubRow && "pl-6")}>
            {isGroupRow && (
              <Icon
                visual={isExpanded ? ChevronDown : ChevronRight}
                size="xs"
                className="shrink-0 text-muted-foreground dark:text-muted-foreground-night"
              />
            )}
            <span
              className={cn(
                "text-sm",
                (isGroupRow || row.original.isBold) && "font-semibold"
              )}
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
            (row.original.isGroupRow || row.original.isBold) && "font-semibold",
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
    });

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

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

  // Separate negative lines (not grouped) from positive ones (grouped by name).
  const positiveItems = invoiceLines.lineItems.filter(
    (item) => item.totalCents >= 0
  );
  const negativeItems = invoiceLines.lineItems.filter(
    (item) => item.totalCents < 0
  );

  const groups = new Map<
    string,
    {
      quantity: number | null;
      unitPriceCents: number | null;
      totalCents: number;
    }[]
  >();
  for (const item of positiveItems) {
    const existing = groups.get(item.name) ?? [];
    existing.push({
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      totalCents: item.totalCents,
    });
    groups.set(item.name, existing);
  }

  const rows: InvoiceRow[] = [];

  for (const [name, items] of groups) {
    const groupTotal = items.reduce((sum, i) => sum + i.totalCents, 0);
    const isExpanded = expandedGroups.has(name);

    rows.push({
      name,
      quantity: "",
      cost: "",
      subtotal: formatAmount(groupTotal, currency),
      isGroupRow: true,
      isExpanded,
      onClick: () => {
        setExpandedGroups((prev) => {
          const next = new Set(prev);
          if (next.has(name)) {
            next.delete(name);
          } else {
            next.add(name);
          }
          return next;
        });
      },
    });

    if (isExpanded) {
      for (const item of items) {
        rows.push({
          name,
          quantity:
            item.quantity !== null ? item.quantity.toLocaleString() : "—",
          cost:
            item.unitPriceCents !== null
              ? formatAmount(item.unitPriceCents, currency)
              : "—",
          subtotal: formatAmount(item.totalCents, currency),
          isSubRow: true,
        });
      }
    }
  }

  for (const item of negativeItems) {
    rows.push({
      name: item.name,
      quantity: item.quantity !== null ? item.quantity.toLocaleString() : "—",
      cost:
        item.unitPriceCents !== null
          ? formatAmount(item.unitPriceCents, currency)
          : "—",
      subtotal: formatAmount(item.totalCents, currency),
      isNegative: true,
    });
  }

  const totalCents = invoiceLines.lineItems.reduce(
    (sum, item) => sum + item.totalCents,
    0
  );
  rows.push({
    name: "Total",
    quantity: "",
    cost: "",
    subtotal: formatAmount(totalCents, currency),
    isBold: true,
  });

  return (
    <DataTable
      data={rows}
      columns={buildColumns(currency)}
      hideRowDivider={false}
    />
  );
}
