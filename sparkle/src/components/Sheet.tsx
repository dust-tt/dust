import * as SheetPrimitive from "@radix-ui/react-dialog";
import { FocusScope } from "@radix-ui/react-focus-scope";
import { Button } from "@sparkle/components/Button";
import { Icon } from "@sparkle/components/Icon";
import { ScrollArea } from "@sparkle/components/ScrollArea";
import { SheetViewportProvider } from "@sparkle/components/SheetViewportContext";
import { XClose } from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib/utils";
import { cva } from "class-variance-authority";
import * as React from "react";

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
      "fixed inset-0 z-50",
      "bg-muted-foreground/75 dark:bg-muted-background/75",
      "data-[state=open]:animate-in data-[state=closed]:animate-out",
      "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
    ref={ref}
  />
));
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName;

const SHEET_SIZES = ["md", "lg", "xl", "2xl", "3xl"] as const;

type SheetSizeType = (typeof SHEET_SIZES)[number];

const SHEET_SIDES = ["top", "bottom", "left", "right"] as const;

type SheetSideType = (typeof SHEET_SIDES)[number];

const sizeClasses: Record<SheetSizeType, string> = {
  md: "sm:max-w-md",
  lg: "sm:max-w-xl",
  xl: "sm:max-w-3xl",
  "2xl": "sm:max-w-4xl",
  "3xl": "sm:max-w-5xl",
};

const sheetVariants = cva(
  cn(
    "fixed z-50 overflow-hidden flex flex-col h-full w-full",
    "bg-modal-background",
    "transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500"
  ),
  {
    variants: {
      side: {
        top: cn(
          "inset-x-0 top-0 data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
          "border-b border-border"
        ),
        bottom: cn(
          "inset-x-0 bottom-0 data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
          "border-t border-border"
        ),
        left: cn(
          "inset-y-0 left-0 data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left",
          "border-r border-border"
        ),
        right: cn(
          "inset-y-0 right-0 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
          "border-l border-border"
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
}

type PointerDownOutsideEvent = Parameters<
  NonNullable<SheetContentProps["onPointerDownOutside"]>
>[0];

type InteractOutsideEvent = Parameters<
  NonNullable<SheetContentProps["onInteractOutside"]>
>[0];

// Notifications are rendered by sonner in their own portal, outside of the sheet: interacting with
// a toast (typically dismissing it) must not be treated as an interaction outside the sheet.
function isEventInsideNotification(event: {
  detail: { originalEvent: Event };
}): boolean {
  const target = event.detail.originalEvent.target;
  return target instanceof Element && !!target.closest("[data-sonner-toaster]");
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
      onPointerDownOutside,
      onInteractOutside,
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

    const handlePointerDownOutside = React.useCallback(
      (event: PointerDownOutsideEvent) => {
        if (isEventInsideNotification(event)) {
          event.preventDefault();
          return;
        }
        onPointerDownOutside?.(event);
      },
      [onPointerDownOutside]
    );

    const handleInteractOutside = React.useCallback(
      (event: InteractOutsideEvent) => {
        if (isEventInsideNotification(event)) {
          event.preventDefault();
          return;
        }
        onInteractOutside?.(event);
      },
      [onInteractOutside]
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
              "sheet text-foreground"
            )}
            onCloseAutoFocus={handleCloseAutoFocus}
            onOpenAutoFocus={handleOpenAutoFocus}
            onPointerDownOutside={handlePointerDownOutside}
            onInteractOutside={handleInteractOutside}
            onKeyDownCapture={onKeyDownCapture}
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
      "z-50 flex flex-none flex-col p-5 text-left",
      "bg-modal-background",
      className
    )}
    {...props}
  >
    {children}
    <SheetClose asChild className="absolute right-3 top-4">
      {!hideButton && <Button icon={XClose} variant="ghost" size="sm" />}
    </SheetClose>
  </div>
);
SheetHeader.displayName = "SheetHeader";

interface SheetContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  noScroll?: boolean;
  isListSelector?: boolean;
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
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = React.useState<HTMLDivElement | null>(null);

  React.useEffect(() => {
    setViewport(viewportRef.current);
  }, []);

  const value = React.useMemo(() => viewport, [viewport]);

  if (noScroll) {
    return <div className={cn(className, "flex flex-col")}>{children}</div>;
  }

  return (
    <ScrollArea className={className} viewportRef={viewportRef}>
      <SheetViewportProvider value={value}>{children}</SheetViewportProvider>
    </ScrollArea>
  );
};

const SheetContainer = ({
  children,
  noScroll,
  isListSelector,
  className,
}: SheetContainerProps) => {
  return (
    <ScrollContainer
      noScroll={noScroll}
      className={cn(
        "min-h-0 w-full flex-1 overflow-hidden",
        "border-t border-border/60 transition-all duration-300"
      )}
    >
      <div
        className={cn(
          "relative flex min-h-0 flex-1 flex-col overflow-hidden text-left text-sm text-foreground",
          !isListSelector && "gap-5 px-5 pt-3",
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
        "flex flex-none flex-col gap-2",
        "border-border",
        className
      )}
      {...props}
    >
      {children}
      <div className="flex flex-row gap-2 border-t border-border p-3">
        {leftButtonProps &&
          (leftButtonProps.disabled ? (
            <Button {...leftButtonProps} />
          ) : (
            <SheetClose className={sheetCloseClassName} asChild>
              <Button {...leftButtonProps} />
            </SheetClose>
          ))}
        <div className="flex-grow" />
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
    {icon && <Icon visual={icon} size="lg" className="text-foreground" />}
    <SheetPrimitive.Title
      ref={ref}
      className={cn("heading-lg", className)}
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
    className={cn("text-sm", "text-muted-foreground", className)}
    {...props}
  />
));
SheetDescription.displayName = SheetPrimitive.Description.displayName;

export {
  SheetViewportProvider,
  useSheetViewport,
} from "@sparkle/components/SheetViewportContext";
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
