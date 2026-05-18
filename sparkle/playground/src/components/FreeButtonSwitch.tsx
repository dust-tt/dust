import { Button, type ButtonProps } from "@dust-tt/sparkle";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { ComponentType, Key } from "react";

interface FreeButtonSwitchOption<TValue extends string> {
  id?: Key;
  value: TValue;
  label?: string;
  icon?: ComponentType;
  tooltip?: string;
  ariaLabel?: string;
}

type FreeButtonSwitchSize = "xmini" | "mini" | "xs" | "sm" | "md";

interface FreeButtonSwitchProps<TValue extends string> {
  value: TValue;
  options: FreeButtonSwitchOption<TValue>[];
  onValueChange: (value: TValue) => void;
  size?: FreeButtonSwitchSize;
  activeVariant?: ButtonProps["variant"];
  inactiveVariant?: ButtonProps["variant"];
}

const COMPACT_MODE_BUFFER_PX = 4;

export function FreeButtonSwitch<TValue extends string>({
  value,
  options,
  onValueChange,
  size = "sm",
  activeVariant = "outline",
  inactiveVariant = "ghost-secondary",
}: FreeButtonSwitchProps<TValue>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fullLabelsRef = useRef<HTMLDivElement>(null);
  const [shouldHideLabels, setShouldHideLabels] = useState(false);

  const updateLabelVisibility = useCallback(() => {
    const container = containerRef.current;
    const fullLabels = fullLabelsRef.current;
    if (!container || !fullLabels) {
      return;
    }

    const availableWidth = container.getBoundingClientRect().width;
    const fullLabelsWidth = fullLabels.scrollWidth;
    setShouldHideLabels(
      fullLabelsWidth > availableWidth - COMPACT_MODE_BUFFER_PX
    );
  }, []);

  useLayoutEffect(() => {
    updateLabelVisibility();

    const container = containerRef.current;
    const fullLabels = fullLabelsRef.current;
    if (!container || !fullLabels || typeof ResizeObserver === "undefined") {
      return;
    }

    const resizeObserver = new ResizeObserver(updateLabelVisibility);
    resizeObserver.observe(container);
    resizeObserver.observe(fullLabels);

    return () => resizeObserver.disconnect();
  }, [updateLabelVisibility]);

  const renderOptions = (hideLabels: boolean) =>
    options.map((option) => {
      const fallbackLabel = option.tooltip ?? option.label ?? option.ariaLabel;

      return (
        <Button
          key={option.id ?? option.value}
          variant={option.value === value ? activeVariant : inactiveVariant}
          size={size}
          label={hideLabels ? undefined : option.label}
          icon={option.icon}
          tooltip={hideLabels ? fallbackLabel : option.tooltip}
          aria-label={option.ariaLabel ?? fallbackLabel}
          onClick={() => onValueChange(option.value)}
        />
      );
    });

  return (
    <div ref={containerRef} className="s-relative s-w-full">
      <div className="s-flex s-items-center s-gap-1">
        {renderOptions(shouldHideLabels)}
      </div>
      <div
        ref={fullLabelsRef}
        className="s-invisible s-pointer-events-none s-absolute s-left-0 s-top-0 s-flex s-items-center s-gap-1 s-whitespace-nowrap"
        aria-hidden
      >
        {renderOptions(false)}
      </div>
    </div>
  );
}
