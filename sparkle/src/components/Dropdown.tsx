import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { cva } from "class-variance-authority";
import * as React from "react";

import { DoubleIcon } from "@sparkle/components/DoubleIcon";
import { Icon } from "@sparkle/components/Icon";
import { LinkWrapper, LinkWrapperProps } from "@sparkle/components/LinkWrapper";
import { SearchInput, SearchInputProps } from "@sparkle/components/SearchInput";
import { CheckIcon, ChevronRightIcon, CircleIcon } from "@sparkle/icons";
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
    "s-z-50 s-min-w-[8rem] s-overflow-hidden",
    "data-[state=open]:s-animate-in data-[state=closed]:s-animate-out data-[state=closed]:s-fade-out-0 data-[state=open]:s-fade-in-0 data-[state=closed]:s-zoom-out-95 data-[state=open]:s-zoom-in-95 data-[side=bottom]:s-slide-in-from-top-2 data-[side=left]:s-slide-in-from-right-2 data-[side=right]:s-slide-in-from-left-2 data-[side=top]:s-slide-in-from-bottom-2"
  ),
  item: cva(
    cn(
      "s-relative s-flex s-gap-2 s-cursor-pointer s-select-none s-items-center s-outline-none s-rounded-md s-text-sm s-font-semibold s-px-2 s-py-2 s-transition-colors s-duration-300 data-[disabled]:s-pointer-events-none",
      "data-[disabled]:s-text-primary-400 dark:data-[disabled]:s-text-primary-400-night"
    ),
    {
      variants: {
        variant: {
          default: cn(
            "focus:s-text-foreground dark:focus:s-text-foreground-night",
            "hover:s-bg-muted-background dark:hover:s-bg-primary-900",
            "focus:s-bg-muted-background dark:focus:s-bg-primary-900"
          ),
          warning: cn(
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
  icon?: React.ComponentType;
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
  icon?: React.ComponentType;
  extraIcon?: React.ComponentType;
  description?: string;
  children?: React.ReactNode;
}

const ItemWithLabelIconAndDescription = <
  T extends ItemWithLabelIconAndDescriptionProps,
>({
  label,
  icon,
  extraIcon,
  description,
  children,
}: T) => {
  return (
    <>
      {label && (
        <div className="s-grid s-grid-cols-[auto,1fr,auto] s-items-center s-gap-x-1.5">
          {(icon || extraIcon) && (
            <div
              className={cn(
                "s-flex",
                description ? "s-items-start s-pt-0.5" : "s-items-center"
              )}
            >
              {icon && extraIcon ? (
                <DoubleIcon
                  mainIconProps={{
                    visual: icon,
                    size: "sm",
                  }}
                  secondaryIconProps={{
                    visual: extraIcon,
                    size: "xs",
                  }}
                  position="bottom-right"
                />
              ) : icon ? (
                <Icon size={description ? "sm" : "xs"} visual={icon} />
              ) : extraIcon ? (
                <Icon size="xs" visual={extraIcon} />
              ) : null}
            </div>
          )}
          <div className="s-flex s-flex-col">
            <span>{label}</span>
            {description && (
              <span className={menuStyleClasses.description}>
                {description}
              </span>
            )}
          </div>
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
    {label && (
      <>
        {icon && <Icon size="xs" visual={icon} />}
        {label}
        <span className={menuStyleClasses.subTrigger.default}>
          <Icon size="xs" visual={ChevronRightIcon} />
        </span>
      </>
    )}
    {children}
  </DropdownMenuPrimitive.SubTrigger>
));
DropdownMenuSubTrigger.displayName =
  DropdownMenuPrimitive.SubTrigger.displayName;

const DropdownMenuSubContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.SubContent
    ref={ref}
    className={cn(menuStyleClasses.container, "s-shadow-lg", className)}
    {...props}
  />
));
DropdownMenuSubContent.displayName =
  DropdownMenuPrimitive.SubContent.displayName;

interface DropdownMenuContentProps
  extends React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content> {
  mountPortal?: boolean;
}

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  DropdownMenuContentProps
>(({ className, sideOffset = 4, mountPortal = true, ...props }, ref) => {
  const content = (
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(menuStyleClasses.container, "s-shadow-md", className)}
      {...props}
    />
  );
  return mountPortal ? (
    <DropdownMenuPrimitive.Portal>{content}</DropdownMenuPrimitive.Portal>
  ) : (
    content
  );
});
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName;

export type DropdownMenuItemProps = MutuallyExclusiveProps<
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    inset?: boolean;
    variant?: ItemVariantType;
  } & Omit<LinkWrapperProps, "children" | "className">,
  LabelAndIconProps & {
    description?: string;
    extraIcon?: React.ComponentType;
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
      extraIcon,
      label,
      href,
      target,
      rel,
      asChild,
      replace,
      shallow,
      prefetch,
      ...props
    },
    ref
  ) => {
    return (
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
        <LinkWrapper
          href={href}
          target={target}
          rel={rel}
          replace={replace}
          shallow={shallow}
          prefetch={prefetch}
        >
          <ItemWithLabelIconAndDescription
            label={label}
            icon={icon}
            extraIcon={extraIcon}
            description={description}
          >
            {children}
          </ItemWithLabelIconAndDescription>
        </LinkWrapper>
      </DropdownMenuPrimitive.Item>
    );
  }
);
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;

const DropdownMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => (
  <DropdownMenuPrimitive.CheckboxItem
    ref={ref}
    className={cn(
      menuStyleClasses.item({ variant: "default" }),
      menuStyleClasses.inset,
      className
    )}
    checked={checked}
    {...props}
  >
    <span className={menuStyleClasses.subTrigger.span}>
      <DropdownMenuPrimitive.ItemIndicator>
        <Icon size="xs" visual={CheckIcon} />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.CheckboxItem>
));
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

interface DropdownMenuSearchbarProps extends SearchInputProps {}

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
    },
    ref
  ) => {
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      e.stopPropagation();
      onKeyDown?.(e);
    };

    return (
      <div className={cn("s-px-1 s-py-1", className)}>
        <SearchInput
          ref={ref}
          placeholder={placeholder}
          name={name}
          value={value}
          onChange={onChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
        />
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
  DropdownMenuTrigger,
};
