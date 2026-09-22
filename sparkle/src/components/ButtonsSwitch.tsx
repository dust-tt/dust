import { Button } from "@sparkle/components/Button";
import { cn } from "@sparkle/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

type ButtonSize = Extract<
  React.ComponentProps<typeof Button>["size"],
  "xs" | "sm" | "md"
>;

type ButtonsSwitchContextType = {
  value?: string;
  onValueChange?: (value: string) => void;
  size: ButtonSize;
  disabled?: boolean;
};

const ButtonsSwitchContext =
  React.createContext<ButtonsSwitchContextType | null>(null);

const useButtonsSwitch = () => {
  const ctx = React.useContext(ButtonsSwitchContext);
  if (!ctx) {
    throw new Error(
      "ButtonsSwitch must be used within a ButtonsSwitchList component"
    );
  }
  return ctx;
};

// Borderless translucent track: a light gray tint on light, a slightly
// stronger tint on dark so the pill still reads against the darker page.
const listStyles = cva(
  cn(
    "relative inline-flex items-center gap-1",
    "box-border bg-foreground/[0.04] dark:bg-foreground/[0.06]"
  ),
  {
    variants: {
      fullWidth: {
        true: "w-full",
        false: "",
      },
      size: {
        xs: "rounded-xl p-[3px]",
        sm: "rounded-2xl p-1",
        md: "rounded-3xl p-1.5",
      },
    },
    defaultVariants: {
      fullWidth: false,
      size: "sm",
    },
  }
);

// The selected segment's surface: a single pill that translates between options
// instead of each option painting its own background, so a selection change reads
// as movement. On-screen movement, so ease-in-out; 200ms matches SliderToggle.
// Only transform/width/height animate (the indicator is an absolutely positioned
// leaf, so its width/height changes do not relayout siblings).
const indicatorStyles = cva(
  cn(
    "pointer-events-none absolute left-0 top-0",
    "bg-background dark:bg-stone-750",
    "shadow-[0_0_0.5px_0_var(--color-border-dark),0_1px_1.5px_0_rgba(0,0,0,0.06)]",
    "transition-[transform,width,height] duration-200 ease-in-out",
    "motion-reduce:transition-none"
  ),
  {
    // Mirrors Button's per-size radius so the pill hugs the option it sits under.
    variants: {
      size: {
        xs: "rounded-[9px]",
        sm: "rounded-xl",
        md: "rounded-[15px]",
      },
    },
    defaultVariants: {
      size: "sm",
    },
  }
);

type IndicatorRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const isSameRect = (a: IndicatorRect | null, b: IndicatorRect) =>
  a !== null &&
  a.x === b.x &&
  a.y === b.y &&
  a.width === b.width &&
  a.height === b.height;

export interface ButtonsSwitchListProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof listStyles> {
  size?: ButtonSize;
  /** Disable every option in the switch. */
  disabled?: boolean;
  /** Selected option's value (controlled usage). */
  value?: string;
  /** Initially selected option's value (uncontrolled usage). */
  defaultValue?: string;
  /** Invoked with the newly selected option's value. */
  onValueChange?: (value: string) => void;
}

/**
 * The container of a segmented, single-select toggle: it owns the selected value
 * (controlled via `value`/`onValueChange` or uncontrolled via `defaultValue`) for
 * its ButtonsSwitch children. Use it to switch between a small set of mutually
 * exclusive views or modes; for triggering actions, use Button or ButtonGroup.
 * @summary Segmented single-select toggle container.
 */
export const ButtonsSwitchList = React.forwardRef<
  HTMLDivElement,
  ButtonsSwitchListProps
>(
  (
    {
      className,
      children,
      size = "sm",
      value,
      defaultValue,
      onValueChange,
      disabled,
      fullWidth,
      ...props
    },
    ref
  ) => {
    const [internalValue, setInternalValue] = React.useState<
      string | undefined
    >(defaultValue);

    const isControlled = value !== undefined;
    const selected = isControlled ? value : internalValue;

    const handleChange = React.useCallback(
      (next: string) => {
        if (!isControlled) {
          setInternalValue(next);
        }
        onValueChange?.(next);
      },
      [isControlled, onValueChange]
    );

    const context: ButtonsSwitchContextType = React.useMemo(
      () => ({ value: selected, onValueChange: handleChange, size, disabled }),
      [selected, handleChange, size, disabled]
    );

    // Own the DOM ref for measuring and expose it to the forwarded one without
    // mutating the parameter (see ComposerInput).
    const listRef = React.useRef<HTMLDivElement | null>(null);
    React.useImperativeHandle<HTMLDivElement | null, HTMLDivElement | null>(
      ref,
      () => listRef.current
    );

    // Position the indicator under the selected option by measuring the DOM:
    // offsets are relative to the list (its offsetParent, via `relative`).
    // Re-measured on selection change, whenever the list or the selected
    // option resizes (font load, fullWidth reflow), and whenever `children`
    // change: a sibling's label changing shifts the selected option without
    // resizing it or (with fullWidth) the list, so the observers stay silent.
    const [indicator, setIndicator] = React.useState<IndicatorRect | null>(
      null
    );
    // biome-ignore lint/correctness/useExhaustiveDependencies: children drives re-measurement.
    React.useLayoutEffect(() => {
      const list = listRef.current;
      const active =
        selected === undefined
          ? null
          : list?.querySelector<HTMLElement>(
              '[role="tab"][aria-selected="true"]'
            );
      if (!list || !active) {
        setIndicator(null);
        return;
      }
      const measure = () => {
        const next: IndicatorRect = {
          x: active.offsetLeft,
          y: active.offsetTop,
          width: active.offsetWidth,
          height: active.offsetHeight,
        };
        setIndicator((prev) => (isSameRect(prev, next) ? prev : next));
      };
      measure();
      // jsdom (front unit tests) has no ResizeObserver; the initial measure
      // above is enough there.
      if (typeof ResizeObserver === "undefined") {
        return;
      }
      const observer = new ResizeObserver(measure);
      observer.observe(list);
      observer.observe(active);
      return () => observer.disconnect();
    }, [selected, children]);

    return (
      <div
        ref={listRef}
        role="tablist"
        aria-orientation="horizontal"
        className={cn(listStyles({ fullWidth, size }), className)}
        {...props}
      >
        {/* First in DOM so the (positioned) options paint above it without z-index.
            Mounted only once measured, so it never slides in from the origin. */}
        {indicator && (
          <div
            aria-hidden
            className={indicatorStyles({ size })}
            style={{
              transform: `translate(${indicator.x}px, ${indicator.y}px)`,
              width: indicator.width,
              height: indicator.height,
            }}
          />
        )}
        <ButtonsSwitchContext.Provider value={context}>
          {children}
        </ButtonsSwitchContext.Provider>
      </div>
    );
  }
);
ButtonsSwitchList.displayName = "ButtonsSwitchList";

// Options paint no surface of their own (the list's indicator does). The selected
// one also drops ghost's hover/press tint: hovering it does nothing, and the tint
// would otherwise paint over the track while the indicator is still sliding in.
// Its text color swap shares the indicator's timing so pill and label arrive
// together; inactive options keep Button's snappier hover timing.
const activeOptionStyles = cn(
  "hover:bg-transparent active:bg-transparent",
  "dark:hover:bg-transparent dark:active:bg-transparent",
  "duration-200 ease-in-out"
);

interface ButtonsSwitchProps
  extends Omit<React.ComponentProps<typeof Button>, "size" | "variant"> {
  /** Unique value identifying this option within the list. */
  value: string;
  label?: string;
  icon?: React.ComponentProps<typeof Button>["icon"];
}

/**
 * One option of a segmented toggle, identified by its `value` and rendered with a
 * `label`. Must be rendered inside a ButtonsSwitchList, which manages selection.
 * @summary Single option of a ButtonsSwitchList.
 */
export const ButtonsSwitch = React.forwardRef<
  HTMLButtonElement,
  ButtonsSwitchProps
>(({ className, value, label, icon, disabled, onClick, ...props }, ref) => {
  const {
    value: selected,
    onValueChange,
    size,
    disabled: groupDisabled,
  } = useButtonsSwitch();

  const isActive = selected === value;
  const isDisabled = disabled || groupDisabled;

  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (e) => {
    if (isDisabled) {
      return;
    }
    onValueChange?.(value);
    onClick?.(e);
  };

  return (
    <Button
      ref={ref}
      role="tab"
      aria-selected={isActive}
      size={size}
      // Inactive: ghost-secondary gives muted text. Active: ghost gives
      // foreground text. Both keep a transparent background; the selected
      // surface is the list's sliding indicator underneath.
      variant={isActive ? "ghost" : "ghost-secondary"}
      label={label}
      icon={icon}
      className={cn(isActive && activeOptionStyles, className)}
      disabled={isDisabled}
      onClick={handleClick}
      {...props}
    />
  );
});
ButtonsSwitch.displayName = "ButtonsSwitch";
