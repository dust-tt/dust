import {
  formatAmount,
  SEAT_TYPE_ICONS,
  seatTypeAvatarColors,
} from "@app/components/workspace/billing/seatTypeUtils";
import { SEAT_PRODUCT_YEARLY_SUFFIX } from "@app/lib/metronome/constants";
import type { MetronomeInvoiceLineItem } from "@app/lib/metronome/invoice";
import {
  FREE_SEAT_PRODUCT_NAME,
  MAX_SEAT_PRODUCT_NAME,
  PRO_SEAT_PRODUCT_NAME,
  WORKSPACE_SEAT_PRODUCT_NAME,
} from "@app/lib/metronome/setup_common";
import { useMetronomeInvoiceLines } from "@app/lib/swr/workspaces";
import type { SubscriptionType } from "@app/types/plan";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Avatar,
  ChevronDown,
  ChevronRight,
  cn,
  DataTable,
  Spinner,
} from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import type { ComponentType } from "react";
import { useState } from "react";

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
  isGroup?: boolean;
  isExpanded?: boolean;
  isChild?: boolean;
  icon?: ComponentType;
  onClick?: () => void;
  menuItems?: never[];
}

const CREDITS_CONVERSION_NAME = "Credits (AWU) conversion";
const OVERAGE_NAME = "Credit overage";

// Maps Metronome product names (monthly and yearly variants) to seat group type.
const PRODUCT_NAME_TO_SEAT_TYPE: Record<string, string> = {
  [FREE_SEAT_PRODUCT_NAME]: "free",
  [PRO_SEAT_PRODUCT_NAME]: "pro",
  [PRO_SEAT_PRODUCT_NAME + SEAT_PRODUCT_YEARLY_SUFFIX]: "pro",
  [MAX_SEAT_PRODUCT_NAME]: "max",
  [MAX_SEAT_PRODUCT_NAME + SEAT_PRODUCT_YEARLY_SUFFIX]: "max",
  [WORKSPACE_SEAT_PRODUCT_NAME]: "workspace",
  [WORKSPACE_SEAT_PRODUCT_NAME + SEAT_PRODUCT_YEARLY_SUFFIX]: "workspace",
  [OVERAGE_NAME]: "overage",
};

function formatLineItem(
  item: MetronomeInvoiceLineItem,
  currency: string
): Omit<InvoiceRow, "isGroup" | "isExpanded" | "isChild" | "onClick"> {
  const isOverage = item.name === CREDITS_CONVERSION_NAME;
  return {
    name: isOverage ? OVERAGE_NAME : item.name,
    quantity:
      item.quantity !== null
        ? `${item.quantity.toLocaleString()}${isOverage ? " credits" : ""}`
        : "—",
    cost:
      item.unitPriceCents !== null
        ? `${formatAmount(item.unitPriceCents, currency)}${isOverage ? " / credit" : ""}`
        : "—",
    subtotal: formatAmount(item.totalCents, currency),
    isNegative: item.totalCents < 0,
  };
}

function buildColumns(currency: string): ColumnDef<InvoiceRow>[] {
  return [
    {
      accessorKey: "name",
      header: "Name",
      enableSorting: false,
      meta: { className: "w-1/2" },
      cell: ({ row }) => {
        const { name, isGroup, isExpanded, isChild } = row.original;
        const seatType = PRODUCT_NAME_TO_SEAT_TYPE[name];
        const avatarColors = seatType ? seatTypeAvatarColors(seatType) : null;

        if (isGroup) {
          return (
            <div className="flex cursor-pointer items-center gap-3">
              {seatType && avatarColors ? (
                <Avatar
                  icon={SEAT_TYPE_ICONS[seatType]}
                  size="xs"
                  backgroundColor={avatarColors.backgroundColor}
                  iconColor={avatarColors.iconColor}
                />
              ) : null}
              <span className="text-sm">{name}</span>
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground dark:text-muted-foreground-night" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground dark:text-muted-foreground-night" />
              )}
            </div>
          );
        }

        return (
          <div className={cn("flex items-center gap-3", isChild && "pl-5")}>
            {seatType && avatarColors ? (
              <Avatar
                icon={SEAT_TYPE_ICONS[seatType]}
                size="xs"
                backgroundColor={avatarColors.backgroundColor}
                iconColor={avatarColors.iconColor}
              />
            ) : null}
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
          {row.original.isGroup ? "" : row.original.quantity}
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
          {row.original.isGroup ? "" : row.original.cost}
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

export function NextInvoicePreview({
  owner,
  subscription,
}: InvoiceSeatsPreviewProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const { invoiceLines, isMetronomeInvoiceLinesLoading } =
    useMetronomeInvoiceLines({
      workspaceId: owner.sId,
      disabled: !subscription.metronomeContractId,
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

  const toggleGroup = (name: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  // Group items by name, preserving insertion order.
  const groups = new Map<string, MetronomeInvoiceLineItem[]>();
  for (const item of invoiceLines.lineItems) {
    const existing = groups.get(item.name);
    if (existing) {
      existing.push(item);
    } else {
      groups.set(item.name, [item]);
    }
  }

  const rows: InvoiceRow[] = [];
  for (const [name, items] of groups) {
    if (items.length === 1) {
      rows.push(formatLineItem(items[0], currency));
    } else {
      const subtotalCents = items.reduce((sum, i) => sum + i.totalCents, 0);
      const isExpanded = expandedGroups.has(name);
      const displayName =
        name === CREDITS_CONVERSION_NAME ? OVERAGE_NAME : name;
      rows.push({
        name: displayName,
        quantity: "",
        cost: "",
        subtotal: formatAmount(subtotalCents, currency),
        isGroup: true,
        isExpanded,
        onClick: () => toggleGroup(name),
      });
      if (isExpanded) {
        for (const item of items) {
          rows.push({ ...formatLineItem(item, currency), isChild: true });
        }
      }
    }
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
