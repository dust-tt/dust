import React from "react";

import {
  Button,
  Card,
  CardProps,
  Spinner,
  Tooltip,
} from "@sparkle/components/";
import { XMarkIcon } from "@sparkle/icons/app";
import { cn } from "@sparkle/lib/utils";

type NewCitationSize = "sm" | "md" | "lg";

// Distributive Omit preserves the CardProps union discrimination (link vs button).
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

type NewCitationProps = DistributiveOmit<CardProps, "action" | "size"> & {
  label: string;
  visual: React.ReactNode;
  size?: NewCitationSize;
  tooltip?: string;
  isLoading?: boolean;
  imgSrc?: string;
  onClose?: () => void;
};

const NewCitation = React.forwardRef<HTMLDivElement, NewCitationProps>(
  (
    {
      label,
      visual,
      size = "md",
      tooltip,
      isLoading,
      imgSrc,
      onClose,
      variant = "secondary",
      className,
      ...props
    },
    ref
  ) => {
    // Rendered via Card's `action` prop (in CardActions, a sibling to InnerCard)
    // so hovering/pressing it won't trigger the card's hover/active styles.
    const closeAction = onClose ? (
      <Button
        variant="ghost"
        size="xmini"
        icon={XMarkIcon}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      />
    ) : undefined;

    const labelElement = (
      <div
        className={cn(
          "s-line-clamp-1 s-overflow-hidden s-text-ellipsis s-break-all",
          "s-text-foreground dark:s-text-foreground-night"
        )}
      >
        {label}
      </div>
    );

    const isInline = size === "sm";

    // When loading, replace the visual icons with a spinner.
    const resolvedVisual = isLoading ? <Spinner size="xs" /> : visual;

    const visualRow = (
      <div className="s-flex s-w-fit s-items-center s-gap-2">
        {resolvedVisual}
      </div>
    );

    // Background image layer — fills behind the normal content, no layout impact.
    const backgroundImage = imgSrc ? (
      <img
        src={imgSrc}
        alt={label}
        className="s-absolute s-inset-0 s-h-full s-w-full s-rounded-[inherit] s-object-cover"
      />
    ) : null;

    let content: React.ReactNode;

    if (isInline) {
      // sm: single row [icons] Label
      content = (
        <div className="s-flex s-items-center s-gap-2">
          {resolvedVisual}
          <div className="s-flex-1 s-truncate s-text-sm">{label}</div>
        </div>
      );
    } else {
      // md / lg: two rows
      content = (
        <>
          {visualRow}
          {labelElement}
        </>
      );
    }

    // When an image is present, add a full-size white blurred cover between the
    // image and the content. Both cover and content are invisible until hover.
    const hoverCover = imgSrc ? (
      <div
        className={cn(
          "s-absolute s-inset-0 s-rounded-[inherit]",
          "s-opacity-0 s-transition-opacity group-hover/card:s-opacity-100",
          "s-bg-white/80 s-backdrop-blur-sm",
          "dark:s-bg-black/80"
        )}
      />
    ) : null;

    const isClickable =
      ("href" in props && props.href != null) ||
      ("onClick" in props && props.onClick != null);

    const cardElement = (
      <Card
        ref={ref}
        variant={variant}
        size={size === "sm" ? "sm" : "md"}
        action={closeAction}
        className={cn(
          "s-relative s-flex s-gap-1 s-flex-none s-flex-col s-overflow-hidden s-text-sm",
          size === "lg" ? "s-pt-10" : "",
          isClickable && "s-cursor-pointer",
          className
        )}
        {...props}
      >
        {backgroundImage}
        {hoverCover}
        <div
          className={cn(
            "s-relative s-flex s-flex-col s-gap-1",
            imgSrc &&
              "s-opacity-0 s-transition-opacity group-hover/card:s-opacity-100"
          )}
        >
          {content}
        </div>
      </Card>
    );

    if (tooltip) {
      return <Tooltip trigger={cardElement} label={tooltip} />;
    }

    return cardElement;
  }
);

NewCitation.displayName = "NewCitation";

interface NewCitationGridProps extends React.HTMLAttributes<HTMLDivElement> {
  justify?: "start" | "end";
}

const NewCitationGrid = React.forwardRef<HTMLDivElement, NewCitationGridProps>(
  ({ children, className, justify = "start", ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("s-min-w-60 s-@container", className)}
        {...props}
      >
        <div
          className="s-grid s-grid-cols-2 s-gap-2 @xxs:s-grid-cols-3 @xs:s-grid-cols-4 @md:s-grid-cols-5 @lg:s-grid-cols-6"
          style={justify === "end" ? { direction: "rtl" } : undefined}
        >
          {justify === "end"
            ? React.Children.map(children, (child) => (
                <div style={{ direction: "ltr" }}>{child}</div>
              ))
            : children}
        </div>
      </div>
    );
  }
);
NewCitationGrid.displayName = "NewCitationGrid";

export { NewCitation, NewCitationGrid };
export type { NewCitationProps, NewCitationSize };
