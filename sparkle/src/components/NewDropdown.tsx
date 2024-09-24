import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import * as React from "react";

import { MetaButton, MetaButtonProps } from "@sparkle/components/NewButton";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleIcon,
  Icon,
} from "@sparkle/index_with_tw_base";
import { classNames } from "@sparkle/lib/utils";

export const menuStyleClasses = {
  inset: "s-pl-8",
  container: classNames(
    "s-rounded-lg s-border s-border-structure-100 s-bg-white s-p-1 s-text-primary-950",
    "s-z-50 s-min-w-[8rem] s-overflow-hidden",
    "data-[state=open]:s-animate-in data-[state=closed]:s-animate-out data-[state=closed]:s-fade-out-0 data-[state=open]:s-fade-in-0 data-[state=closed]:s-zoom-out-95 data-[state=open]:s-zoom-in-95 data-[side=bottom]:s-slide-in-from-top-2 data-[side=left]:s-slide-in-from-right-2 data-[side=right]:s-slide-in-from-left-2 data-[side=top]:s-slide-in-from-bottom-2"
  ),
  item: classNames(
    "s-relative s-flex s-gap-2 s-cursor-pointer s-select-none s-items-center s-outline-none",
    "s-rounded-md s-text-sm s-font-medium focus:s-text-primary-950 focus:s-bg-primary-100 s-px-2 s-py-2",
    "s-transition-colors s-duration-300 data-[disabled]:s-pointer-events-none data-[disabled]:s-text-primary-400"
  ),
  subTrigger: {
    default: "s-mr-1 s-ml-auto s-tracking-widest s-text-primary-400",
    span: "s-absolute s-left-2 s-flex s-h-3.5 s-w-3.5 s-items-center s-justify-center",
  },
  label: "s-font-regular s-px-2 s-py-2 s-text-sm s-text-primary-500",
  separator: "-s-mx-1 s-my-1 s-h-px s-bg-structure-100",
  shortcut: "s-ml-auto s-text-xs s-tracking-widest s-text-primary-400",
};

const NewDropdownMenu = DropdownMenuPrimitive.Root;
const NewDropdownMenuGroup = DropdownMenuPrimitive.Group;
const NewDropdownMenuPortal = DropdownMenuPrimitive.Portal;
const NewDropdownMenuSub = DropdownMenuPrimitive.Sub;
const NewDropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

const NewDropdownMenuTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Trigger> & {
    customClass?: string;
  } & MetaButtonProps
>(({ customClass, className, children, variant, size, ...props }, ref) => (
  <DropdownMenuPrimitive.Trigger asChild>
    <MetaButton
      ref={ref}
      variant={variant || "primary"}
      size={size || "sm"}
      className={classNames(customClass || "", className || "")}
      {...props}
    >
      {children}
      <Icon size="xs" visual={ChevronDownIcon} className="-s-mr-1" />
    </MetaButton>
  </DropdownMenuPrimitive.Trigger>
));
NewDropdownMenuTrigger.displayName = "NewDropdownMenuTrigger";

const NewDropdownMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger> & {
    inset?: boolean;
  }
>(({ className, inset, children, ...props }, ref) => (
  <DropdownMenuPrimitive.SubTrigger
    ref={ref}
    className={classNames(
      menuStyleClasses.item,
      inset ? menuStyleClasses.inset : "",
      className || ""
    )}
    {...props}
  >
    {children}
    <span className={menuStyleClasses.subTrigger.default}>
      <Icon size="xs" visual={ChevronRightIcon} />
    </span>
  </DropdownMenuPrimitive.SubTrigger>
));
NewDropdownMenuSubTrigger.displayName =
  DropdownMenuPrimitive.SubTrigger.displayName;

const NewDropdownMenuSubContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.SubContent
    ref={ref}
    className={classNames(
      menuStyleClasses.container,
      "s-shadow-lg",
      className || ""
    )}
    {...props}
  />
));
NewDropdownMenuSubContent.displayName =
  DropdownMenuPrimitive.SubContent.displayName;

const NewDropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={classNames(
        menuStyleClasses.container,
        "s-shadow-md",
        className || ""
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
));
NewDropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName;

const NewDropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    inset?: boolean;
  }
>(({ className, inset, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={classNames(
      menuStyleClasses.item,
      inset ? menuStyleClasses.inset : "",
      className || ""
    )}
    {...props}
  />
));
NewDropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;

const NewDropdownMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => (
  <DropdownMenuPrimitive.CheckboxItem
    ref={ref}
    className={classNames(
      menuStyleClasses.item,
      menuStyleClasses.inset,
      className || ""
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
NewDropdownMenuCheckboxItem.displayName =
  DropdownMenuPrimitive.CheckboxItem.displayName;

const NewDropdownMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>
>(({ className, children, ...props }, ref) => (
  <DropdownMenuPrimitive.RadioItem
    ref={ref}
    className={classNames(
      menuStyleClasses.item,
      menuStyleClasses.inset,
      className || ""
    )}
    {...props}
  >
    <span className={menuStyleClasses.subTrigger.span}>
      <DropdownMenuPrimitive.ItemIndicator>
        <Icon size="xs" visual={CircleIcon} />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.RadioItem>
));
NewDropdownMenuRadioItem.displayName =
  DropdownMenuPrimitive.RadioItem.displayName;

const NewDropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label> & {
    inset?: boolean;
  }
>(({ className, inset, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={classNames(
      menuStyleClasses.label,
      inset ? menuStyleClasses.inset : "",
      className || ""
    )}
    {...props}
  />
));
NewDropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName;

const NewDropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={classNames(menuStyleClasses.separator, className || "")}
    {...props}
  />
));
NewDropdownMenuSeparator.displayName =
  DropdownMenuPrimitive.Separator.displayName;

const NewDropdownMenuShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => {
  return (
    <span
      className={classNames(menuStyleClasses.shortcut, className || "")}
      {...props}
    />
  );
};
NewDropdownMenuShortcut.displayName = "NewDropdownMenuShortcut";

export {
  NewDropdownMenu,
  NewDropdownMenuCheckboxItem,
  NewDropdownMenuContent,
  NewDropdownMenuGroup,
  NewDropdownMenuItem,
  NewDropdownMenuLabel,
  NewDropdownMenuPortal,
  NewDropdownMenuRadioGroup,
  NewDropdownMenuRadioItem,
  NewDropdownMenuSeparator,
  NewDropdownMenuShortcut,
  NewDropdownMenuSub,
  NewDropdownMenuSubContent,
  NewDropdownMenuSubTrigger,
  NewDropdownMenuTrigger,
};
