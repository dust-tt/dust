import { cn } from "@dust-tt/sparkle";

/** Matches the expanded input bar surface (see InputBar.tsx). */
export const INPUT_BAR_SURFACE_CLASSES =
  "border border-border-dark bg-muted-background";

/** Same hue as expanded, slightly translucent for compact overlay on scroll. */
export const INPUT_BAR_COMPACT_SURFACE_CLASSES =
  "border border-border-dark bg-muted-background/90 shadow-sm backdrop-blur-sm";

export const INPUT_BAR_COMPACT_PILL_CLASSES = cn(
  "min-w-0 w-full rounded-full px-2",
  INPUT_BAR_COMPACT_SURFACE_CLASSES
);

export const INPUT_BAR_COMPACT_PILL_INNER_CLASSES =
  "flex h-10 min-w-0 flex-row items-center gap-1.5";

export const INPUT_BAR_COMPACT_PREVIEW_CLASSES =
  "min-w-0 flex-1 truncate rounded-full px-2.5 copy-md font-medium leading-10";

export const INPUT_BAR_COMPACT_ENTER_ANIMATION_CLASSES =
  "motion-safe:origin-bottom motion-safe:animate-input-bar-compact-in";

export const INPUT_BAR_COMPACT_CONTENT_ENTER_ANIMATION_CLASSES =
  "motion-safe:animate-input-bar-compact-content-in";

export const INPUT_BAR_COMPACT_NAV_ENTER_ANIMATION_CLASSES =
  "motion-safe:origin-center motion-safe:animate-input-bar-compact-nav-in";

/**
 * Composite/paint-only morph between the expanded and compact surfaces. The
 * padding and box-shadow swap instantly: this transition runs while the list is
 * being scrolled, and a layout property here would re-lay-out the editor on
 * every frame of it — under the 480ms compact entrance neither reads as a snap.
 */
export const INPUT_BAR_COMPACT_MORPH_TRANSITION_CLASSES =
  "transition-[background-color,border-color,opacity] duration-300 ease-out motion-reduce:transition-none";
