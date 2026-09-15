import { Avatar, cn, Counter } from "@dust-tt/sparkle";
import { counterVariants } from "@sparkle/components/Counter";
import type { ComponentProps, ComponentType } from "react";

/**
 * Avatars below xs and above md are out of range: the Counter would either
 * swallow the avatar or float on it.
 */
export const AVATAR_COUNTER_SIZES = ["xs", "sm", "md"] as const;
export type AvatarCounterSizeType = (typeof AVATAR_COUNTER_SIZES)[number];

type CounterProps = ComponentProps<typeof Counter>;
export type AvatarCounterVariantType = NonNullable<CounterProps["variant"]>;

/** The counter grows with the avatar it sits on. */
const COUNTER_SIZE_FOR_AVATAR: Record<
  AvatarCounterSizeType,
  NonNullable<CounterProps["size"]>
> = {
  xs: "xs",
  sm: "sm",
  md: "md",
};

const ICON_CLASS_FOR_AVATAR: Record<AvatarCounterSizeType, string> = {
  xs: "h-3 w-3",
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
};

const POSITION_CLASSES = "pointer-events-none absolute -right-1 -top-1";

export interface AvatarCounterProps
  extends Omit<ComponentProps<typeof Avatar>, "size" | "className"> {
  size?: AvatarCounterSizeType;
  /** Number shown in the corner counter. Cap large values yourself; 0 hides the counter. */
  count?: number;
  /** Secondary icon shown in the corner counter. Ignored when `count` is set. */
  badgeIcon?: ComponentType<{ className?: string }>;
  /** Counter style, shared with the Counter component. */
  variant?: AvatarCounterVariantType;
  /** Accessible name for the counter; without it the counter is decorative. */
  badgeLabel?: string;
  /** Applied to the wrapper, not to the Avatar. */
  className?: string;
}

/**
 * An Avatar carrying a Counter in its top-right corner, holding either a count
 * or a secondary icon. Use it when a row already identifies someone by their
 * avatar and a second, smaller signal belongs to that same entity — the category
 * of what they asked for, or how many items they bring.
 * @summary Avatar with a corner counter or icon.
 */
export function AvatarCounter({
  size = "sm",
  count,
  badgeIcon: BadgeIcon,
  variant = "outline",
  badgeLabel,
  className,
  ...avatarProps
}: AvatarCounterProps) {
  const hasCount = count !== undefined && count > 0;
  const hasCounter = hasCount || Boolean(BadgeIcon);

  if (!hasCounter) {
    return <Avatar size={size} {...avatarProps} className={className} />;
  }

  const counterSize = COUNTER_SIZE_FOR_AVATAR[size];
  const labelProps = badgeLabel
    ? { "aria-label": badgeLabel }
    : { "aria-hidden": true };

  return (
    <div className={cn("relative inline-flex overflow-visible", className)}>
      <Avatar size={size} {...avatarProps} />
      {hasCount ? (
        <Counter
          value={count}
          size={counterSize}
          variant={variant}
          className={POSITION_CLASSES}
          {...labelProps}
        />
      ) : (
        BadgeIcon && (
          <span
            className={cn(
              counterVariants({ size: counterSize, variant }),
              POSITION_CLASSES
            )}
            {...labelProps}
          >
            <BadgeIcon className={ICON_CLASS_FOR_AVATAR[size]} />
          </span>
        )
      )}
    </div>
  );
}
