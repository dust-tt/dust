import * as SheetPrimitive from "@radix-ui/react-dialog";
import { FocusScope } from "@radix-ui/react-focus-scope";
import { cva } from "class-variance-authority";
import * as React from "react";

import { Button, Icon, ScrollArea } from "@sparkle/components";
import { XMarkIcon } from "@sparkle/icons";
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
      "s-bg-muted-foreground/75 dark:s-bg-muted-foreground-night/75",
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
}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(({ className, children, size, side, trapFocusScope, ...props }, ref) => (
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
        {...props}
      >
        {children}
      </SheetPrimitive.Content>
    </FocusScope>
  </SheetPortal>
));
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

const SheetContainer = ({ children }: React.HTMLAttributes<HTMLDivElement>) => {
  return (
    <ScrollArea
      className={cn(
        "s-w-full s-flex-grow",
        "s-border-t s-border-border-dark/60 s-transition-all s-duration-300 dark:s-border-border-dark-night/60"
      )}
    >
      <div className="s-relative s-flex s-flex-col s-gap-5 s-p-5 s-text-left s-text-sm s-text-foreground dark:s-text-foreground-night">
        {children}
      </div>
    </ScrollArea>
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
}: SheetFooterProps) => (
  <div
    className={cn(
      "s-flex s-flex-none s-flex-row s-gap-2 s-border-t s-px-3 s-py-3",
      "s-border-border dark:s-border-border-night",
      className
    )}
    {...props}
  >
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
        <Button {...rightButtonProps} />
      ) : (
        <SheetClose className={sheetCloseClassName} asChild>
          <Button {...rightButtonProps} />
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
    {children}
  </div>
);
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
    {icon && <Icon visual={icon} size="lg" />}
    <SheetPrimitive.Title
      ref={ref}
      className={cn("s-text-lg s-font-semibold", className)}
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
