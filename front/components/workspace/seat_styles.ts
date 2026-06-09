import type { MembershipSeatType } from "@app/types/memberships";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";

const SEAT_TIER_STYLES = {
  max: {
    icon: "text-brand-orange-golden",
    barFill: "bg-brand-orange-golden",
    barTrack: "bg-golden-100 dark:bg-golden-100-night",
  },
  pro: {
    icon: "text-highlight dark:text-highlight-night",
    barFill: "bg-highlight dark:bg-highlight-night",
    barTrack: "bg-blue-100 dark:bg-blue-100-night",
  },
  muted: {
    icon: "text-muted-foreground dark:text-muted-foreground-night",
    barFill: "bg-muted-foreground dark:bg-muted-foreground-night",
    barTrack: "bg-muted-background dark:bg-muted-background-night",
  },
};

// Muted bar colors, for bar sections that are not tied to a seat tier (e.g. the
// workspace pool or an empty bar).
export const MUTED_BAR_CLASSES = {
  track: SEAT_TIER_STYLES.muted.barTrack,
  fill: SEAT_TIER_STYLES.muted.barFill,
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
