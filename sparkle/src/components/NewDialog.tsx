import * as DialogPrimitive from "@radix-ui/react-dialog";
import { FocusScope } from "@radix-ui/react-focus-scope";
import { cva } from "class-variance-authority";
import * as React from "react";

import { Button, ScrollArea } from "@sparkle/components";
import { XMarkIcon } from "@sparkle/icons";
import { cn } from "@sparkle/lib/utils";

const NewDialog = DialogPrimitive.Root;
const NewDialogTrigger = DialogPrimitive.Trigger;
const NewDialogClose = DialogPrimitive.Close;
const NewDialogPortal = DialogPrimitive.Portal;

const NewDialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    className={cn(
      "s-fixed s-inset-0 s-z-50 s-bg-muted-foreground/75 data-[state=open]:s-animate-in data-[state=closed]:s-animate-out data-[state=closed]:s-fade-out-0 data-[state=open]:s-fade-in-0",
      className
    )}
    {...props}
    ref={ref}
  />
));
NewDialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DIALOG_SIZES = ["md", "lg", "xl"] as const;
type DialogSizeType = (typeof DIALOG_SIZES)[number];

const sizeClasses: Record<DialogSizeType, string> = {
  md: "sm:s-max-w-md",
  lg: "sm:s-max-w-xl",
  xl: "sm:s-max-w-3xl",
};

const dialogVariants = cva(
  "s-fixed s-left-[50%] s-top-[50%] s-z-50 s-translate-x-[-50%] s-translate-y-[-50%] s-bg-background s-duration-200 s-flex s-flex-col data-[state=open]:s-animate-in data-[state=closed]:s-animate-out data-[state=closed]:s-fade-out-0 data-[state=open]:s-fade-in-0 data-[state=closed]:s-zoom-out-95 data-[state=open]:s-zoom-in-95 s-rounded-xl s-border s-border-border",
  {
    variants: {
      size: sizeClasses,
    },
    defaultVariants: {
      size: "md",
    },
  }
);

interface NewDialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  size?: DialogSizeType;
  trapFocusScope?: boolean;
  isAlertDialog?: boolean;
}

const NewDialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  NewDialogContentProps
>(
  (
    { className, children, size, trapFocusScope, isAlertDialog, ...props },
    ref
  ) => (
    <NewDialogPortal>
      <NewDialogOverlay />
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
    </NewDialogPortal>
  )
);
NewDialogContent.displayName = DialogPrimitive.Content.displayName;

interface NewNewDialogHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  hideButton?: boolean;
}

const NewDialogHeader = ({
  className,
  children,
  hideButton = false,
  ...props
}: NewNewDialogHeaderProps) => (
  <div
    className={cn(
      "s-z-50 s-flex s-flex-none s-flex-col s-gap-2 s-rounded-t-xl s-border-b s-bg-background s-p-5 s-text-left",
      className
    )}
    {...props}
  >
    {children}
    <NewDialogClose asChild className="s-absolute s-right-3 s-top-4">
      {!hideButton && <Button icon={XMarkIcon} variant="ghost" size="sm" />}
    </NewDialogClose>
  </div>
);
NewDialogHeader.displayName = "NewDialogHeader";

const NewDialogContainer = ({
  children,
}: React.HTMLAttributes<HTMLDivElement>) => (
  <ScrollArea className="s-w-full s-flex-grow">
    <div className="s-relative s-flex s-flex-col s-gap-2 s-p-5 s-text-left s-text-sm s-text-foreground">
      {children}
    </div>
  </ScrollArea>
);
NewDialogContainer.displayName = "DialogContainer";

interface NewDialogFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  leftButtonProps?: React.ComponentProps<typeof Button>;
  rightButtonProps?: React.ComponentProps<typeof Button>;
  dialogCloseClassName?: string;
}

const NewDialogFooter = ({
  className,
  children,
  leftButtonProps,
  rightButtonProps,
  dialogCloseClassName,
  ...props
}: NewDialogFooterProps) => (
  <div
    className={cn(
      "s-flex s-flex-none s-flex-row s-gap-2 s-px-3 s-py-3",
      className
    )}
    {...props}
  >
    {leftButtonProps &&
      (leftButtonProps.disabled ? (
        <Button {...leftButtonProps} />
      ) : (
        <NewDialogClose className={dialogCloseClassName} asChild>
          <Button {...leftButtonProps} />
        </NewDialogClose>
      ))}
    {rightButtonProps &&
      (rightButtonProps.disabled ? (
        <Button {...rightButtonProps} />
      ) : (
        <NewDialogClose className={dialogCloseClassName} asChild>
          <Button {...rightButtonProps} />
        </NewDialogClose>
      ))}
    {children}
  </div>
);
NewDialogFooter.displayName = "DialogFooter";

const NewDialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("s-text-lg s-font-semibold s-text-foreground", className)}
    {...props}
  />
));
NewDialogTitle.displayName = DialogPrimitive.Title.displayName;

const NewDialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("s-text-sm s-text-muted-foreground", className)}
    {...props}
  />
));
NewDialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  NewDialog,
  NewDialogClose,
  NewDialogContainer,
  NewDialogContent,
  NewDialogDescription,
  NewDialogFooter,
  NewDialogHeader,
  NewDialogOverlay,
  NewDialogPortal,
  NewDialogTitle,
  NewDialogTrigger,
};
