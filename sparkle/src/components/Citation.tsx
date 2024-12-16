import React, { ReactNode } from "react";

import {
  Button,
  CardButton,
  CardButtonProps,
  Spinner,
  Tooltip,
} from "@sparkle/components/";
import { XMarkIcon } from "@sparkle/icons";
import { cn } from "@sparkle/lib/utils";

type CitationProps = CardButtonProps & {
  children: React.ReactNode;
  isLoading?: boolean;
  tooltip?: string;
};

const Citation = React.forwardRef<HTMLDivElement, CitationProps>(
  (
    { children, variant = "primary", isLoading, className, tooltip, ...props },
    ref
  ) => {
    const cardButton = (
      <CardButton
        ref={ref}
        variant={variant}
        size="md"
        className={cn(
          "s-relative s-flex s-aspect-[2/1] s-min-w-[140px] s-flex-none s-flex-col s-justify-end",
          className
        )}
        {...props}
      >
        {children}
        {isLoading && <CitationLoading />}
      </CardButton>
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
        "s-flex s-h-4 s-w-4 s-items-center s-justify-center s-rounded-full s-bg-primary-600 s-text-xs s-font-medium s-text-primary-200",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});
CitationIndex.displayName = "CitationIndex";

const CitationGrid = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ children, className, ...props }, ref) => {
  return (
    <div ref={ref} className={cn("s-@container", className)} {...props}>
      <div className="s-grid s-grid-cols-1 s-gap-2 @sm:s-grid-cols-2 @xl:s-grid-cols-3 @2xl:s-grid-cols-4 @3xl:s-grid-cols-5">
        {children}
      </div>
    </div>
  );
});
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
        size="xs"
        className={cn(
          "s-z-10",
          "s-absolute s-right-2 s-top-2 s-z-10",
          className
        )}
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
          className
        )}
        style={{
          backgroundImage: `url(${imgSrc})`,
        }}
        {...props}
      >
        <div className="s-z-0 s-h-full s-w-full s-bg-primary-100/80 s-transition s-duration-200 group-hover:s-bg-primary-200/70 group-active:s-bg-primary-100/60" />
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
        "s-z-10",
        "s-flex s-items-center s-gap-2 s-pb-1",
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
        "s-absolute s-inset-0 s-z-20 s-flex s-h-full s-w-full s-items-center s-justify-center s-bg-primary-100/80",
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
          "s-line-clamp-1 s-overflow-hidden s-text-ellipsis",
          "s-text-sm s-font-medium s-text-foreground",
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
        "s-text-xs s-font-normal s-text-muted-foreground",
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
