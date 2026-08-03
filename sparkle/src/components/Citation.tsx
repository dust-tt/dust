import { Button } from "@sparkle/components/Button";
import { Card, type CardProps } from "@sparkle/components/Card";
import { ImagePreview } from "@sparkle/components/ImagePreview";
import { Spinner } from "@sparkle/components/Spinner";
import { Tooltip } from "@sparkle/components/Tooltip";
import { XClose } from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib/utils";
import { cva } from "class-variance-authority";
import React, { type ReactNode, useMemo } from "react";

const CitationContext = React.createContext<{ compact: boolean }>({
  compact: false,
});

const citationVariants = cva(
  "relative flex min-w-24 flex-none overflow-hidden",
  {
    variants: {
      hasImage: {
        // Use min() to maintain aspect ratio in grid mode (8% of width) while capping
        // padding at 3 (0.75rem) for list mode to prevent excessive top padding on wide items.
        false: "pt-[min(8%,theme(spacing.3))]",
        true: "border-0 p-0",
      },
      compact: {
        true: "flex-row flex-wrap items-center gap-x-2",
        false: "flex-col",
      },
    },
    defaultVariants: {
      hasImage: false,
      compact: false,
    },
  }
);

type CitationProps = CardProps & {
  children: React.ReactNode;
  compact?: boolean;
  isLoading?: boolean;
  loadingLabel?: React.ReactNode;
  tooltip?: string;
};

const Citation = React.forwardRef<HTMLDivElement, CitationProps>(
  (
    {
      children,
      compact = false,
      variant = "secondary",
      isLoading,
      loadingLabel,
      className,
      tooltip,
      ...props
    },
    ref
  ) => {
    const { hasDescription, hasImage } = React.useMemo(() => {
      const childrenArray = React.Children.toArray(children);
      return {
        hasDescription: childrenArray.some(
          (child) =>
            React.isValidElement(child) && child.type === CitationDescription
        ),
        hasImage: childrenArray.some(
          (child) => React.isValidElement(child) && child.type === CitationImage
        ),
      };
    }, [children]);

    // IMPORTANT: The order of elements is crucial for event handling.
    // The CitationDescription must always come after other elements to ensure
    // proper event propagation (especially for the close button's click events).
    // If auto-inserting a description, it must be appended after children.
    // Skip auto-insertion for CitationImage children since they're self-contained.
    const contentWithDescription = (
      <>
        {children}
        {!hasDescription && !hasImage && !compact && (
          <CitationDescription>&nbsp;</CitationDescription>
        )}
      </>
    );
    const citationContextValue = useMemo(() => ({ compact }), [compact]);

    const cardButton = (
      <Card
        ref={ref}
        variant={variant}
        size="sm"
        className={cn(citationVariants({ hasImage, compact }), className)}
        {...props}
      >
        <CitationContext.Provider value={citationContextValue}>
          {contentWithDescription}
        </CitationContext.Provider>
        {isLoading && <CitationLoading label={loadingLabel} />}
      </Card>
    );

    if (tooltip) {
      return <Tooltip trigger={cardButton} label={tooltip} />;
    }

    return cardButton;
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
        "z-10",
        "heading-xs flex h-4 w-4 items-center justify-center rounded-full",
        "text-primary-200",
        "bg-primary-600",
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

const citationGridVariants = cva("grid gap-2", {
  variants: {
    variant: {
      grid: "grid-cols-2 @xxs:grid-cols-3 @xs:grid-cols-4 @md:grid-cols-5 @lg:grid-cols-6",
      list: "grid-cols-1",
    },
    reversed: {
      true: "rotate-180 [&>*]:rotate-180",
      false: "",
    },
  },
  defaultVariants: {
    variant: "grid",
    reversed: false,
  },
});

interface CitationGridProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CitationGridVariantType;
  reversed?: boolean;
}

const CitationGrid = React.forwardRef<HTMLDivElement, CitationGridProps>(
  ({ children, className, variant, reversed, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("min-w-60 @container", className)}
        {...props}
      >
        <div className={citationGridVariants({ variant, reversed })}>
          {children}
        </div>
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
        size="icon"
        className={className}
        icon={XClose}
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

interface CitationImageProps {
  imgSrc: string;
  alt?: string;
  title?: string;
  downloadUrl?: string;
  isLoading?: boolean;
  onClose?: () => void;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
}

const CitationImage = React.forwardRef<HTMLDivElement, CitationImageProps>(
  (
    { imgSrc, alt, title, downloadUrl, isLoading, onClose, onClick, className },
    ref
  ) => {
    return (
      <ImagePreview
        ref={ref}
        imgSrc={imgSrc}
        alt={alt}
        title={title}
        downloadUrl={downloadUrl}
        isLoading={isLoading}
        onClose={onClose ? () => onClose() : undefined}
        onClick={onClick}
        className={className}
        variant="embedded"
        titlePosition="bottom"
      />
    );
  }
);

CitationImage.displayName = "CitationImage";

const CitationIcons = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ children, className, ...props }, ref) => {
  const { compact } = React.useContext(CitationContext);
  return (
    <div
      ref={ref}
      className={cn("flex items-center gap-2", !compact && "pb-1", className)}
      {...props}
    >
      {children}
    </div>
  );
});
CitationIcons.displayName = "CitationIcons";

const CitationLoading = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { label?: React.ReactNode }
>(({ className, label, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "absolute inset-0 z-20 flex h-full w-full flex-col items-center justify-center gap-1 rounded-xl backdrop-blur-sm",
        "bg-primary-100/80",
        className
      )}
      {...props}
    >
      <Spinner size="md" />
      {label != null && (
        <span className="heading-xs font-mono text-muted-foreground">
          {label}
        </span>
      )}
    </div>
  );
});
CitationLoading.displayName = "CitationLoading";

interface CitationTitleProps extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

const CitationTitle = React.forwardRef<HTMLDivElement, CitationTitleProps>(
  ({ children, className, ...props }, ref) => {
    const { compact } = React.useContext(CitationContext);
    return (
      <div
        ref={ref}
        className={cn(
          "z-10",
          "line-clamp-1 overflow-hidden text-ellipsis break-all",
          "heading-sm",
          "text-foreground",
          compact && "flex-1 min-w-0",
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
  const { compact } = React.useContext(CitationContext);
  return (
    <div
      ref={ref}
      className={cn(
        "z-10",
        "line-clamp-1 overflow-hidden text-ellipsis",
        "text-xs font-normal",
        "text-muted-foreground",
        compact && "basis-full",
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
