import { Tooltip } from "@sparkle/components/Tooltip";
import {
  ChevronLeft,
  Trash01,
  Upload01,
  XClose,
} from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import React from "react";
import { Button, type ButtonProps } from "./Button";

const barVariants = cva("flex flex-row items-center gap-3 px-4", {
  variants: {
    position: {
      top: "border-b",
      bottom: "border-t",
    },
    variant: {
      full: "fixed left-0 right-0 z-30 backdrop-blur border-border-dark/70 bg-background/80",
      default: "relative z-10 border-border bg-background",
    },
    size: {
      sm: "h-12",
      md: "h-14",
    },
  },
  compoundVariants: [
    {
      position: "top",
      variant: "full",
      class: "top-0",
    },
    {
      position: "bottom",
      variant: "full",
      class: "bottom-0",
    },
  ],
  defaultVariants: {
    position: "top",
    variant: "full",
    size: "md",
  },
});

interface BarProps extends VariantProps<typeof barVariants> {
  title?: React.ReactElement | string;
  /** Extra content rendered next to the title. */
  description?: React.ReactNode;
  /** Tooltip shown when hovering the title. */
  tooltip?: string;
  /** Actions anchored to the left edge, before the title. */
  leftActions?: React.ReactNode;
  /** Actions rendered after the title, before the flexible gap. */
  centerActions?: React.ReactNode;
  /** Actions anchored to the right edge. */
  rightActions?: React.ReactNode;
  className?: string;
}

/**
 * A header or footer action bar that anchors a page, panel, or modal with a title,
 * optional description, and left/center/right action slots. Set `position` to `top`
 * or `bottom`, and `variant` to `full` (spans the viewport) or `default` (scoped to
 * its parent container). Use Bar.ButtonBar for ready-made action layouts; for a
 * floating, transient action surface over content, use HoveringBar instead.
 * @summary Page or panel action bar.
 */
export function Bar({
  title,
  description,
  tooltip,
  leftActions,
  centerActions,
  rightActions,
  className,
  position,
  variant,
  size,
}: BarProps) {
  const titleClasses = cn("text-foreground", "heading-base truncate");

  return (
    <div className={cn(barVariants({ position, variant, size }), className)}>
      {leftActions && <div className="flex gap-1">{leftActions}</div>}
      {title && (
        <div className={titleClasses}>
          {tooltip ? (
            <Tooltip
              tooltipTriggerAsChild
              trigger={
                <>
                  {typeof title === "string" ? <span>{title}</span> : title}
                  {description}
                </>
              }
              label={tooltip}
            />
          ) : (
            <>
              {typeof title === "string" ? <span>{title}</span> : title}
              {description}
            </>
          )}
        </div>
      )}
      {centerActions && <div className="flex gap-1">{centerActions}</div>}
      <div className="flex-grow" />
      {rightActions && <div className="flex gap-1">{rightActions}</div>}
    </div>
  );
}

type BarButtonBarCloseProps = {
  variant: "close";
  onClose?: () => void;
};

type BarButtonBarBackProps = {
  variant: "back";
  onBack?: () => void;
};

type BarButtonBarValidateProps = {
  variant: "validate";
  cancelButtonProps?: ButtonProps;
  saveButtonProps?: ButtonProps;
};

type BarButtonBarConversationProps = {
  variant: "conversation";
  onDelete?: () => void;
  onShare?: () => void;
};

export type BarButtonBarProps =
  | BarButtonBarCloseProps
  | BarButtonBarBackProps
  | BarButtonBarValidateProps
  | BarButtonBarConversationProps;

/**
 * Ready-made action layouts for a Bar: `close`, `back`, `validate`
 * (cancel/save pair), or `conversation` (delete/share).
 * @summary Preset Bar action layouts.
 */
Bar.ButtonBar = function (props: BarButtonBarProps) {
  switch (props.variant) {
    case "back":
      return (
        <Button
          size="sm"
          icon={ChevronLeft}
          variant="ghost"
          tooltip="Back"
          onClick={props.onBack}
        />
      );
    case "close":
      return (
        <Button
          size="sm"
          icon={XClose}
          variant="ghost"
          tooltip="Close"
          onClick={props.onClose}
        />
      );
    case "validate":
      return (
        <>
          {props.cancelButtonProps && <Button {...props.cancelButtonProps} />}
          {props.saveButtonProps && <Button {...props.saveButtonProps} />}
        </>
      );
    case "conversation":
      return (
        <>
          <Button
            size="sm"
            icon={Trash01}
            tooltip="Delete"
            variant="ghost"
            onClick={props.onDelete}
          />
          <Button
            size="sm"
            label="Share"
            icon={Upload01}
            variant="ghost"
            onClick={props.onShare}
          />
        </>
      );
    default:
      return null;
  }
};

// BarHeader component - convenience wrapper for top-positioned Bar
interface BarHeaderProps {
  title: string;
  description?: React.ReactNode;
  tooltip?: string;
  leftActions?: React.ReactNode;
  centerActions?: React.ReactNode;
  rightActions?: React.ReactNode;
  className?: string;
  variant?: "full" | "default";
  size?: "sm" | "md";
}

/**
 * Convenience wrapper for a top-positioned Bar with a required title. Use it to
 * frame a page or panel with a persistent header.
 * @summary Top-positioned Bar.
 */
export function BarHeader({
  title,
  description,
  tooltip,
  leftActions,
  centerActions,
  rightActions,
  className,
  variant,
  size,
}: BarHeaderProps) {
  return (
    <Bar
      position="top"
      title={title}
      description={description}
      tooltip={tooltip}
      leftActions={leftActions}
      centerActions={centerActions}
      rightActions={rightActions}
      className={className}
      variant={variant}
      size={size}
    />
  );
}

export type BarHeaderButtonBarProps = BarButtonBarProps;
BarHeader.ButtonBar = Bar.ButtonBar;

// BarFooter component - convenience wrapper for bottom-positioned Bar
interface BarFooterProps {
  leftActions?: React.ReactNode;
  rightActions?: React.ReactNode;
  className?: string;
  variant?: "full" | "default";
  size?: "sm" | "md";
}

/**
 * Convenience wrapper for a bottom-positioned Bar, e.g. to pin save/cancel
 * controls under a scrolling form.
 * @summary Bottom-positioned Bar.
 */
export function BarFooter({
  leftActions,
  rightActions,
  className,
  variant,
  size,
}: BarFooterProps) {
  return (
    <Bar
      position="bottom"
      leftActions={leftActions}
      rightActions={rightActions}
      className={className}
      variant={variant}
      size={size}
    />
  );
}

export type BarFooterButtonBarProps = BarButtonBarProps;
BarFooter.ButtonBar = Bar.ButtonBar;
