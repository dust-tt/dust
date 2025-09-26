import { cva } from "class-variance-authority";
import React, { ReactNode } from "react";

import { Button, CardProps, Spinner, Tooltip } from "@sparkle/components/";
import { LinkWrapper, LinkWrapperProps } from "@sparkle/components/LinkWrapper";
import { XMarkIcon } from "@sparkle/icons/app";
import { cn } from "@sparkle/lib/utils";

type CitationProps = CardProps & {
  children: React.ReactNode;
  isLoading?: boolean;
  tooltip?: React.ReactNode;
};

const Citation = React.forwardRef<HTMLDivElement, CitationProps>(
  ({ children, isLoading, className, tooltip, ...props }, ref) => {
    const hasDescription = React.useMemo(() => {
      const childrenArray = React.Children.toArray(children);
      return childrenArray.some(
        (child) =>
          React.isValidElement(child) && child.type === CitationDescription
      );
    }, [children]);

    // IMPORTANT: The order of elements is crucial for event handling.
    // The CitationDescription must always come after other elements to ensure
    // proper event propagation (especially for the close button's click events).
    // If auto-inserting a description, it must be appended after children.
    const contentWithDescription = (
      <>
        {children}
        {!hasDescription && <CitationDescription>&nbsp;</CitationDescription>}
      </>
    );
    // Render as an inline chip (link when href provided, otherwise div)
    // We intentionally do NOT render the description inline; it's expected in tooltip.

    // Extract link-related props if present (from CardProps union)
    const action = (props as unknown as { action?: React.ReactNode }).action;
    const { href, target, rel, replace, shallow, onClick, ...rest } =
      props as unknown as LinkWrapperProps &
        React.ButtonHTMLAttributes<HTMLDivElement>;

    // Filter out CitationDescription & CitationImage from inline content
    const inlineChildren = React.Children.toArray(
      contentWithDescription
    ).filter(
      (child) =>
        !(
          React.isValidElement(child) &&
          (child.type === CitationDescription || child.type === CitationImage)
        )
    );

    const chipContent = (
      <div
        ref={ref}
        className={cn(
          // base chip styles
          "s-box-border s-inline-flex s-items-center s-gap-1.5 s-rounded-xl s-px-2 s-py-1",
          "s-border s-border-border s-bg-background s-text-foreground",
          "dark:s-border-border-night dark:s-bg-background-night dark:s-text-foreground-night",
          "s-max-w-64 s-w-full s-truncate s-text-sm s-font-semibold",
          className
        )}
        // Keep button-like behavior if onClick
        onClick={onClick as any}
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        {...(rest as any)}
      >
        {/* icons + title only */}
        {inlineChildren}
        {action && <div className="s-ml-1 s-flex s-items-center">{action}</div>}
        {isLoading && (
          <span className="s-ml-1 s-inline-flex">
            <Spinner variant="dark" size="xs" />
          </span>
        )}
      </div>
    );

    const chip = href ? (
      <LinkWrapper
        href={href}
        target={target}
        rel={rel}
        replace={replace}
        shallow={shallow}
      >
        {chipContent}
      </LinkWrapper>
    ) : (
      chipContent
    );

    if (tooltip) {
      return <Tooltip trigger={chip} label={tooltip} />;
    }

    return chip;
  }
);

Citation.displayName = "Citation";

const CitationIndex = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ children, className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "s-z-10",
        "s-flex s-h-4 s-w-4 s-items-center s-justify-center s-rounded-full s-text-xs s-font-semibold",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});
CitationIndex.displayName = "CitationIndex";

const CITATION_GRID_VARIANTS = ["grid", "list"] as const;
type CitationGridVariantType = (typeof CITATION_GRID_VARIANTS)[number];

const citationGridVariants = cva("s-grid s-gap-2", {
  variants: {
    variant: {
      grid: "s-grid-cols-2 @xxs:s-grid-cols-3 @xs:s-grid-cols-4 @md:s-grid-cols-5 @lg:s-grid-cols-6",
      list: "s-flex s-flex-col s-gap-2",
    },
  },
  defaultVariants: {
    variant: "grid",
  },
});

interface CitationGridProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CitationGridVariantType;
}

const CitationGrid = React.forwardRef<HTMLDivElement, CitationGridProps>(
  ({ children, className, variant, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("s-min-w-60 s-space-x-1 s-@container", className)}
        {...props}
      >
        <div className={citationGridVariants({ variant })}>{children}</div>
      </div>
    );
  }
);
CitationGrid.displayName = "CitationGrid";

interface CitationCloseProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

const CitationClose = React.forwardRef<HTMLButtonElement, CitationCloseProps>(
  ({ className, onClick, ...props }, ref) => {
    return (
      <Button
        ref={ref}
        variant="ghost"
        size="mini"
        className={className}
        icon={XMarkIcon}
        onClick={(e) => {
          e.stopPropagation();
          onClick?.(e);
        }}
        {...props}
      />
    );
  }
);

CitationClose.displayName = "CitationClose";

interface CitationImageProps extends React.HTMLAttributes<HTMLDivElement> {
  imgSrc: string;
}

const CitationImage = React.forwardRef<HTMLDivElement, CitationImageProps>(
  ({ imgSrc, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "s-absolute s-inset-0",
          "s-bg-cover s-bg-center",
          "s-rounded-xl",
          "s-overflow-hidden",
          "[mask-image:radial-gradient(white,black)]",
          className
        )}
        style={{
          backgroundImage: `url(${imgSrc})`,
        }}
        {...props}
      >
        <div
          className={cn(
            "s-absolute s-inset-0",
            "s-z-0 s-h-full s-w-full",
            "s-bg-primary-100/80 dark:s-bg-primary-100-night/80",
            "s-backdrop-blur-sm",
            "s-transition s-duration-200",
            "group-hover:s-bg-primary-200/70 group-hover:s-backdrop-blur-none dark:group-hover:s-bg-primary-200-night/70",
            "group-active:s-bg-primary-100/60 dark:group-active:s-bg-primary-100-night/60"
          )}
        />
      </div>
    );
  }
);

CitationImage.displayName = "CitationImage";

const CitationIcons = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ children, className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "s-flex s-flex-row s-items-center s-justify-center",
        "s-gap-1 s-rounded-lg s-p-1 s-text-xs s-font-medium",
        "s-bg-muted-background dark:s-bg-muted-background-night",
        "s-text-muted-foreground dark:s-text-muted-foreground-night",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});
CitationIcons.displayName = "CitationIcons";

const CitationLoading = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "s-absolute s-inset-0 s-z-20 s-flex s-h-full s-w-full s-items-center s-justify-center s-rounded-xl s-backdrop-blur-sm",
        "s-bg-primary-100/80 dark:s-bg-primary-100-night/80",
        className
      )}
      {...props}
    >
      <Spinner variant="dark" size="md" />
    </div>
  );
});
CitationLoading.displayName = "CitationLoading";

interface CitationTitleProps extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

const CitationTitle = React.forwardRef<HTMLDivElement, CitationTitleProps>(
  ({ children, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "s-z-10",
          "s-line-clamp-1 s-overflow-hidden s-text-ellipsis s-break-all",
          "s-text-sm s-font-semibold",
          "s-text-foreground dark:s-text-foreground-night",
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
CitationTitle.displayName = "CitationTitle";

interface CitationDescriptionProps
  extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

const CitationDescription = React.forwardRef<
  HTMLDivElement,
  CitationDescriptionProps
>(({ children, className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "s-z-10",
        "s-line-clamp-1 s-overflow-hidden s-text-ellipsis",
        "s-text-xs s-font-normal",
        "s-text-muted-foreground dark:s-text-muted-foreground-night",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});
CitationDescription.displayName = "CitationDescription";

export {
  Citation,
  CitationClose,
  CitationDescription,
  CitationGrid,
  CitationIcons,
  CitationImage,
  CitationIndex,
  CitationTitle,
};
