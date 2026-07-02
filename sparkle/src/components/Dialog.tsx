import * as DialogPrimitive from "@radix-ui/react-dialog";
import { FocusScope } from "@radix-ui/react-focus-scope";
import { Button, type ButtonProps } from "@sparkle/components/Button";
import { ScrollArea } from "@sparkle/components/ScrollArea";
import { Separator } from "@sparkle/components/Separator";
import { XClose } from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib/utils";
import { cva } from "class-variance-authority";
import * as React from "react";

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
      "fixed inset-0 z-50 duration-200 ease-emphasized data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:duration-150 motion-reduce:animate-none",
      "bg-muted-foreground/75 dark:bg-muted-background/75",
      className
    )}
    {...props}
    ref={ref}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DIALOG_SIZES = ["md", "lg", "xl", "2xl", "full", "fit"] as const;
type DialogSizeType = (typeof DIALOG_SIZES)[number];

const DIALOG_HEIGHTS = ["md", "lg", "xl", "2xl"] as const;
type DialogHeightType = (typeof DIALOG_HEIGHTS)[number];

const sizeClasses: Record<DialogSizeType, string> = {
  md: "sm:max-w-md",
  lg: "sm:max-w-xl",
  xl: "sm:max-w-3xl",
  "2xl": "sm:max-w-5xl",
  full: "sm:max-w-full sm:h-full",
  fit: "sm:max-w-[90vw] w-fit",
};

const heightClasses: Record<DialogHeightType, string> = {
  md: "sm:h-md",
  lg: "sm:h-lg",
  xl: "sm:h-xl",
  "2xl": "sm:h-2xl",
};

const DIALOG_VARIANTS = ["default", "command"] as const;
type DialogVariantType = (typeof DIALOG_VARIANTS)[number];

const variantClasses: Record<DialogVariantType, string> = {
  default: cn(
    "top-[50%] translate-y-[-50%] duration-200 ease-emphasized data-[state=closed]:duration-150 motion-reduce:animate-none",
    "data-[state=open]:animate-in data-[state=closed]:animate-out",
    "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
    "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
  ),
  command: "top-[20%]",
};

const dialogVariants = cva(
  cn(
    "fixed left-[50%] z-50 overflow-hidden translate-x-[-50%]",
    "rounded-2xl flex flex-col w-full max-w-[calc(100vw-2rem)] border border shadow-lg",
    "bg-modal-background",
    "border-border",
    "max-h-[90vh]"
  ),
  {
    variants: {
      size: sizeClasses,
      height: heightClasses,
      variant: variantClasses,
    },
    defaultVariants: {
      size: "md",
      variant: "default",
    },
  }
);

interface DialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  size?: DialogSizeType;
  height?: DialogHeightType;
  variant?: DialogVariantType;
  trapFocusScope?: boolean;
  isAlertDialog?: boolean;
  preventAutoFocusOnClose?: boolean;
  mountPortalContainer?: HTMLElement;
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
      variant,
      trapFocusScope,
      isAlertDialog,
      preventAutoFocusOnClose = true,
      onCloseAutoFocus,
      mountPortalContainer,
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
            className={cn(dialogVariants({ size, height, variant }), className)}
            onInteractOutside={
              isAlertDialog
                ? (e) => e.preventDefault()
                : props.onInteractOutside
            }
            onCloseAutoFocus={handleCloseAutoFocus}
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
      "sticky top-0 z-50 flex flex-none flex-col gap-0 bg-modal-background px-5 pt-4 text-left",
      className
    )}
    {...props}
  >
    {children}
    {!hideButton && (
      <DialogClose asChild className="absolute right-3 top-3">
        <Button icon={XClose} variant={buttonVariant} size={buttonSize} />
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
  const contentStyles = cn("copy-base break-words px-5 py-4 text-foreground");

  const scrollableContent = (
    <ScrollArea className="w-full flex-grow">
      <div
        className={cn(
          contentStyles,
          "relative flex flex-col gap-2 text-left",
          className
        )}
      >
        {children}
      </div>
    </ScrollArea>
  );

  if (fixedContent) {
    return (
      <div className="flex flex-grow flex-col overflow-hidden">
        <div className={cn(contentStyles, "flex-none")}>{fixedContent}</div>
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
  <div className="flex flex-none flex-col gap-0">
    <div
      className={cn(
        "flex flex-none flex-row justify-end gap-2 px-3 pb-3 pt-2",
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
  <div className="flex flex-row items-center gap-2 pt-1">
    {visual}
    <DialogPrimitive.Title
      ref={ref}
      className={cn(
        "heading-lg",
        "min-w-0 break-words",
        "text-foreground",
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
    className={cn("copy-sm", "text-muted-foreground", className)}
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
