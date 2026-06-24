import { ArrowUp, cn, Icon, Spinner } from "@dust-tt/sparkle";
import React from "react";

type SendButtonSize = "xs" | "sm";

interface SendButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
  size?: SendButtonSize;
}

const sizeClasses: Record<SendButtonSize, string> = {
  xs: "h-7 w-7",
  sm: "h-9 w-9",
};

const iconSize: Record<SendButtonSize, "sm" | "md"> = {
  xs: "sm",
  sm: "md",
};

/**
 * Circular gradient send button for the composer (input bar). This is a bespoke
 * variant used only here, so it lives next to the input bar rather than in
 * sparkle. It mirrors the sparkle Button API surface we rely on (isLoading,
 * disabled, size) while owning the gradient/shadow treatment from the design.
 *
 * Note: it is rendered inside a Radix `TooltipTrigger asChild`, which clones the
 * child and forwards a ref plus pointer handlers — hence the forwardRef and the
 * spread of `...props` onto the underlying button.
 */
export const SendButton = React.forwardRef<HTMLButtonElement, SendButtonProps>(
  (
    {
      isLoading = false,
      size = "xs",
      disabled,
      className,
      "aria-label": ariaLabel,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled || isLoading}
        aria-label={ariaLabel ?? "Send message"}
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full text-white",
          // Tactile press: a quick scale-down on :active. Transform-only (GPU),
          // gated behind motion-safe so it's skipped under prefers-reduced-motion.
          "motion-safe:transition-transform motion-safe:duration-100 motion-safe:ease-out",
          "motion-safe:active:scale-[0.97]",
          "bg-gradient-to-b from-blue-400 to-blue-500",
          "hover:from-blue-300 hover:to-blue-400",
          "active:from-blue-500 active:to-blue-600",
          "disabled:from-blue-200 disabled:to-blue-300 disabled:cursor-default",
          "shadow-[0px_0px_0.5px_0px_#4babff,0px_1px_1.5px_0px_rgba(0,0,0,0.1),inset_0px_0px_1px_0px_rgba(255,255,255,0.08)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-1",
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {isLoading ? (
          <Spinner size="xs" variant="light" />
        ) : (
          <Icon visual={ArrowUp} size={iconSize[size]} />
        )}
      </button>
    );
  }
);

SendButton.displayName = "SendButton";

export default SendButton;
