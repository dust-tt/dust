import * as DialogPrimitive from "@radix-ui/react-dialog";
import { FocusScope } from "@radix-ui/react-focus-scope";
import { cva } from "class-variance-authority";
import * as React from "react";

import { Button, Checkbox, ScrollArea } from "@sparkle/components";
import { XMarkIcon } from "@sparkle/icons/app";
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
      "s-bg-muted-foreground/75 dark:s-bg-muted-foreground-night/75",
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
    "s-fixed s-left-[50%] s-top-[50%] s-z-50 s-overflow-hidden s-translate-x-[-50%] s-translate-y-[-50%] s-duration-200 data-[state=open]:s-animate-in data-[state=closed]:s-animate-out data-[state=closed]:s-fade-out-0 data-[state=open]:s-fade-in-0 data-[state=closed]:s-zoom-out-95 data-[state=open]:s-zoom-in-95 data-[state=closed]:s-slide-out-to-left-1/2 data-[state=closed]:s-slide-out-to-top-[48%] data-[state=open]:s-slide-in-from-left-1/2 data-[state=open]:s-slide-in-from-top-[48%]",
    "s-rounded-2xl s-grid s-w-full s-border s-border s-shadow-lg s-sm:rounded-lg",
    "s-bg-background dark:s-bg-background-night",
    "s-border-border dark:s-border-border-night"
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
      "s-z-50 s-flex s-flex-none s-flex-col s-gap-0 s-px-5 s-py-4 s-text-left",
      className
    )}
    {...props}
  >
    {children}
    <DialogClose asChild className="s-absolute s-right-3 s-top-3">
      {!hideButton && <Button icon={XMarkIcon} variant="ghost" size="mini" />}
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
        "s-copy-base s-relative s-flex s-flex-col s-gap-2 s-px-5 s-py-4 s-text-left",
        "s-text-foreground dark:s-text-foreground-night"
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
  permanentValidation?: {
    label: string;
    checked: boolean;
    onChange: (event: React.FormEvent<HTMLButtonElement>) => void;
  };
}

const DialogFooter = ({
  className,
  children,
  leftButtonProps,
  rightButtonProps,
  dialogCloseClassName,
  permanentValidation,
  ...props
}: DialogFooterProps) => (
  <div className="s-flex s-flex-col s-gap-0">
    {permanentValidation && (
      <div className="s-flex s-flex-row s-items-center s-gap-2 s-px-5 s-pt-3">
        <Checkbox
          checked={permanentValidation.checked}
          onChange={permanentValidation.onChange}
        />
        <label className="s-copy-sm s-text-foreground dark:s-text-foreground-night">
          <strong>{permanentValidation.label}</strong>
        </label>
      </div>
    )}
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
  </div>
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title> & {
    visual?: React.ReactNode;
  }
>(({ className, visual, children, ...props }, ref) => (
  <div className="s-flex s-flex-row s-items-center s-gap-2 s-pt-1">
    {visual}
    <DialogPrimitive.Title
      ref={ref}
      className={cn(
        "s-heading-lg",
        "s-text-foreground dark:s-text-foreground-night",
        className
      )}
      {...props}
    >
      {children}
    </DialogPrimitive.Title>
  </div>
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn(
      "s-copy-sm",
      "s-text-muted-foreground dark:s-text-muted-foreground-night",
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
