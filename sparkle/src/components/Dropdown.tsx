import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Button } from "@sparkle/components/Button";
import { Chip } from "@sparkle/components/Chip";
import { Icon } from "@sparkle/components/Icon";
import {
  KeyboardShortcut,
  type KeyboardShortcutProps,
} from "@sparkle/components/KeyboardShortcut";
import {
  LinkWrapper,
  type LinkWrapperProps,
} from "@sparkle/components/LinkWrapper";
import {
  radioIndicatorStyles,
  radioStyles,
} from "@sparkle/components/RadioGroup";
import { ScrollArea } from "@sparkle/components/ScrollArea";
import {
  SearchInput,
  type SearchInputProps,
} from "@sparkle/components/SearchInput";
import { Tooltip } from "@sparkle/components/Tooltip";
import { useSheetContainer } from "@sparkle/hooks/useSheetContainer";
import { Check, ChevronRight } from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib/utils";
import { cva } from "class-variance-authority";
import * as React from "react";
import { useMemo, useRef } from "react";
import { tabbable } from "tabbable";

const ITEM_VARIANTS = ["default", "warning"] as const;

type ItemVariantType = (typeof ITEM_VARIANTS)[number];

export const menuStyleClasses = {
  inset: "pl-8",
  container: cn(
    "rounded-xl border-hovering p-1",
    "border border-border",
    "bg-overlay-background",
    "text-foreground",
    "z-50 min-w-[8rem]",
    "origin-[var(--radix-dropdown-menu-content-transform-origin)]"
  ),
  // Enter/exit animation applied to the top-level dropdown content only. Nested
  // sub-menus open instantly so they don't feel sluggish when drilling in.
  containerAnimation: cn(
    "duration-200 ease-enter data-[state=closed]:duration-150 motion-reduce:animate-none",
    "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2"
  ),
  item: cva(
    cn(
      "relative flex gap-2 cursor-pointer select-none items-center outline-hidden rounded-lg heading-sm transition-colors duration-150 motion-reduce:transition-none data-[disabled]:pointer-events-none",
      "data-[disabled]:text-primary-400"
    ),
    {
      variants: {
        variant: {
          default: cn(
            "p-2",
            "text-muted-foreground",
            "hover:bg-hover hover:text-foreground",
            "focus:text-foreground",
            "focus:bg-hover"
          ),
          tags: cn(
            "p-0.5",
            "text-muted-foreground",
            "hover:bg-hover hover:text-foreground",
            "focus:text-foreground",
            "focus:bg-hover"
          ),
          warning: cn(
            "p-2",
            "text-warning-500",
            "hover:bg-warning-50",
            "focus:bg-warning-50",
            "active:bg-warning-100"
          ),
        },
      },
      defaultVariants: {
        variant: "default",
      },
    }
  ),
  subTrigger: {
    default: cn("mr-1 ml-auto tracking-widest", "text-primary-400"),
    span: "absolute left-2 flex h-3.5 w-3.5 items-center justify-center",
  },
  label: cn("px-2 py-2 heading-xs", "text-muted-foreground"),
  description: cn("grow truncate text-xs font-normal", "text-muted-foreground"),
  separator: cn("-mx-1 my-1 h-px", "bg-separator"),
  shortcut: "ml-auto",
};

const DropdownMenu = DropdownMenuPrimitive.Root;
const DropdownMenuGroup = DropdownMenuPrimitive.Group;
const DropdownMenuPortal = DropdownMenuPrimitive.Portal;
const DropdownMenuSub = DropdownMenuPrimitive.Sub;
const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

interface LabelAndIconProps {
  label: string;
  icon?: React.ComponentType | React.ReactNode;
}

type Simplify<T> = { [K in keyof T]: T[K] };

type EitherChildrenOrProps<BaseProps, ExtraProps> =
  | (BaseProps & ExtraProps & { children?: never })
  | (BaseProps & { [K in keyof ExtraProps]?: never });

type MutuallyExclusiveProps<BaseProps, ExtraProps> = Simplify<
  EitherChildrenOrProps<BaseProps, ExtraProps>
>;

interface DropdownItemRegistryContextType {
  registerItem: (itemId: string, element: HTMLElement | null) => void;
}

const DropdownItemRegistryContext =
  React.createContext<DropdownItemRegistryContextType | null>(null);

interface ItemWithLabelIconAndDescriptionProps {
  label?: string;
  icon?: React.ComponentType | React.ReactNode;
  description?: string;
  children?: React.ReactNode;
  truncate?: boolean;
  endComponent?: React.ReactNode;
  variant?: ItemVariantType;
}

const renderIcon = (
  icon: React.ComponentType | React.ReactNode,
  size: "xs" | "sm" = "xs",
  variant?: ItemVariantType
) => {
  // If it's a React element (already rendered), return it as is
  if (React.isValidElement(icon)) {
    return icon;
  }

  // For any component type (including exotic components), render it with Icon
  if (typeof icon === "function" || typeof icon === "object") {
    return (
      <Icon
        size={size}
        visual={icon as React.ComponentType}
        className={variant === "warning" ? undefined : "text-muted-foreground"}
      />
    );
  }

  // For primitive values, return null
  return null;
};

const ItemWithLabelIconAndDescription = <
  T extends ItemWithLabelIconAndDescriptionProps,
>({
  label,
  icon,
  description,
  truncate,
  children,
  endComponent,
  variant,
}: T) => {
  return (
    <>
      {label && (
        <div
          className={cn(
            "grid flex-grow items-center gap-x-2.5",
            icon && endComponent
              ? "grid-cols-[auto_1fr_auto]"
              : icon
                ? "grid-cols-[auto_1fr]"
                : endComponent
                  ? "grid-cols-[1fr_auto]"
                  : "grid-cols-[1fr]"
          )}
        >
          {renderIcon(icon, "sm", variant)}
          <div className={cn("flex flex-col", truncate && "truncate")}>
            <span className={cn(truncate ? "truncate" : "line-clamp-3")}>
              {label}
            </span>
            {description && (
              <span
                className={cn(
                  "text-xs font-normal text-muted-foreground",
                  truncate ? "truncate" : "line-clamp-3"
                )}
              >
                {description}
              </span>
            )}
          </div>
          {endComponent}
        </div>
      )}
      {children}
    </>
  );
};

const DropdownMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubTrigger>,
  MutuallyExclusiveProps<
    React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger>,
    LabelAndIconProps
  > & {
    inset?: boolean;
  }
>(({ className, label, icon, children, inset, ...props }, ref) => (
  <DropdownMenuPrimitive.SubTrigger
    ref={ref}
    className={cn(
      menuStyleClasses.item({ variant: "default" }),
      // Keep the trigger highlighted while its sub-menu is open, so the
      // hover state doesn't drop when the pointer moves into the sub-menu.
      "data-[state=open]:bg-hover data-[state=open]:text-foreground",
      inset ? menuStyleClasses.inset : "",
      className
    )}
    {...props}
  >
    <ItemWithLabelIconAndDescription
      label={label}
      icon={icon}
      endComponent={
        <Icon
          size="xs"
          visual={ChevronRight}
          className="text-muted-foreground"
        />
      }
    >
      {children}
    </ItemWithLabelIconAndDescription>
  </DropdownMenuPrimitive.SubTrigger>
));
DropdownMenuSubTrigger.displayName =
  DropdownMenuPrimitive.SubTrigger.displayName;

interface DropdownMenuSubContentProps
  extends React.ComponentPropsWithoutRef<
    typeof DropdownMenuPrimitive.SubContent
  > {
  dropdownHeaders?: React.ReactNode;
}

const DropdownMenuSubContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubContent>,
  DropdownMenuSubContentProps
>(({ className, children, dropdownHeaders, ...props }, ref) => {
  const container = useSheetContainer();

  // Always portal: a sub-menu rendered inline sits inside the parent menu's
  // bg-overlay-background, where the nested-same-surface rule would strip its
  // elevation shadow. Wrapping in an extra DropdownMenuPortal at the call
  // site remains harmless.
  return (
    <DropdownMenuPrimitive.Portal container={container}>
      <DropdownMenuPrimitive.SubContent
        ref={ref}
        className={cn(
          menuStyleClasses.container,
          "flex flex-col",
          dropdownHeaders && "h-80 xs:h-96",
          className
        )}
        {...props}
      >
        {dropdownHeaders && (
          <div className="sticky top-0 bg-overlay-background">
            {dropdownHeaders}
          </div>
        )}
        <ScrollArea
          className="w-full flex-1"
          hideScrollBar={false}
          orientation="vertical"
          viewportClassName={cn(
            "flex-1",
            "max-h-[calc(var(--radix-dropdown-menu-content-available-height)-var(--header-height,20px))]"
          )}
        >
          {children}
        </ScrollArea>
      </DropdownMenuPrimitive.SubContent>
    </DropdownMenuPrimitive.Portal>
  );
});
DropdownMenuSubContent.displayName =
  DropdownMenuPrimitive.SubContent.displayName;

const nativeInputValueSetter =
  typeof window !== "undefined"
    ? Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
    : undefined;

const SEARCHABLE_MENU_ITEM_SELECTOR =
  '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]';
const OPEN_SEARCHABLE_MENU_ITEM_SELECTOR = [
  '[data-radix-menu-content][data-state=open] [role="menuitem"]',
  '[data-radix-menu-content][data-state=open] [role="menuitemcheckbox"]',
  '[data-radix-menu-content][data-state=open] [role="menuitemradio"]',
].join(", ");

type TabbableElement = ReturnType<typeof tabbable>[number];

function getDropdownMenuTrigger(content: HTMLElement): HTMLElement | null {
  return content.ownerDocument.getElementById(
    content.getAttribute("aria-labelledby") ?? ""
  );
}

function handleDropdownMenuTab(
  event: React.KeyboardEvent<HTMLDivElement>,
  onExit: (element: TabbableElement) => void
): void {
  const content = event.currentTarget;
  const trigger = getDropdownMenuTrigger(content);
  if (!trigger) {
    return;
  }

  const tabbableElements = tabbable(content.ownerDocument.body).filter(
    (element) =>
      !element.closest('[data-radix-menu-content][data-state="open"]')
  );
  const triggerIndex = tabbableElements.indexOf(trigger);
  if (triggerIndex === -1) {
    return;
  }

  const nextIndex = event.shiftKey
    ? (triggerIndex - 1 + tabbableElements.length) % tabbableElements.length
    : (triggerIndex + 1) % tabbableElements.length;
  const nextElement = tabbableElements[nextIndex];

  // Radix suppresses Tab inside menus. Close through its Escape path so
  // controlled roots receive onOpenChange, then transfer focus after unmount.
  event.preventDefault();
  event.stopPropagation();
  onExit(nextElement);
  content.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    })
  );
}

function getFirstDropdownMenuItem(container: ParentNode): HTMLElement | null {
  return container.querySelector<HTMLElement>(SEARCHABLE_MENU_ITEM_SELECTOR);
}

function getFirstOpenDropdownMenuItem(): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    OPEN_SEARCHABLE_MENU_ITEM_SELECTOR
  );
}

function getDropdownSearchInput(
  container: ParentNode
): HTMLInputElement | null {
  return (
    container.querySelector<HTMLInputElement>(
      '[data-dropdown-searchbar] input[type="text"]'
    ) ?? container.querySelector<HTMLInputElement>('input[type="text"]')
  );
}

function resolveDropdownSearchInput(
  searchInputRef: React.RefObject<HTMLInputElement | null> | undefined,
  container: ParentNode
): HTMLInputElement | null {
  return searchInputRef?.current ?? getDropdownSearchInput(container);
}

function isDropdownTextEntryElement(
  element: Element | null
): element is HTMLInputElement | HTMLTextAreaElement {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement
  );
}

function setDropdownSearchInputValue(
  input: HTMLInputElement,
  nextValue: string
): void {
  if (!nativeInputValueSetter) {
    return;
  }

  // Use the native setter so React sees the value change before the input event.
  nativeInputValueSetter.call(input, nextValue);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

interface DropdownMenuContentProps
  extends React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content> {
  mountPortal?: boolean;
  mountPortalContainer?: HTMLElement;
  dropdownHeaders?: React.ReactNode;
  highlightedItemId?: string;
  preventAutoFocusOnClose?: boolean;
  onOpenAutoFocus?: (e: React.FocusEvent<HTMLDivElement>) => void;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
  scrollHighlightedItemIntoView?: boolean;
}

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  DropdownMenuContentProps
>(
  (
    {
      className,
      sideOffset = 4,
      mountPortal = true,
      mountPortalContainer,
      dropdownHeaders,
      highlightedItemId,
      preventAutoFocusOnClose = true,
      onCloseAutoFocus,
      onKeyDownCapture,
      onKeyDown,
      searchInputRef,
      scrollHighlightedItemIntoView = false,
      children,
      ...props
    },
    ref
  ) => {
    const viewportRef = useRef<HTMLDivElement>(null);
    const itemElementsRef = useRef(new Map<string, HTMLElement>());
    const tabExitTargetRef = useRef<TabbableElement | null>(null);

    const handleKeyDownCapture = (e: React.KeyboardEvent<HTMLDivElement>) => {
      onKeyDownCapture?.(e);
      if (e.defaultPrevented) {
        return;
      }

      if (e.key !== "ArrowUp") {
        return;
      }

      const input = resolveDropdownSearchInput(searchInputRef, e.currentTarget);
      const firstItem = getFirstDropdownMenuItem(e.currentTarget);

      if (!input || !firstItem || document.activeElement !== firstItem) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      input.focus();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      onKeyDown?.(e);
      if (e.defaultPrevented) {
        return;
      }

      if (e.key === "Tab") {
        handleDropdownMenuTab(e, (element) => {
          tabExitTargetRef.current = element;
        });
        return;
      }

      if (isDropdownTextEntryElement(document.activeElement)) {
        return;
      }

      const input = resolveDropdownSearchInput(searchInputRef, e.currentTarget);
      if (!input) {
        return;
      }

      // Treat single-character keys as search input
      if (e.key.length === 1) {
        e.preventDefault();
        input.focus();
        setDropdownSearchInputValue(input, input.value + e.key);
      } else if (e.key === "Backspace" && input.value.length > 0) {
        e.preventDefault();
        input.focus();
        setDropdownSearchInputValue(input, input.value.slice(0, -1));
      }
    };

    const handleCloseAutoFocus = React.useCallback(
      (event: Event) => {
        const tabExitTarget = tabExitTargetRef.current;
        tabExitTargetRef.current = null;

        if (tabExitTarget) {
          event.preventDefault();
          tabExitTarget.focus();
        } else if (preventAutoFocusOnClose) {
          event.preventDefault();
        }
        onCloseAutoFocus?.(event);
      },
      [preventAutoFocusOnClose, onCloseAutoFocus]
    );

    const registerItem = React.useCallback(
      (itemId: string, element: HTMLElement | null) => {
        if (element) {
          itemElementsRef.current.set(itemId, element);
        } else {
          itemElementsRef.current.delete(itemId);
        }
      },
      []
    );

    const itemRegistryContextValue = useMemo(
      () => ({ registerItem }),
      [registerItem]
    );

    React.useEffect(() => {
      if (!scrollHighlightedItemIntoView || !highlightedItemId) {
        return;
      }

      const viewport = viewportRef.current;
      if (!viewport) {
        return;
      }

      const highlightedItem = itemElementsRef.current.get(highlightedItemId);

      highlightedItem?.scrollIntoView({ block: "nearest" });
    }, [highlightedItemId, scrollHighlightedItemIntoView]);

    const content = (
      <DropdownMenuPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        onKeyDownCapture={handleKeyDownCapture}
        onKeyDown={handleKeyDown}
        className={cn(
          menuStyleClasses.container,
          menuStyleClasses.containerAnimation,
          "flex flex-col",
          dropdownHeaders && "h-80 xs:h-96", // We use dropdownHeaders for putting search bar, so we can set the height for the container
          className
        )}
        onCloseAutoFocus={handleCloseAutoFocus}
        {...props}
      >
        <div className="sticky top-0 bg-overlay-background">
          {dropdownHeaders && dropdownHeaders}
        </div>
        <ScrollArea
          className="w-full flex-1"
          viewportClassName={cn(
            "flex-1",
            "max-h-[calc(var(--radix-dropdown-menu-content-available-height)-var(--header-height,20px))]"
          )}
          viewportRef={viewportRef}
        >
          <DropdownItemRegistryContext.Provider
            value={itemRegistryContextValue}
          >
            {children}
          </DropdownItemRegistryContext.Provider>
        </ScrollArea>
      </DropdownMenuPrimitive.Content>
    );

    const container = useSheetContainer(mountPortalContainer);

    return mountPortal ? (
      <DropdownMenuPrimitive.Portal container={container}>
        {content}
      </DropdownMenuPrimitive.Portal>
    ) : (
      content
    );
  }
);
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName;

export type DropdownMenuItemProps = MutuallyExclusiveProps<
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    inset?: boolean;
    itemId?: string;
    variant?: ItemVariantType;
    tooltip?: React.ReactNode;
  } & Omit<LinkWrapperProps, "children" | "className">,
  LabelAndIconProps & {
    description?: string;
    truncateText?: boolean;
    endComponent?: React.ReactNode;
  }
>;

const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  DropdownMenuItemProps
>(
  (
    {
      children,
      variant,
      description,
      className,
      inset,
      icon,
      itemId,
      truncateText,
      label,
      href,
      target,
      rel,
      asChild,
      replace,
      shallow,
      prefetch,
      endComponent,
      tooltip,
      ...props
    },
    ref
  ) => {
    const dropdownItemRegistry = React.useContext(DropdownItemRegistryContext);

    const handleItemRef = React.useCallback(
      (element: React.ElementRef<typeof DropdownMenuPrimitive.Item> | null) => {
        if (typeof ref === "function") {
          ref(element);
        } else if (ref) {
          ref.current = element;
        }

        if (itemId) {
          dropdownItemRegistry?.registerItem(itemId, element);
        }
      },
      [dropdownItemRegistry, itemId, ref]
    );

    const item = (
      <LinkWrapper
        href={href}
        target={target}
        rel={rel}
        replace={replace}
        shallow={shallow}
        prefetch={prefetch}
      >
        <DropdownMenuPrimitive.Item
          ref={handleItemRef}
          className={cn(
            menuStyleClasses.item({ variant }),
            inset ? menuStyleClasses.inset : "",
            className
          )}
          {...props}
          asChild={asChild}
        >
          <div className="h-full w-full">
            <ItemWithLabelIconAndDescription
              label={label}
              icon={icon}
              description={description}
              truncate={truncateText}
              endComponent={endComponent}
              variant={variant}
            >
              {children}
            </ItemWithLabelIconAndDescription>
          </div>
        </DropdownMenuPrimitive.Item>
      </LinkWrapper>
    );

    const itemWithTooltip = tooltip ? (
      <Tooltip
        tooltipTriggerAsChild
        label={tooltip}
        trigger={<span className="block w-full">{item}</span>}
      />
    ) : (
      item
    );

    return itemWithTooltip;
  }
);
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;

export type DropdownMenuCheckboxItemProps = React.ComponentPropsWithoutRef<
  typeof DropdownMenuPrimitive.CheckboxItem
> & {
  label?: React.ComponentProps<typeof DropdownMenuItem>["label"];
  icon?: React.ComponentProps<typeof DropdownMenuItem>["icon"];
  description?: React.ComponentProps<typeof DropdownMenuItem>["description"];
  truncateText?: React.ComponentProps<typeof DropdownMenuItem>["truncateText"];
};

const DropdownMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
  DropdownMenuCheckboxItemProps
>(
  (
    { className, children, description, label, icon, truncateText, ...props },
    ref
  ) => (
    <DropdownMenuPrimitive.CheckboxItem
      ref={ref}
      className={cn(
        menuStyleClasses.item({ variant: "default" }),
        menuStyleClasses.inset
      )}
      {...props}
    >
      <span className={menuStyleClasses.subTrigger.span}>
        <DropdownMenuPrimitive.ItemIndicator>
          <Icon size="xs" visual={Check} className="text-muted-foreground" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      <ItemWithLabelIconAndDescription
        label={label}
        icon={icon}
        description={description}
        truncate={truncateText}
      >
        {children}
      </ItemWithLabelIconAndDescription>
    </DropdownMenuPrimitive.CheckboxItem>
  )
);
DropdownMenuCheckboxItem.displayName =
  DropdownMenuPrimitive.CheckboxItem.displayName;

const DropdownMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.RadioItem>,
  MutuallyExclusiveProps<
    React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>,
    LabelAndIconProps & { description?: string; endComponent?: React.ReactNode }
  >
>(
  (
    { className, children, description, label, icon, endComponent, ...props },
    ref
  ) => (
    <DropdownMenuPrimitive.RadioItem
      ref={ref}
      className={cn(
        menuStyleClasses.item({ variant: "default" }),
        menuStyleClasses.inset,
        "group/dropdown-radio",
        className
      )}
      {...props}
    >
      <span className={cn("absolute left-2", radioStyles())}>
        <DropdownMenuPrimitive.ItemIndicator>
          <div className={radioIndicatorStyles()} />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      <ItemWithLabelIconAndDescription
        label={label}
        icon={icon}
        description={description}
        endComponent={endComponent}
      >
        {children}
      </ItemWithLabelIconAndDescription>
    </DropdownMenuPrimitive.RadioItem>
  )
);
DropdownMenuRadioItem.displayName = DropdownMenuPrimitive.RadioItem.displayName;

interface DropdownMenuTagItemProps
  extends Omit<DropdownMenuItemProps, "label" | "icon" | "onClick"> {
  label: string;
  size?: React.ComponentProps<typeof Chip>["size"];
  color?: React.ComponentProps<typeof Chip>["color"];
  icon?: React.ComponentProps<typeof Chip>["icon"];
  onRemove?: () => void;
  onClick?: () => void;
}

const DropdownMenuTagItem = React.forwardRef<
  HTMLDivElement,
  DropdownMenuTagItemProps
>(
  (
    {
      label,
      size = "xs",
      color = "primary",
      icon,
      onRemove,
      className,
      onClick,
      ...props
    },
    ref
  ) => {
    return (
      <DropdownMenuPrimitive.Item
        ref={ref}
        className={cn(menuStyleClasses.item({ variant: "tags" }), className)}
        {...props}
      >
        <Chip
          label={label}
          size={size}
          color={color}
          onRemove={onRemove}
          onClick={onClick}
          icon={icon}
        />
      </DropdownMenuPrimitive.Item>
    );
  }
);

DropdownMenuTagItem.displayName = "DropdownMenuTagItem";

interface DropdownMenuTagListProps {
  children: React.ReactNode;
  className?: string;
}

const DropdownMenuTagList = React.forwardRef<
  HTMLDivElement,
  DropdownMenuTagListProps
>(({ children, className }, ref) => {
  return (
    <div ref={ref} className={cn("flex flex-wrap", className)}>
      {children}
    </div>
  );
});

DropdownMenuTagList.displayName = "DropdownMenuTagList";

const DropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Label>,
  MutuallyExclusiveProps<
    React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label> & {
      inset?: boolean;
    },
    LabelAndIconProps
  >
>(({ children, className, inset, label, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={cn(
      menuStyleClasses.label,
      inset ? menuStyleClasses.inset : "",
      className
    )}
    {...props}
  >
    {label && <>{label}</>}
    {children}
  </DropdownMenuPrimitive.Label>
));
DropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName;

const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn(menuStyleClasses.separator, className)}
    {...props}
  />
));
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName;

type DropdownMenuShortcutProps = React.HTMLAttributes<HTMLSpanElement> & {
  shortcut?: KeyboardShortcutProps["shortcut"];
};

const DropdownMenuShortcut = ({
  className,
  shortcut,
  children,
  ...props
}: DropdownMenuShortcutProps) => {
  const resolvedShortcut = shortcut ?? "";

  if (!resolvedShortcut && children) {
    return (
      <span className={cn(className)} {...props}>
        {children}
      </span>
    );
  }

  return (
    <KeyboardShortcut
      shortcut={resolvedShortcut}
      className={cn(menuStyleClasses.shortcut, className)}
      {...props}
    />
  );
};
DropdownMenuShortcut.displayName = "DropdownMenuShortcut";

interface DropdownMenuSearchbarProps extends SearchInputProps {
  button?: React.ReactNode;
  autoFocus?: boolean;
}

const DropdownMenuSearchbar = React.forwardRef<
  HTMLInputElement,
  DropdownMenuSearchbarProps
>(
  (
    {
      placeholder,
      value,
      onChange,
      onKeyDown,
      name,
      className,
      disabled = false,
      isLoading = false,
      button,
      autoFocus,
    },
    ref
  ) => {
    const internalRef = useRef<HTMLInputElement>(null);
    React.useImperativeHandle<HTMLInputElement | null, HTMLInputElement | null>(
      ref,
      () => internalRef.current
    );

    React.useEffect(() => {
      if (autoFocus) {
        setTimeout(() => {
          internalRef.current?.focus();
        }, 0);
      }
    }, [autoFocus]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      e.stopPropagation();
      onKeyDown?.(e);
      if (!e.defaultPrevented) {
        if (e.key === "Enter") {
          e.preventDefault();
          const firstItem = getFirstOpenDropdownMenuItem();
          if (firstItem instanceof HTMLElement) {
            firstItem.click();
          }
        }
        if (e.key === "Tab" || e.key === "ArrowDown") {
          e.preventDefault();
          const firstItem = getFirstOpenDropdownMenuItem();
          if (firstItem instanceof HTMLElement) {
            firstItem.focus();
          }
        }
      }
    };

    return (
      <div
        className={cn("flex gap-1.5 p-1.5", className)}
        data-dropdown-searchbar
      >
        <SearchInput
          className="w-full"
          ref={internalRef}
          placeholder={placeholder}
          name={name}
          value={value}
          onChange={onChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          isLoading={isLoading}
        />
        {button}
      </div>
    );
  }
);

DropdownMenuSearchbar.displayName = "DropdownMenuSearchbar";

export interface DropdownMenuFilterOption<T extends string = string> {
  label: string;
  value: T;
}

interface DropdownMenuFiltersProps<T extends string> {
  filters: DropdownMenuFilterOption<T>[];
  selectedValues: T[];
  onSelectFilter: (value: T) => void;
  className?: string;
}

const DropdownMenuFiltersInner = <T extends string>(
  {
    filters,
    selectedValues = [] as T[],
    onSelectFilter,
    className,
  }: DropdownMenuFiltersProps<T>,
  ref: React.ForwardedRef<HTMLDivElement>
) => {
  const multiSelectionValues = Array.isArray(selectedValues)
    ? selectedValues
    : [];

  return (
    <div ref={ref} className={cn("flex flex-wrap gap-0.5 p-2", className)}>
      {filters.map((filter) => {
        const isSelected = multiSelectionValues.includes(filter.value);

        return (
          <Button
            key={filter.value}
            size="xs"
            variant={isSelected ? "primary" : "outline"}
            label={filter.label}
            onClick={() => onSelectFilter(filter.value)}
          />
        );
      })}
    </div>
  );
};

const DropdownMenuFilters = React.forwardRef(DropdownMenuFiltersInner) as {
  <T extends string>(
    props: DropdownMenuFiltersProps<T> & React.RefAttributes<HTMLDivElement>
  ): React.ReactElement | null;
  displayName?: string;
};

DropdownMenuFilters.displayName = "DropdownMenuFilters";

// DropdownTooltip: Simple tooltip with consistent layout: optional media at top, description below.
export interface DropdownTooltipProps {
  description: string;
  media?: React.ReactNode;
}

const DropdownTooltip = ({ description, media }: DropdownTooltipProps) => (
  <div className="space-y-4">
    {/* Media at top */}
    {media && <div className="rounded-sm">{media}</div>}

    {/* Description */}
    <p className="text-foreground text-sm font-normal">{description}</p>
  </div>
);

DropdownTooltip.displayName = "DropdownTooltip";

export interface DropdownTooltipTriggerProps {
  children: React.ReactElement;
  className?: string;
  description: string;
  media?: React.ReactNode;
  mountPortal?: boolean;
  mountPortalContainer?: HTMLElement;
  onVisibilityChange?: (visible: boolean) => void;
  side?: "left" | "right" | "top" | "bottom";
  sideOffset?: number;
}

const DropdownTooltipTrigger = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Trigger>,
  DropdownTooltipTriggerProps
>(
  (
    {
      children,
      className,
      description,
      media,
      mountPortal = true,
      mountPortalContainer,
      onVisibilityChange,
      side = "right",
      sideOffset = 8,
    },
    ref
  ) => {
    const [isOpen, setIsOpen] = React.useState(false);

    const handleOpenChange = React.useCallback(
      (open: boolean) => {
        setIsOpen(open);
        onVisibilityChange?.(open);
      },
      [onVisibilityChange]
    );

    React.useEffect(() => {
      if (!isOpen) {
        return;
      }

      const closeTooltip = () => {
        handleOpenChange(false);
      };

      window.addEventListener("scroll", closeTooltip, true);
      window.visualViewport?.addEventListener("scroll", closeTooltip);

      return () => {
        window.removeEventListener("scroll", closeTooltip, true);
        window.visualViewport?.removeEventListener("scroll", closeTooltip);
      };
    }, [handleOpenChange, isOpen]);

    const tooltipContent = (
      <TooltipPrimitive.Content
        side={side}
        sideOffset={sideOffset}
        className={cn(
          menuStyleClasses.container,
          menuStyleClasses.containerAnimation,
          "w-48 max-w-sm p-2 shadow-lg"
        )}
      >
        <DropdownTooltip description={description} media={media} />
      </TooltipPrimitive.Content>
    );

    const container = useSheetContainer(mountPortalContainer);

    return (
      <TooltipPrimitive.Provider delayDuration={700}>
        <TooltipPrimitive.Root open={isOpen} onOpenChange={handleOpenChange}>
          <TooltipPrimitive.Trigger asChild className={className} ref={ref}>
            {/* Wrapper allows pointer events even when child is disabled, while maintaining proper positioning */}
            <span className="block w-full">{children}</span>
          </TooltipPrimitive.Trigger>
          {mountPortal ? (
            <TooltipPrimitive.Portal container={container}>
              {tooltipContent}
            </TooltipPrimitive.Portal>
          ) : (
            tooltipContent
          )}
        </TooltipPrimitive.Root>
      </TooltipPrimitive.Provider>
    );
  }
);

DropdownTooltipTrigger.displayName = "DropdownTooltipTrigger";

interface DropdownMenuStaticItemProps {
  label: string;
  value?: string;
  children?: React.ReactNode;
  className?: string;
}

const DropdownMenuStaticItem = React.forwardRef<
  HTMLDivElement,
  DropdownMenuStaticItemProps
>(({ label, value, children, className }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex h-9 items-center gap-2 px-2 text-sm",
      "text-foreground",
      className
    )}
  >
    <span className="grow font-medium">{label}</span>
    {value && (
      <span className={cn("shrink-0", "text-muted-foreground")}>{value}</span>
    )}
    {children && <div className="shrink-0">{children}</div>}
  </div>
));
DropdownMenuStaticItem.displayName = "DropdownMenuStaticItem";

export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuFilters,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuStaticItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTagItem,
  DropdownMenuTagList,
  DropdownMenuTrigger,
  DropdownTooltipTrigger,
};
