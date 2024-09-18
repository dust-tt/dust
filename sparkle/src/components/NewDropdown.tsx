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

const itemClasses = classNames(
  "s-relative s-flex s-gap-2 s-cursor-pointer s-select-none s-items-center s-outline-none",
  "s-rounded-md s-text-sm s-font-medium focus:s-text-primary-900 focus:s-bg-primary-100 s-px-2 s-py-2",
  "s-transition-colors s-duration-300 data-[disabled]:s-pointer-events-none data-[disabled]:s-opacity-50"
);

const containerClasses = classNames(
  "s-rounded-lg s-border s-border-structure-100 s-bg-white s-p-1 s-text-primary-900 s-shadow-md",
  "s-z-50 s-min-w-[8rem] s-overflow-hidden",
  "data-[state=open]:s-animate-in data-[state=closed]:s-animate-out data-[state=closed]:s-fade-out-0 data-[state=open]:s-fade-in-0 data-[state=closed]:s-zoom-out-95 data-[state=open]:s-zoom-in-95 data-[side=bottom]:s-slide-in-from-top-2 data-[side=left]:s-slide-in-from-right-2 data-[side=right]:s-slide-in-from-left-2 data-[side=top]:s-slide-in-from-bottom-2"
);

const NewDropdownMenu = DropdownMenuPrimitive.Root;
const NewDropdownMenuTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Trigger> & {
    customClass?: string; // Optional custom class prop
  } & MetaButtonProps // Extend with MetaButtonProps to pass props like variant and size
>(({ customClass, className, children, variant, size, ...props }, ref) => (
  <DropdownMenuPrimitive.Trigger asChild>
    {/* Use MetaButton and pass variant and size */}
    <MetaButton
      ref={ref}
      variant={variant || "primary"} // Default variant
      size={size || "sm"} // Default size
      className={classNames(
        customClass || "", // Allow passing custom classes
        className || ""
      )}
      {...props}
    >
      {children}
      <Icon size="xs" visual={ChevronDownIcon} className="-s-mr-1" />
    </MetaButton>
  </DropdownMenuPrimitive.Trigger>
));
NewDropdownMenuTrigger.displayName = "NewDropdownMenuTrigger";

export default NewDropdownMenuTrigger;

const NewDropdownMenuGroup = DropdownMenuPrimitive.Group;
const NewDropdownMenuPortal = DropdownMenuPrimitive.Portal;
const NewDropdownMenuSub = DropdownMenuPrimitive.Sub;
const NewDropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;
const NewDropdownMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger> & {
    inset?: boolean;
  }
>(({ className, inset, children, ...props }, ref) => (
  <DropdownMenuPrimitive.SubTrigger
    ref={ref}
    className={classNames(
      itemClasses,
      inset ? "s-pl-8" : "",
      className ? className : ""
    )}
    {...props}
  >
    {children}
    <span className="-s-mr-1 s-ml-auto s-tracking-widest s-text-primary-400">
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
      containerClasses,
      "s-shadow-lg",
      className ? className : ""
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
        containerClasses,
        "s-shadow-md",
        className ? className : ""
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
      itemClasses,
      inset ? "s-pl-8" : "",
      className ? className : ""
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
      "focus:s-text-primary-900-foreground s-relative s-flex s-cursor-default s-select-none s-items-center s-rounded-md s-py-2 s-pl-8 s-pr-2 s-text-sm s-outline-none s-transition-colors focus:s-bg-primary-200 data-[disabled]:s-pointer-events-none data-[disabled]:s-opacity-50",
      className ? className : ""
    )}
    checked={checked}
    {...props}
  >
    <span className="s-absolute s-left-2 s-flex s-h-3.5 s-w-3.5 s-items-center s-justify-center">
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
      "focus:s-text-primary-900-foreground s-relative s-flex s-cursor-default s-select-none s-items-center s-rounded-md s-py-2 s-pl-8 s-pr-2 s-text-sm s-outline-none s-transition-colors focus:s-bg-primary-200 data-[disabled]:s-pointer-events-none data-[disabled]:s-opacity-50",
      className ? className : ""
    )}
    {...props}
  >
    <span className="s-absolute s-left-2 s-flex s-h-3.5 s-w-3.5 s-items-center s-justify-center">
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
      "s-px-2 s-py-1.5 s-text-sm s-font-semibold s-text-primary-500",
      inset ? "s-pl-8" : "",
      className ? className : ""
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
    className={classNames(
      "-s-mx-1 s-my-1 s-h-px s-bg-structure-100",
      className ? className : ""
    )}
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
      className={classNames(
        "s-ml-auto s-text-xs s-tracking-widest s-text-primary-400",
        className ? className : ""
      )}
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
