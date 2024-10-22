import * as ContextMenuPrimitive from "@radix-ui/react-context-menu";
import * as React from "react";

import { Icon } from "@sparkle/components/Icon";
import { menuStyleClasses } from "@sparkle/components/NewDropdown";
import { CheckIcon, ChevronRightIcon, CircleIcon } from "@sparkle/icons";
import { classNames } from "@sparkle/lib/utils";

const ContextMenu = ContextMenuPrimitive.Root;
const ContextMenuTrigger = ContextMenuPrimitive.Trigger;
const ContextMenuGroup = ContextMenuPrimitive.Group;
const ContextMenuPortal = ContextMenuPrimitive.Portal;
const ContextMenuSub = ContextMenuPrimitive.Sub;
const ContextMenuRadioGroup = ContextMenuPrimitive.RadioGroup;

const ContextMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubTrigger> & {
    inset?: boolean;
    label: string;
    icon?: React.ComponentType;
    shortcut?: string;
  }
>(({ className, inset, icon, label, shortcut, ...props }, ref) => (
  <ContextMenuPrimitive.SubTrigger
    ref={ref}
    className={classNames(
      menuStyleClasses.item,
      inset ? menuStyleClasses.inset : "",
      className || ""
    )}
    {...props}
  >
    {icon && <Icon size="xs" visual={icon} />}
    {label}
    {shortcut && <ContextMenuShortcut>⇧{shortcut}</ContextMenuShortcut>}
    <span className={menuStyleClasses.subTrigger.default}>
      <Icon size="xs" visual={ChevronRightIcon} />
    </span>
  </ContextMenuPrimitive.SubTrigger>
));
ContextMenuSubTrigger.displayName = ContextMenuPrimitive.SubTrigger.displayName;

const ContextMenuSubContent = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubContent>
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.SubContent
    ref={ref}
    className={classNames(
      menuStyleClasses.container,
      "s-shadow-lg",
      className || ""
    )}
    {...props}
  />
));
ContextMenuSubContent.displayName = ContextMenuPrimitive.SubContent.displayName;

const ContextMenuContent = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Content>
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.Portal>
    <ContextMenuPrimitive.Content
      ref={ref}
      className={classNames(
        menuStyleClasses.container,
        "s-bg-white s-shadow-md",
        className || ""
      )}
      {...props}
    />
  </ContextMenuPrimitive.Portal>
));
ContextMenuContent.displayName = ContextMenuPrimitive.Content.displayName;

const ContextMenuItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Item> & {
    inset?: boolean;
    label: string;
    icon?: React.ComponentType;
    shortcut?: string;
  }
>(({ className, inset, label, icon, shortcut, ...props }, ref) => (
  <ContextMenuPrimitive.Item
    ref={ref}
    className={classNames(
      menuStyleClasses.item,
      inset ? menuStyleClasses.inset : "",
      className || ""
    )}
    {...props}
  >
    {icon && <Icon size="xs" visual={icon} />}
    {label}
    {shortcut && <ContextMenuShortcut>⇧{shortcut}</ContextMenuShortcut>}
  </ContextMenuPrimitive.Item>
));
ContextMenuItem.displayName = ContextMenuPrimitive.Item.displayName;

const ContextMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => (
  <ContextMenuPrimitive.CheckboxItem
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
      <ContextMenuPrimitive.ItemIndicator>
        <Icon size="xs" visual={CheckIcon} />
      </ContextMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </ContextMenuPrimitive.CheckboxItem>
));
ContextMenuCheckboxItem.displayName =
  ContextMenuPrimitive.CheckboxItem.displayName;

const ContextMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.RadioItem>
>(({ className, children, ...props }, ref) => (
  <ContextMenuPrimitive.RadioItem
    ref={ref}
    className={classNames(
      menuStyleClasses.item,
      menuStyleClasses.inset,
      className || ""
    )}
    {...props}
  >
    <span className={menuStyleClasses.subTrigger.span}>
      <ContextMenuPrimitive.ItemIndicator>
        <Icon size="xs" visual={CircleIcon} />
      </ContextMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </ContextMenuPrimitive.RadioItem>
));
ContextMenuRadioItem.displayName = ContextMenuPrimitive.RadioItem.displayName;

const ContextMenuLabel = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Label> & {
    inset?: boolean;
  }
>(({ className, inset, ...props }, ref) => (
  <ContextMenuPrimitive.Label
    ref={ref}
    className={classNames(
      menuStyleClasses.label,
      inset ? menuStyleClasses.inset : "",
      className || ""
    )}
    {...props}
  />
));
ContextMenuLabel.displayName = ContextMenuPrimitive.Label.displayName;

const ContextMenuSeparator = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.Separator
    ref={ref}
    className={classNames(menuStyleClasses.separator, className || "")}
    {...props}
  />
));
ContextMenuSeparator.displayName = ContextMenuPrimitive.Separator.displayName;

const ContextMenuShortcut = ({
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
ContextMenuShortcut.displayName = "ContextMenuShortcut";

export {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuPortal,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
};
