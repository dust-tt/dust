import { cn, Counter as SparkleCounter } from "@dust-tt/sparkle";
import { counterVariants } from "@sparkle/components/Counter";
import type { ComponentProps, ComponentType } from "react";

type SparkleCounterProps = ComponentProps<typeof SparkleCounter>;

/** Sparkle's three sizes, plus an xxs one step below its smallest. */
export const COUNTER_SIZES = ["xxs", "xs", "sm", "md"] as const;
export type CounterSizeType = (typeof COUNTER_SIZES)[number];

export interface CounterProps
  extends Omit<SparkleCounterProps, "value" | "size"> {
  /**
   * The count to display. Left out — or down to one, which a dot already says —
   * the counter keeps its footprint and shows a dot instead of a number.
   */
  value?: number;
  size?: CounterSizeType;
  /**
   * Drawn inside the counter in place of the dot, for a state a colour alone
   * cannot name. The counter fills out to its full size around it. Ignored
   * once there is a `value`, which leaves no room for it.
   */
  icon?: ComponentType<{ className?: string }>;
  /**
   * Breathes the valueless dot up to 12px and back, for something that is
   * waiting rather than settled. Only the dot breathes: a `value` or an `icon`
   * ignores this.
   */
  isBusy?: boolean;
  /**
   * Folds the counter away in place of unmounting it: the number fades, the
   * circle shrinks out, and the footprint closes up behind it. Keep the
   * counter mounted and flip this instead of dropping it, or the state it was
   * showing disappears without a word.
   */
  isCollapsed?: boolean;
}

/** What each size measures: xxs is 16px, then Sparkle's 20, 24 and 28. */
const FOOTPRINT_CLASS: Record<CounterSizeType, string> = {
  xxs: "h-4 w-4",
  xs: "h-5 w-5",
  sm: "h-6 w-6",
  md: "h-7 w-7",
};

/** xxs has no Sparkle size behind it, so it borrows xs and is drawn smaller. */
const SPARKLE_SIZE: Record<
  CounterSizeType,
  NonNullable<SparkleCounterProps["size"]>
> = {
  xxs: "xs",
  xs: "xs",
  sm: "sm",
  md: "md",
};

/** The pill xxs draws with a number in it: 16px tall, growing with the digits. */
const XXS_VALUE_CLASS = "h-4 min-w-4 px-0.5";

/**
 * With an icon the counter is a disc rather than a pill: the padding digits
 * need goes, so the circle stays the size the row expects it to be.
 */
const ICON_CHIP_CLASS: Record<CounterSizeType, string> = {
  xxs: "h-4 w-4 min-w-4 px-0",
  xs: "w-5 px-0",
  sm: "w-6 px-0",
  md: "w-7 px-0",
};

/** The glyph inside, drawn a couple of pixels clear of the circle's edge. */
const ICON_GLYPH_CLASS: Record<CounterSizeType, string> = {
  xxs: "h-2.5 w-2.5",
  xs: "h-3 w-3",
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
};

// The dot rests at 8px and breathes to 12px, which is further than Sparkle's
// animate-breathing-scale goes (0.95), so the keyframes are local.
const BREATHING_CSS = `
  @keyframes pgc-breathe {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.5); }
  }
  .pgc-dot-busy { animation: pgc-breathe 3s infinite ease-in-out; }
  @media (prefers-reduced-motion: reduce) {
    .pgc-dot-busy { animation: none; }
  }
`;

const COLLAPSE_TRANSITION =
  "transition-all duration-300 ease-out motion-reduce:transition-none";

/**
 * Same 300ms for the circle, but half that for the number, so it is gone
 * before the shape it sits in is too small to hold it.
 */
const COLLAPSE_INNER_TRANSITION = cn(
  "transition-[color,opacity,scale] duration-300 ease-out",
  "[transition-duration:150ms,300ms,300ms] motion-reduce:transition-none"
);

/**
 * Widest the box opens to: a notch above the size itself, so a second digit
 * still fits and the collapse starts moving at once rather than running down
 * to the counter first.
 */
const OPEN_CLASS: Record<CounterSizeType, string> = {
  xxs: "max-w-5",
  xs: "max-w-6",
  sm: "max-w-7",
  md: "max-w-8",
};

/**
 * The whole footprint goes, margins included, so the row closes up rather than
 * leaving a gap where the counter was. Coming last in `cn` is what lets these
 * beat the spacing the caller asked for.
 */
const COLLAPSED_CLASS = "max-w-0 ml-0 mr-0";

/**
 * Sparkle's Counter, one size smaller, with a valueless state and one it can
 * fold away into. With something to count it is the Counter itself; without —
 * and one is nothing to count, since being there says it — it holds the same
 * space and centers an 8px dot in it, breathing when `isBusy`, or an `icon`
 * for a state the colour of a dot could not have told you.
 * @summary Count badge that can hold a dot or a glyph, and collapse on itself.
 */
export function Counter({
  value,
  size = "xxs",
  variant = "primary",
  icon: IconComponent,
  isInButton = false,
  isBusy = false,
  isCollapsed = false,
  className,
  ...props
}: CounterProps) {
  const sparkleSize = SPARKLE_SIZE[size];
  // A one is the counter saying it is there, which the dot has already said.
  const hasCount = value !== undefined && value > 1;

  const inner = hasCount ? (
    <SparkleCounter
      value={value}
      size={sparkleSize}
      variant={variant}
      isInButton={isInButton}
      className={cn(
        size === "xxs" && XXS_VALUE_CLASS,
        COLLAPSE_INNER_TRANSITION,
        isCollapsed && "scale-50 text-transparent opacity-0"
      )}
    />
  ) : IconComponent ? (
    <span
      className={cn(
        counterVariants({ size: sparkleSize, variant, isInButton }),
        ICON_CHIP_CLASS[size],
        COLLAPSE_INNER_TRANSITION,
        isCollapsed && "scale-50 opacity-0"
      )}
    >
      <IconComponent className={cn(ICON_GLYPH_CLASS[size], "shrink-0")} />
    </span>
  ) : (
    <span
      className={cn(
        counterVariants({ size: sparkleSize, variant, isInButton }),
        "h-2 w-2 min-w-0 px-0",
        isBusy && "pgc-dot-busy",
        COLLAPSE_INNER_TRANSITION,
        isCollapsed && "scale-50 opacity-0"
      )}
    />
  );

  return (
    <div
      className={cn(
        "inline-flex items-center justify-center overflow-hidden",
        !hasCount && FOOTPRINT_CLASS[size],
        COLLAPSE_TRANSITION,
        className,
        isCollapsed ? COLLAPSED_CLASS : OPEN_CLASS[size]
      )}
      aria-hidden={isCollapsed || undefined}
      {...props}
    >
      {isBusy && <style>{BREATHING_CSS}</style>}
      {inner}
    </div>
  );
}
