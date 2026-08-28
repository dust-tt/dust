import { MOTION_DURATIONS, MOTION_EASINGS } from "@dust-tt/sparkle";

// Layout-resize transition shared by every chart/table that animates its own
// height/size change via Motion's `layout` prop. Kept in one place so a
// future retune only has to happen once.
export const ANALYTICS_LAYOUT_TRANSITION = (
  shouldReduceMotion: boolean | null
) => ({
  duration: shouldReduceMotion ? 0 : MOTION_DURATIONS.exit,
  ease: MOTION_EASINGS.enter,
});
