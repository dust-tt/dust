import * as SheetPrimitive from "@radix-ui/react-dialog";
import { cva } from "class-variance-authority";
import * as React from "react";

import { Button, ScrollArea } from "@sparkle/components";
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
      "s-fixed s-inset-0 s-z-50 s-bg-muted-foreground/75 data-[state=open]:s-animate-in data-[state=closed]:s-animate-out data-[state=closed]:s-fade-out-0 data-[state=open]:s-fade-in-0",
      className
    )}
    {...props}
    ref={ref}
  />
));
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName;

const SHEET_SIZES = ["md", "lg", "xl"] as const;

type SheetSizeType = (typeof SHEET_SIZES)[number];

const sizeClasses: Record<SheetSizeType, string> = {
  md: "sm:s-max-w-md",
  lg: "sm:s-max-w-xl",
  xl: "sm:s-max-w-3xl",
};

const sheetVariants = cva(
  "s-fixed s-z-50 s-overflow-hidden s-bg-background s-transition s-ease-in-out data-[state=open]:s-animate-in data-[state=closed]:s-animate-out data-[state=closed]:s-duration-300 data-[state=open]:s-duration-500 s-flex s-flex-col s-inset-y-0 s-right-0 s-h-full s-w-full data-[state=closed]:s-slide-out-to-right data-[state=open]:s-slide-in-from-right",
  {
    variants: {
      size: sizeClasses,
    },
    defaultVariants: {
      size: "md",
    },
  }
);

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content> {
  size?: SheetSizeType;
}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(({ className, children, size, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <SheetPrimitive.Content
      ref={ref}
      className={cn(sheetVariants({ size }), className)}
      {...props}
    >
      {children}
    </SheetPrimitive.Content>
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
      "s-z-50 s-flex s-flex-none s-flex-col s-gap-2 s-bg-background s-p-5 s-text-left s-shadow-tale",
      className
    )}
    {...props}
  >
    {children}
    <SheetClose asChild className="s-absolute s-right-3 s-top-4">
      {!hideButton && <Button icon={XMarkIcon} variant="ghost" size="sm" />}
    </SheetClose>
  </div>
);
SheetHeader.displayName = "SheetHeader";

const SheetContainer = ({ children }: React.HTMLAttributes<HTMLDivElement>) => (
  <ScrollArea className="s-w-full s-flex-grow">
    <div className="s-relative s-flex s-flex-col s-gap-2 s-p-5 s-text-left s-text-sm s-text-foreground">
      {children}
    </div>
  </ScrollArea>
);
SheetContainer.displayName = "SheetContainer";

interface SheetFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  leftButtonProps?: React.ComponentProps<typeof Button>;
  rightButtonProps?: React.ComponentProps<typeof Button>;
  sheetCloseClassName?: string;
}

const SheetFooter = ({
  className,
  children,
  leftButtonProps,
  rightButtonProps,
  sheetCloseClassName,
  ...props
}: SheetFooterProps) => (
  <div
    className={cn(
      "s-flex s-flex-none s-flex-row s-gap-2 s-border-t s-border-border s-px-3 s-py-3",
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
    {rightButtonProps &&
      (rightButtonProps.disabled ? (
        <Button {...rightButtonProps} />
      ) : (
        <SheetClose className={sheetCloseClassName} asChild>
          <Button {...rightButtonProps} />
        </SheetClose>
      ))}
    {children}
  </div>
);
SheetFooter.displayName = "SheetFooter";

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn("s-text-lg s-font-semibold s-text-foreground", className)}
    {...props}
  />
));
SheetTitle.displayName = SheetPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className={cn("s-text-sm s-text-muted-foreground", className)}
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
