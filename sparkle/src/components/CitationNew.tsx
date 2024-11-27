import React, { ReactNode } from "react";

import { Button, CardButton, Tooltip } from "@sparkle/components/";
import { XMarkIcon } from "@sparkle/icons";
import { cn } from "@sparkle/lib/utils";

interface CitationNewProps {
  children?: ReactNode;
  href?: string;
  index?: ReactNode;
  isBlinking?: boolean;
  isLoading?: boolean;
  onClose?: () => void;
  className?: string;
  tooltip?: string;
}

const CitationNew = React.forwardRef<HTMLDivElement, CitationNewProps>(
  (
    {
      children,
      href,
      isBlinking = false,
      isLoading,
      onClose,
      className,
      tooltip,
      ...props
    },
    ref
  ) => {
    const linkProps = href
      ? { href, target: "_blank", rel: "noopener noreferrer" }
      : {};

    const cardButton = (
      <CardButton
        ref={ref}
        variant="primary"
        size="md"
        className={cn(
          "s-min-w-48 s-relative s-flex s-aspect-[16/9] s-flex-none s-flex-col s-justify-end",
          isBlinking ? "s-animate-[bgblink_600ms_3]" : "",
          className
        )}
        {...linkProps}
        {...props}
      >
        {children}
      </CardButton>
    );
    return tooltip ? (
      <Tooltip trigger={cardButton} label={tooltip} />
    ) : (
      cardButton
    );
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
        "s-flex s-h-5 s-w-5 s-items-center s-justify-center s-rounded-full s-bg-purple-200 s-text-xs s-text-purple-900",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});
CitationNewIndex.displayName = "CitationNewIndex";

const CitationNewClose = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className }) => {
  return (
    <Button
      variant={"ghost"}
      size={"xs"}
      className={cn("s-absolute s-right-2 s-top-2", className)}
      icon={XMarkIcon}
    />
  );
});
CitationNewClose.displayName = "CitationNewClose";

const CitationNewIcons = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ children, className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn("s-flex s-items-center s-gap-2 s-pb-2", className)}
      {...props}
    >
      {children}
    </div>
  );
});
CitationNewIcons.displayName = "CitationNewIcons";

// Title component
interface CitationNewTitleProps extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  size?: "sm" | "md"; // Add size prop
}

const CitationNewTitle = React.forwardRef<
  HTMLDivElement,
  CitationNewTitleProps
>(({ children, className, size = "md", ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "s-line-clamp-1 s-text-sm s-text-element-800",
        size === "sm" ? "s-font-bold" : "s-font-semibold",
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
        "s-line-clamp-2 s-text-xs s-font-normal s-text-element-700",
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
  CitationNewIndex,
  CitationNewTitle,
};
