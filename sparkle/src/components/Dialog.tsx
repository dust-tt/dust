import * as DialogPrimitive from "@radix-ui/react-dialog";
import { FocusScope } from "@radix-ui/react-focus-scope";
import { cva } from "class-variance-authority";
import * as React from "react";

import { Button, ScrollArea } from "@sparkle/components";
import { XMarkIcon } from "@sparkle/icons";
import { cn } from "@sparkle/lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;
const DialogPortal = DialogPrimitive.Portal;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    className={cn(
      "s-fixed s-inset-0 s-z-50 data-[state=open]:s-animate-in data-[state=closed]:s-animate-out data-[state=closed]:s-fade-out-0 data-[state=open]:s-fade-in-0",
      "dark:s-bg-muted-foreground-night/75 s-bg-muted-foreground/75",
      className
    )}
    {...props}
    ref={ref}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DIALOG_SIZES = ["md", "lg", "xl"] as const;
type DialogSizeType = (typeof DIALOG_SIZES)[number];

const sizeClasses: Record<DialogSizeType, string> = {
  md: "sm:s-max-w-md",
  lg: "sm:s-max-w-xl",
  xl: "sm:s-max-w-3xl",
};

const dialogVariants = cva(
  cn(
    "s-fixed s-left-[50%] s-top-[50%] s-z-50 s-grid s-w-full s-overflow-hidden s-rounded-2xl s-border s-border-border s-translate-x-[-50%] s-translate-y-[-50%] s-border s-p-2 s-shadow-lg s-duration-200 data-[state=open]:s-animate-in data-[state=closed]:s-animate-out data-[state=closed]:s-fade-out-0 data-[state=open]:s-fade-in-0 data-[state=closed]:s-zoom-out-95 data-[state=open]:s-zoom-in-95 data-[state=closed]:s-slide-out-to-left-1/2 data-[state=closed]:s-slide-out-to-top-[48%] data-[state=open]:s-slide-in-from-left-1/2 data-[state=open]:s-slide-in-from-top-[48%] s-sm:rounded-lg",
    "s-bg-background dark:s-bg-background-night"
  ),
  {
    variants: {
      size: sizeClasses,
    },
    defaultVariants: {
      size: "md",
    },
  }
);

interface DialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  size?: DialogSizeType;
  trapFocusScope?: boolean;
  isAlertDialog?: boolean;
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(
  (
    { className, children, size, trapFocusScope, isAlertDialog, ...props },
    ref
  ) => (
    <DialogPortal>
      <DialogOverlay />
      <FocusScope trapped={trapFocusScope} asChild>
        <DialogPrimitive.Content
          ref={ref}
          className={cn(dialogVariants({ size }), className)}
          onInteractOutside={
            isAlertDialog ? (e) => e.preventDefault() : props.onInteractOutside
          }
          {...props}
        >
          {children}
        </DialogPrimitive.Content>
      </FocusScope>
    </DialogPortal>
  )
);
DialogContent.displayName = DialogPrimitive.Content.displayName;

interface NewDialogHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  hideButton?: boolean;
}

const DialogHeader = ({
  className,
  children,
  hideButton = false,
  ...props
}: NewDialogHeaderProps) => (
  <div
    className={cn(
      "s-z-50 s-flex s-flex-none s-flex-col s-gap-0 s-p-5 s-text-left",
      className
    )}
    {...props}
  >
    {children}
    <DialogClose asChild className="s-absolute s-right-3 s-top-3">
      {!hideButton && <Button icon={XMarkIcon} variant="ghost" size="sm" />}
    </DialogClose>
  </div>
);
DialogHeader.displayName = "DialogHeader";

const DialogContainer = ({
  children,
}: React.HTMLAttributes<HTMLDivElement>) => (
  <ScrollArea className="s-w-full s-flex-grow">
    <div
      className={cn(
        "s-relative s-flex s-flex-col s-gap-2 s-p-5 s-text-left s-text-sm",
        "dark:s-text-foreground-night s-text-foreground"
      )}
    >
      {children}
    </div>
  </ScrollArea>
);
DialogContainer.displayName = "DialogContainer";

interface DialogFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  leftButtonProps?: React.ComponentProps<typeof Button>;
  rightButtonProps?: React.ComponentProps<typeof Button>;
  dialogCloseClassName?: string;
}

const DialogFooter = ({
  className,
  children,
  leftButtonProps,
  rightButtonProps,
  dialogCloseClassName,
  ...props
}: DialogFooterProps) => (
  <div
    className={cn(
      "s-flex s-flex-none s-flex-row s-justify-end s-gap-2 s-px-3 s-py-3",
      className
    )}
    {...props}
  >
    {leftButtonProps &&
      (leftButtonProps.disabled ? (
        <Button {...leftButtonProps} />
      ) : (
        <DialogClose className={dialogCloseClassName} asChild>
          <Button {...leftButtonProps} />
        </DialogClose>
      ))}
    {rightButtonProps &&
      (rightButtonProps.disabled ? (
        <Button {...rightButtonProps} />
      ) : (
        <DialogClose className={dialogCloseClassName} asChild>
          <Button {...rightButtonProps} />
        </DialogClose>
      ))}
    {children}
  </div>
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "s-text-lg s-font-semibold",
      "dark:s-text-foreground-night s-text-foreground",
      className
    )}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn(
      "s-text-sm",
      "dark:s-text-muted-foreground-night s-text-muted-foreground",
      className
    )}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogClose,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
