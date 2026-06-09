import type { MembershipSeatType } from "@app/types/memberships";
import { LayerSingle, LayersThree01, LayersTwo01 } from "@dust-tt/sparkle";
import type { ComponentType } from "react";

export const SEAT_TYPE_ICONS: Record<string, ComponentType> = {
  free: LayerSingle,
  pro: LayersTwo01,
  max: LayersThree01,
};

export function seatTypeAvatarColors(seatType: MembershipSeatType) {
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
