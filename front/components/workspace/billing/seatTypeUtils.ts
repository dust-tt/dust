import {
  CoinsStacked01,
  Database01,
  LayerSingle,
  LayersThree01,
  LayersTwo01,
} from "@dust-tt/sparkle";
import type { ComponentType } from "react";

export const SEAT_TYPE_ICONS: Record<string, ComponentType> = {
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
      return { backgroundColor: "bg-gray-100", iconColor: "text-gray-600" };
  }
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
