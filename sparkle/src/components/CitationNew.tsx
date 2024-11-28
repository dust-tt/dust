import React, { ReactNode } from "react";

import {
  Button,
  ButtonProps,
  CardButton,
  Spinner,
  Tooltip,
} from "@sparkle/components/";
import { CardButtonVariantType } from "@sparkle/components/CardButton";
import { XMarkIcon } from "@sparkle/icons";
import { cn } from "@sparkle/lib/utils";

interface CitationNewProps extends Omit<ButtonProps, "variant" | "size"> {
  children: React.ReactNode;
  href?: string;
  isLoading?: boolean;
  tooltip?: string;
  target?: string;
  rel?: string;
  replace?: boolean;
  shallow?: boolean;
  variant?: CardButtonVariantType;
}

const CitationNew = React.forwardRef<HTMLDivElement, CitationNewProps>(
  (
    {
      children,
      variant = "primary",
      href,
      isLoading,
      onClick,
      className,
      tooltip,
      target = "_blank",
      rel = "noopener noreferrer",
      replace,
      shallow,
      ...props
    },
    ref
  ) => {
    const linkProps = href
      ? {
          href,
          target,
          rel,
          replace,
          shallow,
        }
      : {};

    const cardButton = (
      <CardButton
        ref={ref}
        variant={variant}
        size="md"
        onClick={onClick}
        className={cn(
          "s-group s-relative s-flex s-aspect-[2/1] s-min-w-[168px] s-flex-none s-flex-col s-justify-end",
          className
        )}
        {...linkProps}
        {...props}
      >
        {children}
        {isLoading && <CitationNewLoading />}
      </CardButton>
    );

    if (tooltip) {
      return <Tooltip trigger={cardButton} label={tooltip} />;
    }

    return cardButton;
  }
);

CitationNew.displayName = "CitationNew";

const CitationNewIndex = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ children, className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "s-z-10",
        "s-flex s-h-4 s-w-4 s-items-center s-justify-center s-rounded-full s-bg-primary-600 s-text-xs s-font-medium s-text-foreground s-text-primary-200",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});
CitationNewIndex.displayName = "CitationNewIndex";

interface CitationNewCloseProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

const CitationNewClose = React.forwardRef<
  HTMLButtonElement,
  CitationNewCloseProps
>(({ className, onClick, ...props }, ref) => {
  return (
    <Button
      ref={ref}
      variant="ghost"
      size="xs"
      className={cn("s-z-10", "s-absolute s-right-2 s-top-2 s-z-10", className)}
      icon={XMarkIcon}
      onClick={onClick}
      onMouseEnter={(e) => {
        e.stopPropagation();
        props.onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        e.stopPropagation();
        props.onMouseLeave?.(e);
      }}
      {...props}
    />
  );
});

CitationNewClose.displayName = "CitationNewClose";

interface CitationNewImageProps extends React.HTMLAttributes<HTMLDivElement> {
  imgSrc: string;
}

const CitationNewImage = React.forwardRef<
  HTMLDivElement,
  CitationNewImageProps
>(({ imgSrc, className, ...props }, ref) => {
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
});

CitationNewImage.displayName = "CitationNewImage";

const CitationNewIcons = React.forwardRef<
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
CitationNewIcons.displayName = "CitationNewIcons";

CitationNewImage.displayName = "CitationNewImage";

const CitationNewLoading = React.forwardRef<
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
CitationNewLoading.displayName = "CitationNewLoading";

interface CitationNewTitleProps extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

const CitationNewTitle = React.forwardRef<
  HTMLDivElement,
  CitationNewTitleProps
>(({ children, className, ...props }, ref) => {
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
});
CitationNewTitle.displayName = "CitationNewTitle";

// Description component
interface CitationNewDescriptionProps
  extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

const CitationNewDescription = React.forwardRef<
  HTMLDivElement,
  CitationNewDescriptionProps
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
CitationNewDescription.displayName = "CitationNewDescription";

export {
  CitationNew,
  CitationNewClose,
  CitationNewDescription,
  CitationNewIcons,
  CitationNewImage,
  CitationNewIndex,
  CitationNewTitle,
};
