import {
  Button,
  Card,
  Icon,
  Spinner,
  Tooltip,
  XMarkIcon,
  cn,
} from "@dust-tt/sparkle";
import React from "react";

type NewCitationSize = "sm" | "md" | "lg";

// Visual: Icon-style component (className) or Logo (SVGProps). Size is always forced to "sm" by NewCitation.
type NewCitationVisual =
  | React.ComponentProps<typeof Icon>["visual"]
  | React.ComponentType<React.SVGProps<SVGSVGElement>>;
type NewCitationVisualProp = NewCitationVisual | NewCitationVisual[];

// Distributive Omit preserves the CardProps union discrimination (link vs button).
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

type NewCitationProps = DistributiveOmit<
  React.ComponentProps<typeof Card>,
  "action" | "size"
> & {
  label: string;
  /** Icon or Logo component(s) to show; rendered at size "sm". Single or array. */
  visual: NewCitationVisualProp;
  size?: NewCitationSize;
  tooltip?: string;
  isLoading?: boolean;
  imgSrc?: string;
  onClose?: () => void;
};

function isClickableCitationProps(props: {
  href?: unknown;
  onClick?: unknown;
}): props is { href: string } | { onClick: (...args: unknown[]) => void } {
  return (
    ("href" in props && props.href != null) ||
    ("onClick" in props && props.onClick != null)
  );
}

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
    const isInline = size === "sm";

    // Normalize to array and render each icon at size "sm". When loading, show spinner.
    const iconComponents = Array.isArray(visual) ? visual : [visual];
    const resolvedVisual = isLoading ? (
      <Spinner size="xs" />
    ) : (
      <>
        {iconComponents.map(
          (IconComponent, i) =>
            IconComponent && <Icon key={i} visual={IconComponent} size="sm" />
        )}
      </>
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
          {
            <div className="s-flex s-w-fit s-items-center s-gap-2">
              {resolvedVisual}
            </div>
          }
          {
            <div
              className={cn(
                "s-line-clamp-1 s-overflow-hidden s-text-ellipsis s-break-all",
                "s-text-foreground dark:s-text-foreground-night"
              )}
            >
              {label}
            </div>
          }
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

    const isClickable = isClickableCitationProps(props);

    const cardElement = (
      <Card
        ref={ref}
        variant={variant}
        size={size === "sm" ? "sm" : "md"}
        action={
          onClose ? (
            <Button
              variant="ghost"
              size="xmini"
              icon={XMarkIcon}
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
            />
          ) : undefined
        }
        containerClassName={cn("s-flex-none", imgSrc ? "s-w-28" : "s-w-40")}
        className={cn(
          "s-relative s-flex s-gap-1 s-flex-col s-overflow-hidden s-text-sm",
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
        className={cn(
          "s-flex s-flex-wrap s-gap-0.5",
          justify === "end" && "s-justify-end",
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
NewCitationGrid.displayName = "NewCitationGrid";

export { NewCitation, NewCitationGrid };
export type { NewCitationProps, NewCitationSize };
