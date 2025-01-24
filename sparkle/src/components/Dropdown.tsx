import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { cva } from "class-variance-authority";
import * as React from "react";

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
    "s-rounded-xl s-border s-border-hovering s-bg-white s-p-1 s-text-primary-950",
    "s-min-w-[8rem] s-overflow-hidden",
    "data-[state=open]:s-animate-in data-[state=closed]:s-animate-out data-[state=closed]:s-fade-out-0 data-[state=open]:s-fade-in-0 data-[state=closed]:s-zoom-out-95 data-[state=open]:s-zoom-in-95 data-[side=bottom]:s-slide-in-from-top-2 data-[side=left]:s-slide-in-from-right-2 data-[side=right]:s-slide-in-from-left-2 data-[side=top]:s-slide-in-from-bottom-2"
  ),
  item: cva(
    "s-relative s-flex s-gap-2 s-cursor-pointer s-select-none s-items-center s-outline-none s-rounded-md s-text-sm s-font-medium s-px-2 s-py-2 s-transition-colors s-duration-300 data-[disabled]:s-pointer-events-none data-[disabled]:s-text-primary-400",
    {
      variants: {
        variant: {
          default:
            "focus:s-text-primary-950 hover:s-bg-primary-150 focus:s-bg-primary-150",
          warning:
            "s-text-warning-500 hover:s-bg-warning-50 focus:s-bg-warning-50 active:s-bg-warning-100",
        },
      },
      defaultVariants: {
        variant: "default",
      },
    }
  ),
  subTrigger: {
    default: "s-mr-1 s-ml-auto s-tracking-widest s-text-primary-400",
    span: "s-absolute s-left-2 s-flex s-h-3.5 s-w-3.5 s-items-center s-justify-center",
  },
  label: "s-font-semibold s-px-2 s-py-2 s-text-xs s-text-muted-foreground",
  description:
    "s-grow s-truncate s-text-xs s-text-muted-foreground s-font-normal",
  separator: "-s-mx-1 s-my-1 s-h-px s-bg-separator",
  shortcut: "s-ml-auto s-text-xs s-tracking-widest s-text-primary-400",
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
  description?: string;
  children?: React.ReactNode;
}

const ItemWithLabelIconAndDescription = <
  T extends ItemWithLabelIconAndDescriptionProps,
>({
  label,
  icon,
  description,
  children,
}: T) => {
  return (
    <>
      {label && (
        <div className="s-grid s-grid-cols-[auto,1fr] s-items-center s-gap-x-1.5">
          {icon && (
            <div
              className={cn(
                "s-flex",
                description ? "s-items-start s-pt-0.5" : "s-items-center"
              )}
            >
              <Icon size="xs" visual={icon} />
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

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(menuStyleClasses.container, "s-shadow-md", className)}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
));
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName;

export type DropdownMenuItemProps = MutuallyExclusiveProps<
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    inset?: boolean;
    variant?: ItemVariantType;
  } & Omit<LinkWrapperProps, "children" | "className">,
  LabelAndIconProps & {
    description?: string;
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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
};
