import * as DialogPrimitive from "@radix-ui/react-dialog";
import { FocusScope } from "@radix-ui/react-focus-scope";
import { cva } from "class-variance-authority";
import * as React from "react";

import {
  Button,
  ButtonProps,
  ScrollArea,
  Separator,
} from "@sparkle/components";
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
      "s-bg-muted-foreground/75 dark:s-bg-muted-background-night/75",
      className
    )}
    {...props}
    ref={ref}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DIALOG_SIZES = ["md", "lg", "xl", "2xl", "full"] as const;
type DialogSizeType = (typeof DIALOG_SIZES)[number];

const DIALOG_HEIGHTS = ["md", "lg", "xl", "2xl"] as const;
type DialogHeightType = (typeof DIALOG_HEIGHTS)[number];

const sizeClasses: Record<DialogSizeType, string> = {
  md: "sm:s-max-w-md",
  lg: "sm:s-max-w-xl",
  xl: "sm:s-max-w-3xl",
  "2xl": "sm:s-max-w-5xl",
  full: "sm:s-max-w-full sm:s-h-full",
};

const heightClasses: Record<DialogHeightType, string> = {
  md: "s-max-h-[90vh] sm:s-h-md",
  lg: "s-max-h-[90vh] sm:s-h-lg",
  xl: "s-max-h-[90vh] sm:s-h-xl",
  "2xl": "s-max-h-[90vh] sm:s-h-2xl",
};

const dialogVariants = cva(
  cn(
    "s-fixed s-left-[50%] s-top-[50%] s-z-50 s-overflow-hidden s-translate-x-[-50%] s-translate-y-[-50%] s-duration-200 data-[state=open]:s-animate-in data-[state=closed]:s-animate-out data-[state=closed]:s-fade-out-0 data-[state=open]:s-fade-in-0 data-[state=closed]:s-zoom-out-95 data-[state=open]:s-zoom-in-95 data-[state=closed]:s-slide-out-to-left-1/2 data-[state=closed]:s-slide-out-to-top-[48%] data-[state=open]:s-slide-in-from-left-1/2 data-[state=open]:s-slide-in-from-top-[48%]",
    "s-rounded-2xl s-flex s-flex-col s-w-full s-border s-border s-shadow-lg s-sm:rounded-lg",
    "s-bg-background dark:s-bg-background-night",
    "s-border-border dark:s-border-border-night"
  ),
  {
    variants: {
      size: sizeClasses,
      height: heightClasses,
    },
    defaultVariants: {
      size: "md",
    },
  }
);

interface DialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  size?: DialogSizeType;
  height?: DialogHeightType;
  trapFocusScope?: boolean;
  isAlertDialog?: boolean;
  preventAutoFocusOnClose?: boolean;
  mountPortalContainer?: HTMLElement;
  dataAnalytics?: string;
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(
  (
    {
      className,
      children,
      size,
      height,
      trapFocusScope,
      isAlertDialog,
      preventAutoFocusOnClose = true,
      onCloseAutoFocus,
      mountPortalContainer,
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

    return (
      <DialogPortal container={mountPortalContainer}>
        <DialogOverlay />
        <FocusScope trapped={trapFocusScope} asChild>
          <DialogPrimitive.Content
            ref={ref}
            className={cn(dialogVariants({ size, height }), className)}
            onInteractOutside={
              isAlertDialog
                ? (e) => e.preventDefault()
                : props.onInteractOutside
            }
            onCloseAutoFocus={handleCloseAutoFocus}
            data-analytics={dataAnalytics}
            {...props}
          >
            {children}
          </DialogPrimitive.Content>
        </FocusScope>
      </DialogPortal>
    );
  }
);
DialogContent.displayName = DialogPrimitive.Content.displayName;

interface NewDialogHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  buttonSize?: ButtonProps["size"];
  buttonVariant?: ButtonProps["variant"];
  hideButton?: boolean;
}

const DialogHeader = ({
  className,
  children,
  buttonSize = "mini",
  buttonVariant = "ghost",
  hideButton = false,
  ...props
}: NewDialogHeaderProps) => (
  <div
    className={cn(
      "s-sticky s-top-0 s-z-50 s-flex s-flex-none s-flex-col s-gap-0 s-bg-background s-px-5 s-py-4 s-text-left dark:s-bg-background-night",
      className
    )}
    {...props}
  >
    {children}
    {!hideButton && (
      <DialogClose asChild className="s-absolute s-right-3 s-top-3">
        <Button icon={XMarkIcon} variant={buttonVariant} size={buttonSize} />
      </DialogClose>
    )}
  </div>
);
DialogHeader.displayName = "DialogHeader";

interface DialogContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  fixedContent?: React.ReactNode;
}

const DialogContainer = ({
  children,
  fixedContent,
  className,
}: DialogContainerProps) => {
  const contentStyles = cn(
    "s-copy-base s-px-5 s-py-4 s-text-foreground dark:s-text-foreground-night"
  );

  const scrollableContent = (
    <ScrollArea className="s-w-full s-flex-grow">
      <div
        className={cn(
          contentStyles,
          "s-relative s-flex s-flex-col s-gap-2 s-text-left",
          className
        )}
      >
        {children}
      </div>
    </ScrollArea>
  );

  if (fixedContent) {
    return (
      <div className="s-flex s-flex-grow s-flex-col s-overflow-hidden">
        <div className={cn(contentStyles, "s-flex-none")}>{fixedContent}</div>
        <Separator />
        {scrollableContent}
      </div>
    );
  }

  return scrollableContent;
};
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
  <div className="s-flex s-flex-none s-flex-col s-gap-0">
    <div
      className={cn(
        "s-flex s-flex-none s-flex-row s-justify-end s-gap-2 s-px-3 s-pb-3",
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
