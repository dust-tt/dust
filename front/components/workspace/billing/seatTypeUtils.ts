import type { MembershipSeatType } from "@app/types/memberships";
import { toBaseSeatType } from "@app/types/memberships";
import type { Chip } from "@dust-tt/sparkle";
import {
  AlertCircle,
  CoinsStacked01,
  Database01,
  LayerSingle,
  LayersThree01,
  LayersTwo01,
} from "@dust-tt/sparkle";
import type React from "react";
import type { ComponentType } from "react";

const SEAT_TYPE_DISPLAY_NAMES: Record<string, string> = {
  free: "Free",
  pro: "Pro",
  max: "Max",
  workspace: "Platform",
  none: "None",
};

export function seatTypeDisplayName(seatType: MembershipSeatType): string {
  const base = toBaseSeatType(seatType);
  return SEAT_TYPE_DISPLAY_NAMES[base] ?? base;
}

export const SEAT_TYPE_ICONS: Record<string, ComponentType> = {
  none: AlertCircle,
  free: LayerSingle,
  pro: LayersTwo01,
  pro_yearly: LayersTwo01,
  max: LayersThree01,
  max_yearly: LayersThree01,
  workspace: Database01,
  workspace_yearly: Database01,
  overage: CoinsStacked01,
};

export function seatTypeAvatarColors(seatType: string) {
  switch (seatType) {
    case "pro":
    case "pro_yearly":
      return { backgroundColor: "bg-blue-100", iconColor: "text-blue-600" };
    case "max":
    case "max_yearly":
      return {
        backgroundColor: "bg-golden-100",
        iconColor: "text-golden-600",
      };
    case "workspace":
    case "workspace_yearly":
      return {
        backgroundColor: "bg-green-100",
        iconColor: "text-green-600",
      };
    default:
      return {
        backgroundColor: "bg-muted",
        iconColor: "text-muted-foreground",
      };
  }
}

export type SeatChipColor = NonNullable<
  React.ComponentProps<typeof Chip>["color"]
>;

// Chip color per plan, matching the seat icon colors used elsewhere (golden
// for max, blue/highlight for pro, green for the platform seat).
const SEAT_TYPE_CHIP_COLORS: Record<string, SeatChipColor> = {
  max: "warning",
  pro: "highlight",
  workspace: "success",
};

export function seatTypeChipColor(seatType: MembershipSeatType): SeatChipColor {
  const base = toBaseSeatType(seatType);
  return SEAT_TYPE_CHIP_COLORS[base] ?? "primary";
}

export function formatAmount(cents: number, currency: string): string {
  const locale = currency.toUpperCase() === "USD" ? "en-US" : "fr-FR";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
