import type { SeatTypeInfo } from "@app/lib/api/credits/seat_plan";
import { useMembersSeats, useSeatPlan } from "@app/lib/swr/credits";
import { useMetronomeInvoice } from "@app/lib/swr/workspaces";
import {
  isMembershipSeatType,
  type MembershipSeatType,
  SEAT_TYPE_ORDER,
} from "@app/types/memberships";
import type { SubscriptionType } from "@app/types/plan";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";
import {
  ActionCreditCoinsIcon,
  Avatar,
  Cube01,
  DataTable,
  Hexagon01,
  SeatMax,
  Spinner,
} from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import type React from "react";

const SEAT_TYPE_ICONS: Record<string, React.ComponentType> = {
  free: Hexagon01,
  pro: Cube01,
  max: SeatMax,
};

function seatTypeAvatarColors(seatType: MembershipSeatType) {
  switch (seatType) {
    case "free":
      return { backgroundColor: "bg-gray-100", iconColor: "text-gray-600" };
    case "max":
      return {
        backgroundColor: "bg-golden-100",
        iconColor: "text-golden-600",
      };
    default:
      return { backgroundColor: "bg-blue-100", iconColor: "text-blue-600" };
  }
}

function seatTypeGroup(seatType: MembershipSeatType): MembershipSeatType {
  switch (seatType) {
    case "free":
    case "workspace":
    case "pro":
    case "max":
      return seatType;
    case "workspace_yearly":
      return "workspace";
    case "pro_yearly":
      return "pro";
    case "max_yearly":
      return "max";
    case "none":
      return "none";
    default:
      assertNeverAndIgnore(seatType);
      return seatType;
  }
}

function formatAmount(cents: number, currency: string): string {
  const locale = currency.toUpperCase() === "USD" ? "en-US" : "fr-FR";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

interface BillingSeatsOverviewProps {
  owner: LightWorkspaceType;
  subscription: SubscriptionType;
}

type BillingRow = {
  name: string;
  icon?: React.ComponentType;
  avatarBackgroundColor?: string;
  avatarIconColor?: string;
  quantity: string;
  cost: string;
  subtotal: string;
  isBold?: boolean;
  onClick?: () => void;
  menuItems?: never[];
};

function NameCell({ row }: { row: { original: BillingRow } }) {
  const cls = row.original.isBold
    ? "text-sm font-semibold"
    : "text-sm font-medium";
  return (
    <div className="flex items-center gap-2">
      {row.original.icon && (
        <Avatar
          icon={row.original.icon}
          size="xs"
          backgroundColor={row.original.avatarBackgroundColor}
          iconColor={row.original.avatarIconColor}
        />
      )}
      <span className={cls}>{row.original.name}</span>
    </div>
  );
}

function SubtotalCell({ row }: { row: { original: BillingRow } }) {
  const cls = row.original.isBold ? "font-semibold" : "";
  return (
    <span className={`block text-sm text-right ${cls}`}>
      {row.original.subtotal}
    </span>
  );
}

const columns: ColumnDef<BillingRow>[] = [
  {
    accessorKey: "name",
    header: "Name",
    enableSorting: false,
    cell: ({ row }) => <NameCell row={row} />,
  },
  {
    accessorKey: "quantity",
    header: "Quantity",
    enableSorting: false,
    meta: { headerAlign: "right" },
    cell: ({ row }) => (
      <span className="block text-right text-sm">{row.original.quantity}</span>
    ),
  },
  {
    accessorKey: "cost",
    header: "Cost",
    enableSorting: false,
    meta: { headerAlign: "right" },
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
    meta: { headerAlign: "right" },
    cell: ({ row }) => <SubtotalCell row={row} />,
  },
];

export function BillingSeatsOverview({
  owner,
  subscription,
}: BillingSeatsOverviewProps) {
  const { seatPlans, isSeatPlanLoading } = useSeatPlan({
    workspaceId: owner.sId,
  });
  const { membersSeats, metronomeSeats, isMembersSeatsLoading } =
    useMembersSeats({ workspaceId: owner.sId });
  const { invoice, isMetronomeInvoiceLoading } = useMetronomeInvoice({
    workspaceId: owner.sId,
    disabled: !subscription.metronomeContractId,
  });

  if (isSeatPlanLoading || isMembersSeatsLoading || isMetronomeInvoiceLoading) {
    return (
      <div className="w-full p-6">
        <Spinner />
      </div>
    );
  }

  const plansBySeatType = new Map<
    MembershipSeatType,
    Partial<Record<SeatTypeInfo["billingFrequency"], SeatTypeInfo>>
  >();
  Object.entries(seatPlans).forEach(([seatType, plan]) => {
    if (!isMembershipSeatType(seatType) || !plan) {
      return;
    }
    const groupSeatType = seatTypeGroup(seatType);
    const plans = plansBySeatType.get(groupSeatType) ?? {};
    plans[plan.billingFrequency] = plan;
    plansBySeatType.set(groupSeatType, plans);
  });

  const membersCountBySeatType = new Map<MembershipSeatType, number>();
  Object.entries(membersSeats).forEach(([seatType, count]) => {
    if (!isMembershipSeatType(seatType)) {
      return;
    }
    const groupSeatType = seatTypeGroup(seatType);
    membersCountBySeatType.set(
      groupSeatType,
      (membersCountBySeatType.get(groupSeatType) ?? 0) + count
    );
  });

  // Total seats billed in Metronome per seat type (assigned + unassigned),
  // grouped the same way as the member counts. `undefined` for a group means
  // Metronome had nothing to report for it (so we hide the unassigned line).
  const metronomeBilledBySeatType = new Map<MembershipSeatType, number>();
  Object.entries(metronomeSeats).forEach(([seatType, billed]) => {
    if (!isMembershipSeatType(seatType) || billed === undefined) {
      return;
    }
    const groupSeatType = seatTypeGroup(seatType);
    metronomeBilledBySeatType.set(
      groupSeatType,
      (metronomeBilledBySeatType.get(groupSeatType) ?? 0) + billed
    );
  });

  const plansWithMembers = Array.from(plansBySeatType.entries())
    .flatMap(([seatType, plans]) => {
      const primaryPlan = plans.monthly ?? plans.annual;
      if (!primaryPlan) {
        return [];
      }
      const membersCount = membersCountBySeatType.get(seatType) ?? 0;
      const billed = metronomeBilledBySeatType.get(seatType);
      return [{ seatType, primaryPlan, billedCount: billed ?? membersCount }];
    })
    .sort(
      (a, b) =>
        (SEAT_TYPE_ORDER[a.seatType] ?? Number.MAX_SAFE_INTEGER) -
          (SEAT_TYPE_ORDER[b.seatType] ?? Number.MAX_SAFE_INTEGER) ||
        a.seatType.localeCompare(b.seatType)
    );

  if (plansWithMembers.length === 0) {
    return null;
  }

  const currency =
    plansWithMembers[0]?.primaryPlan.currency ?? invoice?.currency ?? "USD";

  const rows: BillingRow[] = plansWithMembers.map(
    ({ seatType, primaryPlan, billedCount }) => {
      const avatarColors = seatTypeAvatarColors(seatType);
      const subtotalCents = billedCount * primaryPlan.priceCents;
      const costLabel =
        primaryPlan.priceCents === 0
          ? formatAmount(0, currency)
          : `${formatAmount(primaryPlan.priceCents, currency)} / seat`;

      return {
        name: primaryPlan.name.replace("Seat", "seat"),
        icon: SEAT_TYPE_ICONS[seatType] ?? Cube01,
        avatarBackgroundColor: avatarColors.backgroundColor,
        avatarIconColor: avatarColors.iconColor,
        quantity: billedCount.toLocaleString(),
        cost: costLabel,
        subtotal: formatAmount(subtotalCents, currency),
      };
    }
  );

  if (
    invoice?.mau !== null &&
    invoice?.mau !== undefined &&
    invoice?.mauUnitPriceCents !== null &&
    invoice?.mauUnitPriceCents !== undefined
  ) {
    rows.push({
      name: "Credit overage",
      icon: ActionCreditCoinsIcon,
      avatarBackgroundColor: "bg-gray-100",
      avatarIconColor: "text-gray-600",
      quantity: `${invoice.mau.toLocaleString()} credits`,
      cost: `${formatAmount(invoice.mauUnitPriceCents, currency)} / credit`,
      subtotal: formatAmount(invoice.mau * invoice.mauUnitPriceCents, currency),
    });
  }

  if (invoice) {
    rows.push({
      name: "Total",
      quantity: "",
      cost: "",
      subtotal: formatAmount(invoice.estimatedAmountCents, currency),
      isBold: true,
    });
  }

  return (
    <DataTable
      data={rows}
      columns={columns}
      hideRowDivider={false}
      cellClassName="px-3 py-2"
    />
  );
}
