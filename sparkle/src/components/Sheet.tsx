import * as SheetPrimitive from "@radix-ui/react-dialog";
import { FocusScope } from "@radix-ui/react-focus-scope";
import { cva } from "class-variance-authority";
import * as React from "react";

import { Button, Icon, ScrollArea } from "@sparkle/components";
import { XMarkIcon } from "@sparkle/icons/app";
import { cn } from "@sparkle/lib/utils";

const Sheet = SheetPrimitive.Root;

const SheetTrigger = SheetPrimitive.Trigger;

const SheetClose = SheetPrimitive.Close;

const SheetPortal = SheetPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    className={cn(
      "s-fixed s-inset-0 s-z-50",
      "s-bg-muted-foreground/75 dark:s-bg-muted-background-night/75",
      "data-[state=open]:s-animate-in data-[state=closed]:s-animate-out",
      "data-[state=closed]:s-fade-out-0 data-[state=open]:s-fade-in-0",
      className
    )}
    {...props}
    ref={ref}
  />
));
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName;

const SHEET_SIZES = ["md", "lg", "xl"] as const;

type SheetSizeType = (typeof SHEET_SIZES)[number];

const SHEET_SIDES = ["top", "bottom", "left", "right"] as const;

type SheetSideType = (typeof SHEET_SIDES)[number];

const sizeClasses: Record<SheetSizeType, string> = {
  md: "sm:s-max-w-md",
  lg: "sm:s-max-w-xl",
  xl: "sm:s-max-w-3xl",
};

const sheetVariants = cva(
  cn(
    "s-fixed s-z-50 s-overflow-hidden s-flex s-flex-col s-h-full s-w-full",
    "s-bg-background dark:s-bg-background-night",
    "s-transition s-ease-in-out data-[state=open]:s-animate-in data-[state=closed]:s-animate-out data-[state=closed]:s-duration-300 data-[state=open]:s-duration-500"
  ),
  {
    variants: {
      side: {
        top: cn(
          "s-inset-x-0 s-top-0 data-[state=closed]:s-slide-out-to-top data-[state=open]:s-slide-in-from-top",
          "s-border-b dark:s-border-border-night s-border-border"
        ),
        bottom: cn(
          "s-inset-x-0 s-bottom-0 data-[state=closed]:s-slide-out-to-bottom data-[state=open]:s-slide-in-from-bottom",
          "s-border-t dark:s-border-border-night s-border-border"
        ),
        left: cn(
          "s-inset-y-0 s-left-0 data-[state=closed]:s-slide-out-to-left data-[state=open]:s-slide-in-from-left",
          "s-border-r dark:s-border-border-night s-border-border"
        ),
        right: cn(
          "s-inset-y-0 s-right-0 data-[state=closed]:s-slide-out-to-right data-[state=open]:s-slide-in-from-right",
          "s-border-l dark:s-border-border-night s-border-border"
        ),
      },
      size: sizeClasses,
    },
    defaultVariants: {
      side: "right",
      size: "md",
    },
  }
);

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content> {
  size?: SheetSizeType;
  trapFocusScope?: boolean;
  side?: SheetSideType;
  preventAutoFocusOnClose?: boolean;
  preventAutoFocusOnOpen?: boolean;
  dataAnalytics?: string;
}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(
  (
    {
      className,
      children,
      size,
      side,
      trapFocusScope,
      preventAutoFocusOnClose = true,
      preventAutoFocusOnOpen = true,
      onCloseAutoFocus,
      onOpenAutoFocus,
      dataAnalytics,
      ...props
    },
    ref
  ) => {
    const handleCloseAutoFocus = React.useCallback(
      (event: Event) => {
        if (preventAutoFocusOnClose) {
          event.preventDefault();
        }
        onCloseAutoFocus?.(event);
      },
      [preventAutoFocusOnClose, onCloseAutoFocus]
    );

    const handleOpenAutoFocus = React.useCallback(
      (event: Event) => {
        if (preventAutoFocusOnOpen) {
          event.preventDefault();
        }
        onOpenAutoFocus?.(event);
      },
      [preventAutoFocusOnOpen, onOpenAutoFocus]
    );

    const onKeyDownCapture = React.useCallback(
      (e: React.KeyboardEvent<HTMLDivElement>) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          const root = e.currentTarget as HTMLElement;
          const target = root.querySelector<HTMLButtonElement>(
            '[data-sheet-save="true"]:not(:disabled)'
          );
          if (target) {
            e.preventDefault();
            target.click();
          }
        }
      },
      []
    );

    return (
      <SheetPortal>
        <SheetOverlay />
        <FocusScope trapped={trapFocusScope} asChild>
          <SheetPrimitive.Content
            ref={ref}
            className={cn(
              sheetVariants({ size, side }),
              className,
              "s-sheet s-text-foreground dark:s-text-foreground-night"
            )}
            onCloseAutoFocus={handleCloseAutoFocus}
            onOpenAutoFocus={handleOpenAutoFocus}
            onKeyDownCapture={onKeyDownCapture}
            data-analytics={dataAnalytics}
            {...props}
          >
            {children}
          </SheetPrimitive.Content>
        </FocusScope>
      </SheetPortal>
    );
  }
);
SheetContent.displayName = SheetPrimitive.Content.displayName;

interface SheetHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  hideButton?: boolean;
}

const SheetHeader = ({
  className,
  children,
  hideButton = false,
  ...props
}: SheetHeaderProps) => (
  <div
    className={cn(
      "s-z-50 s-flex s-flex-none s-flex-col s-gap-2 s-p-5 s-text-left",
      "s-bg-background dark:s-bg-background-night",
      className
    )}
    {...props}
  >
    {children}
    <SheetClose asChild className="s-absolute s-right-3">
      {!hideButton && <Button icon={XMarkIcon} variant="ghost" size="sm" />}
    </SheetClose>
  </div>
);
SheetHeader.displayName = "SheetHeader";

interface SheetContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  noScroll?: boolean;
}

const ScrollContainer = ({
  noScroll,
  className,
  children,
}: {
  noScroll?: boolean;
  className?: string;
  children: React.ReactNode;
}) => {
  if (noScroll) {
    return <div className={className}>{children}</div>;
  }
  return <ScrollArea className={className}>{children}</ScrollArea>;
};

const SheetContainer = ({
  children,
  noScroll,
  className,
}: SheetContainerProps) => {
  return (
    <ScrollContainer
      noScroll={noScroll}
      className={cn(
        "s-h-full s-w-full s-flex-grow",
        "s-border-t s-border-border/60 s-transition-all s-duration-300 dark:s-border-border-night/60"
      )}
    >
      <div
        className={cn(
          "s-relative s-flex s-h-full s-flex-col s-gap-5 s-px-5 s-pt-3 s-text-left s-text-sm s-text-foreground dark:s-text-foreground-night",
          className
        )}
      >
        {children}
      </div>
    </ScrollContainer>
  );
};
SheetContainer.displayName = "SheetContainer";

interface SheetFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  leftButtonProps?: React.ComponentProps<typeof Button>;
  rightButtonProps?: React.ComponentProps<typeof Button>;
  rightEndButtonProps?: React.ComponentProps<typeof Button>;
  sheetCloseClassName?: string;
}

const SheetFooter = ({
  className,
  children,
  leftButtonProps,
  rightButtonProps,
  rightEndButtonProps,
  sheetCloseClassName,
  ...props
}: SheetFooterProps) => {
  return (
    <div
      className={cn(
        "s-flex s-flex-none s-flex-col s-gap-2",
        "s-border-border dark:s-border-border-night",
        className
      )}
      {...props}
    >
      {children}
      <div className="s-flex s-flex-row s-gap-2 s-border-t s-border-border s-px-3 s-py-3 dark:s-border-border-night">
        {leftButtonProps &&
          (leftButtonProps.disabled ? (
            <Button {...leftButtonProps} />
          ) : (
            <SheetClose className={sheetCloseClassName} asChild>
              <Button {...leftButtonProps} />
            </SheetClose>
          ))}
        <div className="s-flex-grow" />
        {rightButtonProps &&
          (rightButtonProps.disabled ? (
            <Button data-sheet-save="true" {...rightButtonProps} />
          ) : (
            <SheetClose className={sheetCloseClassName} asChild>
              <Button data-sheet-save="true" {...rightButtonProps} />
            </SheetClose>
          ))}
        {rightEndButtonProps &&
          (rightEndButtonProps.disabled ? (
            <Button {...rightEndButtonProps} />
          ) : (
            <SheetClose className={sheetCloseClassName} asChild>
              <Button {...rightEndButtonProps} />
            </SheetClose>
          ))}
      </div>
    </div>
  );
};
SheetFooter.displayName = "SheetFooter";

interface SheetTitleProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title> {
  icon?: React.ComponentType;
}

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  SheetTitleProps
>(({ className, icon, ...props }, ref) => (
  <>
    {icon && <Icon visual={icon} size="lg" className="s-text-foreground" />}
    <SheetPrimitive.Title
      ref={ref}
      className={cn("s-heading-lg", className)}
      {...props}
    />
  </>
));
SheetTitle.displayName = SheetPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className={cn(
      "s-text-sm",
      "s-text-muted-foreground dark:s-text-muted-foreground-night",
      className
    )}
    {...props}
  />
));
SheetDescription.displayName = SheetPrimitive.Description.displayName;

export {
  Sheet,
  SheetClose,
  SheetContainer,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
};
