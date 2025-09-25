import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { cva } from "class-variance-authority";
import * as React from "react";
import { useRef } from "react";

import { Chip } from "@sparkle/components/Chip";
import { Icon } from "@sparkle/components/Icon";
import { LinkWrapper, LinkWrapperProps } from "@sparkle/components/LinkWrapper";
import { ScrollArea } from "@sparkle/components/ScrollArea";
import { SearchInput, SearchInputProps } from "@sparkle/components/SearchInput";
import { CheckIcon, ChevronRightIcon, CircleIcon } from "@sparkle/icons/app";
import { cn } from "@sparkle/lib/utils";

const ITEM_VARIANTS = ["default", "warning"] as const;

type ItemVariantType = (typeof ITEM_VARIANTS)[number];

export const menuStyleClasses = {
  inset: "s-pl-8",
  container: cn(
    "s-rounded-xl s-border-hovering s-p-1",
    "s-border s-border-border dark:s-border-border-night",
    "s-bg-background dark:s-bg-muted-background-night",
    "s-text-foreground dark:s-text-foreground-night",
    "s-z-50 s-min-w-[8rem]",
    "data-[state=open]:s-animate-in data-[state=closed]:s-animate-out data-[state=closed]:s-fade-out-0 data-[state=open]:s-fade-in-0 data-[state=closed]:s-zoom-out-95 data-[state=open]:s-zoom-in-95 data-[side=bottom]:s-slide-in-from-top-2 data-[side=left]:s-slide-in-from-right-2 data-[side=right]:s-slide-in-from-left-2 data-[side=top]:s-slide-in-from-bottom-2"
  ),
  item: cva(
    cn(
      "s-relative s-flex s-gap-2 s-cursor-pointer s-select-none s-items-center s-outline-none s-rounded-md s-text-sm s-font-semibold s-transition-colors s-duration-300 data-[disabled]:s-pointer-events-none",
      "data-[disabled]:s-text-primary-400 dark:data-[disabled]:s-text-primary-400-night"
    ),
    {
      variants: {
        variant: {
          default: cn(
            "s-p-2",
            "hover:s-bg-muted-background hover:dark:s-bg-muted-night",
            "focus:s-text-foreground dark:focus:s-text-foreground-night",
            "focus:s-bg-muted-background focus:dark:s-bg-muted-night"
          ),
          tags: cn(
            "s-p-0.5",
            "focus:s-text-foreground dark:focus:s-text-foreground-night",
            "hover:s-bg-muted-background dark:hover:s-bg-primary-900",
            "focus:s-bg-muted-background dark:focus:s-bg-primary-900"
          ),
          warning: cn(
            "s-p-2",
            "s-text-warning-500 dark:s-text-warning-500-night",
            "hover:s-bg-warning-50 dark:hover:s-bg-warning-50-night",
            "focus:s-bg-warning-50 dark:focus:s-bg-warning-50-night",
            "active:s-bg-warning-100 dark:active:s-bg-warning-100-night"
          ),
        },
      },
      defaultVariants: {
        variant: "default",
      },
    }
  ),
  subTrigger: {
    default: cn(
      "s-mr-1 s-ml-auto s-tracking-widest",
      "s-text-primary-400 dark:s-text-primary-400-night"
    ),
    span: "s-absolute s-left-2 s-flex s-h-3.5 s-w-3.5 s-items-center s-justify-center",
  },
  label: cn(
    "s-font-semibold s-px-2 s-py-2 s-text-xs",
    "s-text-muted-foreground dark:s-text-muted-foreground-night"
  ),
  description: cn(
    "s-grow s-truncate s-text-xs s-font-normal",
    "s-text-muted-foreground dark:s-text-muted-foreground-night"
  ),
  separator: cn(
    "-s-mx-1 s-my-1 s-h-px",
    "s-bg-separator dark:s-bg-separator-night"
  ),
  shortcut: cn(
    "s-ml-auto s-text-xs s-tracking-widest",
    "s-text-primary-400 dark:s-text-primary-400-night"
  ),
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

interface ItemWithLabelIconAndDescriptionProps {
  label?: string;
  icon?: React.ComponentType | React.ReactNode;
  description?: string;
  children?: React.ReactNode;
  truncate?: boolean;
  endComponent?: React.ReactNode;
}

const renderIcon = (
  icon: React.ComponentType | React.ReactNode,
  size: "xs" | "sm" = "xs"
) => {
  // If it's a React element (already rendered), return it as is
  if (React.isValidElement(icon)) {
    return icon;
  }

  // For any component type (including exotic components), render it with Icon
  if (typeof icon === "function" || typeof icon === "object") {
    return <Icon size={size} visual={icon as React.ComponentType} />;
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
}: T) => {
  return (
    <>
      {label && (
        <div
          className={cn(
            "s-grid s-flex-grow s-items-center s-gap-x-2.5",
            icon && endComponent
              ? "s-grid-cols-[auto,1fr,auto]"
              : icon
                ? "s-grid-cols-[auto,1fr]"
                : endComponent
                  ? "s-grid-cols-[1fr,auto]"
                  : "s-grid-cols-[1fr]"
          )}
        >
          {renderIcon(icon, "sm")}
          <div className={cn("s-flex s-flex-col", truncate && "s-truncate")}>
            <span className={cn(truncate ? "s-truncate" : "s-line-clamp-3")}>
              {label}
            </span>
            {description && (
              <span
                className={cn(
                  "s-text-xs s-font-normal s-text-muted-foreground dark:s-text-muted-foreground-night",
                  truncate ? "s-truncate" : "s-line-clamp-3"
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
      inset ? menuStyleClasses.inset : "",
      className
    )}
    {...props}
  >
    <ItemWithLabelIconAndDescription
      label={label}
      icon={icon}
      endComponent={<Icon size="xs" visual={ChevronRightIcon} />}
    >
      {children}
    </ItemWithLabelIconAndDescription>
  </DropdownMenuPrimitive.SubTrigger>
));
DropdownMenuSubTrigger.displayName =
  DropdownMenuPrimitive.SubTrigger.displayName;

const DropdownMenuSubContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>
>(({ className, children, ...props }, ref) => (
  <DropdownMenuPrimitive.SubContent
    ref={ref}
    className={cn(
      menuStyleClasses.container,
      "s-flex s-flex-col s-p-0 s-shadow-lg",
      className
    )}
    {...props}
  >
    <ScrollArea
      className="s-w-full s-flex-1"
      hideScrollBar={false}
      orientation="vertical"
      viewportClassName={cn(
        "s-flex-1",
        "s-max-h-[calc(var(--radix-dropdown-menu-content-available-height)-var(--header-height,20px))]"
      )}
    >
      {children}
    </ScrollArea>
  </DropdownMenuPrimitive.SubContent>
));
DropdownMenuSubContent.displayName =
  DropdownMenuPrimitive.SubContent.displayName;

interface DropdownMenuContentProps
  extends React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content> {
  mountPortal?: boolean;
  mountPortalContainer?: HTMLElement;
  dropdownHeaders?: React.ReactNode;
  preventAutoFocusOnClose?: boolean;
  onOpenAutoFocus?: (e: React.FocusEvent<HTMLDivElement>) => void;
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
      preventAutoFocusOnClose = true,
      onCloseAutoFocus,
      children,
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

    const content = (
      <DropdownMenuPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          menuStyleClasses.container,
          "s-flex s-flex-col s-p-0 s-shadow-md",
          dropdownHeaders && "s-h-80 xs:s-h-96", // We use dropdownHeaders for putting search bar, so we can set the height for the container
          className
        )}
        onCloseAutoFocus={handleCloseAutoFocus}
        {...props}
      >
        <div className="s-sticky s-top-0 s-bg-background dark:s-bg-background-night">
          {dropdownHeaders && dropdownHeaders}
        </div>
        <ScrollArea
          className="s-w-full s-flex-1"
          viewportClassName={cn(
            "s-flex-1",
            "s-max-h-[calc(var(--radix-dropdown-menu-content-available-height)-var(--header-height,20px))]"
          )}
        >
          {children}
        </ScrollArea>
      </DropdownMenuPrimitive.Content>
    );

    const [container, setContainer] = React.useState<Element | undefined>(
      mountPortalContainer
    );

    React.useEffect(() => {
      if (mountPortal && !container) {
        const dialogElements = document.querySelectorAll(
          ".s-sheet[role=dialog][data-state=open]"
        );
        const defaultContainer = dialogElements[dialogElements.length - 1];
        setContainer(defaultContainer);
      }
    }, []);

    return mountPortal ? (
      <DropdownMenuPrimitive.Portal
        container={mountPortalContainer ?? container}
      >
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
    variant?: ItemVariantType;
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
      ...props
    },
    ref
  ) => {
    return (
      <LinkWrapper
        href={href}
        target={target}
        rel={rel}
        replace={replace}
        shallow={shallow}
        prefetch={prefetch}
      >
        <DropdownMenuPrimitive.Item
          ref={ref}
          className={cn(
            menuStyleClasses.item({ variant }),
            inset ? menuStyleClasses.inset : "",
            className
          )}
          {...props}
          asChild={asChild}
        >
          <div className="s-h-full s-w-full">
            <ItemWithLabelIconAndDescription
              label={label}
              icon={icon}
              description={description}
              truncate={truncateText}
              endComponent={endComponent}
            >
              {children}
            </ItemWithLabelIconAndDescription>
          </div>
        </DropdownMenuPrimitive.Item>
      </LinkWrapper>
    );
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
        menuStyleClasses.inset,
        className
      )}
      {...props}
    >
      <span className={menuStyleClasses.subTrigger.span}>
        <DropdownMenuPrimitive.ItemIndicator>
          <Icon size="xs" visual={CheckIcon} />
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
    LabelAndIconProps & { description?: string }
  >
>(({ className, children, description, label, icon, ...props }, ref) => (
  <DropdownMenuPrimitive.RadioItem
    ref={ref}
    className={cn(
      menuStyleClasses.item({ variant: "default" }),
      menuStyleClasses.inset,
      className
    )}
    {...props}
  >
    <span className={menuStyleClasses.subTrigger.span}>
      <DropdownMenuPrimitive.ItemIndicator>
        <Icon size="xs" visual={CircleIcon} />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    <ItemWithLabelIconAndDescription
      label={label}
      icon={icon}
      description={description}
    >
      {children}
    </ItemWithLabelIconAndDescription>
  </DropdownMenuPrimitive.RadioItem>
));
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
    <div ref={ref} className={cn("s-flex s-flex-wrap", className)}>
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

const DropdownMenuShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => {
  return (
    <span className={cn(menuStyleClasses.shortcut, className)} {...props} />
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
          const firstItem = document.querySelector(
            '[data-radix-menu-content][data-state=open] [role="menuitem"]'
          );
          if (firstItem instanceof HTMLElement) {
            firstItem.click();
          }
        }
        if (e.key === "Tab" || e.key === "ArrowDown") {
          e.preventDefault();
          const firstItem = document.querySelector(
            '[data-radix-menu-content][data-state=open] [role="menuitem"]'
          );
          if (firstItem instanceof HTMLElement) {
            firstItem.focus();
          }
        }
      }
    };

    return (
      <div className={cn("s-flex s-gap-1.5 s-p-1.5", className)}>
        <SearchInput
          className="w-full"
          ref={internalRef}
          placeholder={placeholder}
          name={name}
          value={value}
          onChange={onChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
        />
        {button}
      </div>
    );
  }
);

DropdownMenuSearchbar.displayName = "DropdownMenuSearchbar";

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
      "s-flex s-h-9 s-items-center s-gap-2 s-px-2 s-text-sm",
      "s-text-foreground dark:s-text-foreground-night",
      className
    )}
  >
    <span className="s-grow s-font-semibold">{label}</span>
    {value && (
      <span
        className={cn(
          "s-shrink-0",
          "s-text-muted-foreground dark:s-text-muted-foreground-night"
        )}
      >
        {value}
      </span>
    )}
    {children && <div className="s-shrink-0">{children}</div>}
  </div>
));
DropdownMenuStaticItem.displayName = "DropdownMenuStaticItem";

export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
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
};
