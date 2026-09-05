import * as DialogPrimitive from "@radix-ui/react-dialog";
import { FocusScope } from "@radix-ui/react-focus-scope";
import { Button, type ButtonProps } from "@sparkle/components/Button";
import { ScrollArea } from "@sparkle/components/ScrollArea";
import { Separator } from "@sparkle/components/Separator";
import { XClose } from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib/utils";
import { cva } from "class-variance-authority";
import * as React from "react";

/**
 * A modal surface that interrupts the flow to focus the user on a single task
 * or decision — confirmations, short forms, or tool-permission prompts.
 * Compose it from DialogTrigger, DialogContent, DialogHeader (with
 * DialogTitle / DialogDescription), DialogContainer, and DialogFooter; for
 * multi-step flows use MultiPageDialog, and for non-blocking contextual
 * information use ContentMessage.
 * @summary Modal dialog for focused tasks and confirmations.
 */
const Dialog = DialogPrimitive.Root;
/** Element that opens the dialog (use asChild to wrap a Button). */
const DialogTrigger = DialogPrimitive.Trigger;
/** Element that closes the dialog when activated. */
const DialogClose = DialogPrimitive.Close;
/** Portals the dialog content to another part of the DOM. */
const DialogPortal = DialogPrimitive.Portal;

/** Dimmed backdrop rendered behind the dialog content. */
const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    className={cn(
      "fixed inset-0 z-50 ease-emphasized data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-reduce:animate-none",
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

// With grow, the fixed height becomes a minimum: the h-* class is not
// emitted and min-h keeps the height's size as the floor. min-height wins
// over max-height in CSS, so the floor is itself capped at 90vh to never
// exceed the base max-h-[90vh] on short viewports.
const growHeightClasses: Record<DialogHeightType, string> = {
  md: "sm:min-h-[min(448px,90vh)]",
  lg: "sm:min-h-[min(576px,90vh)]",
  xl: "sm:min-h-[min(768px,90vh)]",
  "2xl": "sm:min-h-[min(1024px,90vh)]",
};

const DIALOG_VARIANTS = ["default", "command"] as const;
type DialogVariantType = (typeof DIALOG_VARIANTS)[number];

const overlayVariantClasses: Record<DialogVariantType, string> = {
  default: "duration-200 data-[state=closed]:duration-150",
  command: "duration-[220ms] data-[state=closed]:duration-[160ms]",
};

const variantClasses: Record<DialogVariantType, string> = {
  default: cn(
    "top-[50%] translate-y-[-50%] duration-200 ease-emphasized data-[state=closed]:duration-150 motion-reduce:animate-none",
    "data-[state=open]:animate-in data-[state=closed]:animate-out",
    "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
    "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
  ),
  command: cn(
    "top-[20%] duration-[220ms] ease-[cubic-bezier(0.16,1,0.3,1)] data-[state=closed]:duration-[160ms] motion-reduce:animate-none",
    "data-[state=open]:animate-in data-[state=closed]:animate-out",
    "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
    "data-[state=open]:slide-in-from-top-2 data-[state=closed]:slide-out-to-top-2"
  ),
};

const dialogVariants = cva(
  cn(
    "fixed left-[50%] z-50 overflow-hidden translate-x-[-50%]",
    "rounded-2xl flex flex-col w-full max-w-[calc(100vw-2rem)] border border shadow-lg",
    "bg-modal-background",
    "border-border",
    "max-h-[90vh]",
    // Radix focuses the panel itself when nothing tabbable is inside or on
    // background clicks; suppress the UA focus ring on the panel.
    "focus:outline-none"
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
  /** Max width of the dialog: "md" | "lg" | "xl" | "2xl" | "full" (full screen) | "fit" (content width). */
  size?: DialogSizeType;
  /** Fixed height of the dialog: "md" | "lg" | "xl" | "2xl"; unset grows with content up to 90vh. */
  height?: DialogHeightType;
  /** Lets the dialog grow beyond its fixed `height` when the content needs it, up to the existing 90vh cap: the height becomes a minimum. No effect without `height`. */
  grow?: boolean;
  /** "default" centers vertically; "command" pins near the top with a slide-in (command-palette style). */
  variant?: DialogVariantType;
  /** Traps keyboard focus inside the dialog while open. */
  trapFocusScope?: boolean;
  /** Prevents closing by clicking outside, for confirmations that must be answered. */
  isAlertDialog?: boolean;
  /** Skips Radix's focus return to the trigger when the dialog closes (default true). */
  preventAutoFocusOnClose?: boolean;
  /** Custom DOM element to portal the dialog into. */
  mountPortalContainer?: HTMLElement;
}

/** The dialog panel itself: portal, overlay, and the sized, animated content box. */
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
      grow,
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
        <DialogOverlay
          className={overlayVariantClasses[variant ?? "default"]}
        />
        <FocusScope trapped={trapFocusScope} asChild>
          <DialogPrimitive.Content
            ref={ref}
            className={cn(
              // grow replaces the fixed height with a floor.
              dialogVariants({
                size,
                height: grow ? undefined : height,
                variant,
              }),
              grow && height ? growHeightClasses[height] : undefined,
              className
            )}
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
  /** Size of the built-in close button. */
  buttonSize?: ButtonProps["size"];
  /** Variant of the built-in close button. */
  buttonVariant?: ButtonProps["variant"];
  /** Hides the built-in close button. */
  hideButton?: boolean;
}

/** Sticky header area holding DialogTitle / DialogDescription and a built-in close button. */
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
  /** Content pinned above the scrollable body, separated by a divider. */
  fixedContent?: React.ReactNode;
}

/** Scrollable body of the dialog, with an optional fixed section on top. */
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
  /** Props for the left footer Button (usually cancel); it closes the dialog unless disabled. */
  leftButtonProps?: React.ComponentProps<typeof Button>;
  /** Props for the right footer Button (usually confirm); it closes the dialog unless disabled. */
  rightButtonProps?: React.ComponentProps<typeof Button>;
  /** className applied to the DialogClose wrappers around the footer buttons. */
  dialogCloseClassName?: string;
}

/** Footer row of action buttons, right-aligned; label buttons with the action they perform. */
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

/** Dialog heading, with an optional leading visual (e.g. an Avatar or logo). */
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

/** Muted supporting text under the DialogTitle. */
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
