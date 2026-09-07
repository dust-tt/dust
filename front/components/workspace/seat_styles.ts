import type { MembershipSeatType } from "@app/types/memberships";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";

const SEAT_TIER_STYLES = {
  max: {
    icon: "text-brand-orange-golden",
    barFill: "bg-brand-orange-golden",
    barTrack: "bg-info-100",
  },
  pro: {
    icon: "text-highlight",
    barFill: "bg-highlight",
    barTrack: "bg-highlight-100",
  },
  muted: {
    icon: "text-muted-foreground",
    barFill: "bg-muted-foreground",
    barTrack: "bg-muted-background",
  },
};

// Muted bar colors, for bar sections that are not tied to a seat tier (e.g. the
// workspace pool or an empty bar).
export const MUTED_BAR_CLASSES = {
  track: SEAT_TIER_STYLES.muted.barTrack,
  fill: SEAT_TIER_STYLES.muted.barFill,
};

// Overage bar colors (spend beyond the seat allowance + pool limit) —
// warning/orange, to signal the user is over their cap.
export const OVERAGE_BAR_CLASSES = {
  track: "bg-warning-200",
  fill: "bg-warning-700",
};

// Pool credit bar fill exactly at its limit — a warning ahead of the overage
// (red) color used once consumption exceeds it.
export const AT_POOL_LIMIT_BAR_CLASSES = {
  fill: "bg-warning-500",
};

// Pool credit bar fill once consumption exceeds its limit.
export const OVER_POOL_LIMIT_BAR_CLASSES = {
  fill: "bg-red-500",
};

// Seat icon text color: golden for max, highlight blue for pro, muted grey
// otherwise (free / none / workspace).
export function getSeatIconColorClass(seatType: MembershipSeatType): string {
  switch (seatType) {
    case "max":
    case "max_yearly":
      return SEAT_TIER_STYLES.max.icon;
    case "pro":
    case "pro_yearly":
      return SEAT_TIER_STYLES.pro.icon;
    case "none":
    case "free":
    case "workspace":
    case "workspace_yearly":
      return SEAT_TIER_STYLES.muted.icon;
    default:
      assertNeverAndIgnore(seatType);
      return SEAT_TIER_STYLES.muted.icon;
  }
}

// Usage-bar track/fill colors, matching the seat icon colors.
export function getSeatBarClasses(seatType: MembershipSeatType | null): {
  track: string;
  fill: string;
} {
  if (seatType?.startsWith("max")) {
    return {
      track: SEAT_TIER_STYLES.max.barTrack,
      fill: SEAT_TIER_STYLES.max.barFill,
    };
  }
  if (seatType?.startsWith("pro")) {
    return {
      track: SEAT_TIER_STYLES.pro.barTrack,
      fill: SEAT_TIER_STYLES.pro.barFill,
    };
  }
  return {
    track: SEAT_TIER_STYLES.muted.barTrack,
    fill: SEAT_TIER_STYLES.muted.barFill,
  };
}
