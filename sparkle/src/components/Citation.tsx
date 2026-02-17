/** biome-ignore-all lint/suspicious/noImportCycles: I'm too lazy to fix that now */

import {
  Button,
  Card,
  type CardProps,
  Spinner,
  Tooltip,
} from "@sparkle/components/";
import { ImagePreview } from "@sparkle/components/ImagePreview";
import { XMarkIcon } from "@sparkle/icons/app";
import { cn } from "@sparkle/lib/utils";
import { cva } from "class-variance-authority";
import React, { type ReactNode } from "react";

const citationVariants = cva(
  "s-relative s-flex s-min-w-24 s-flex-none s-flex-col s-overflow-hidden",
  {
    variants: {
      hasImage: {
        // Use min() to maintain aspect ratio in grid mode (8% of width) while capping
        // padding at 3 (0.75rem) for list mode to prevent excessive top padding on wide items.
        false: "s-pt-[min(8%,theme(spacing.3))]",
        true: "s-border-0 s-p-0",
      },
    },
    defaultVariants: {
      hasImage: false,
    },
  }
);

type CitationProps = CardProps & {
  children: React.ReactNode;
  isLoading?: boolean;
  tooltip?: string;
};

const Citation = React.forwardRef<HTMLDivElement, CitationProps>(
  (
    {
      children,
      variant = "secondary",
      isLoading,
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
        {!hasDescription && !hasImage && (
          <CitationDescription>&nbsp;</CitationDescription>
        )}
      </>
    );
    const cardButton = (
      <Card
        ref={ref}
        variant={variant}
        size="sm"
        className={cn(citationVariants({ hasImage }), className)}
        {...props}
      >
        {contentWithDescription}
        {isLoading && <CitationLoading />}
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
        "s-z-10",
        "s-heading-xs s-flex s-h-4 s-w-4 s-items-center s-justify-center s-rounded-full",
        "s-text-primary-200 dark:s-text-primary-200-night",
        "s-bg-primary-600 dark:s-bg-primary-600-night",
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
      list: "s-grid-cols-1",
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
        className={cn("s-min-w-60 s-@container", className)}
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
        size="icon"
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

interface CitationImageProps {
  imgSrc: string;
  alt?: string;
  title?: string;
  downloadUrl?: string;
  isLoading?: boolean;
  onClose?: () => void;
  className?: string;
}

const CitationImage = React.forwardRef<HTMLDivElement, CitationImageProps>(
  ({ imgSrc, alt, title, downloadUrl, isLoading, onClose, className }, ref) => {
    return (
      <ImagePreview
        ref={ref}
        imgSrc={imgSrc}
        alt={alt}
        title={title}
        downloadUrl={downloadUrl}
        isLoading={isLoading}
        onClose={onClose ? () => onClose() : undefined}
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
  return (
    <div
      ref={ref}
      className={cn("s-flex s-items-center s-gap-2 s-pb-1", className)}
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
      <Spinner size="md" />
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
          "s-heading-sm",
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
