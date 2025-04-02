"use client";

import { type DialogProps } from "@radix-ui/react-dialog";
import { Command as CommandPrimitive } from "cmdk";
import * as React from "react";

import { Dialog, DialogContent, Input } from "@sparkle/components";
import { menuStyleClasses } from "@sparkle/components/Dropdown";
import { cn } from "@sparkle/lib";

const Command = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
  <CommandPrimitive
    ref={ref}
    className={cn(
      "flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground",
      className
    )}
    {...props}
  />
));
Command.displayName = CommandPrimitive.displayName;

const CommandDialog = ({ children, ...props }: DialogProps) => {
  return (
    <Dialog {...props}>
      <DialogContent className="s-overflow-hidden s-p-0">
        <Command className="[&_[cmdk-group-heading]]:s-p-2 [&_[cmdk-group-heading]]:s-font-medium [&_[cmdk-group-heading]]:s-text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:s-pt-0 [&_[cmdk-group]]:s-px-2 [&_[cmdk-input-wrapper]_svg]:s-h-5 [&_[cmdk-input-wrapper]_svg]:s-w-5 [&_[cmdk-input]]:s-h-12 [&_[cmdk-item]]:s-px-2 [&_[cmdk-item]]:s-py-3 [&_[cmdk-item]_svg]:s-h-5 [&_[cmdk-item]_svg]:s-w-5">
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  );
};

const CommandInput = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Input>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(({ className, ...props }, ref) => (
  <div
    className="s-flex s-w-full s-items-center s-border-b s-p-3 dark:s-border-border-night"
    cmdk-input-wrapper=""
  >
    <CommandPrimitive.Input
      asChild
      ref={ref}
      className={cn(className, "s-min-w-full")}
      {...props}
    >
      <Input
        isInCommandPalette
        className="s-h-10 s-w-full s-min-w-full s-rounded-md s-bg-transparent s-py-3 s-text-sm s-outline-none placeholder:s-text-muted-foreground disabled:s-cursor-not-allowed disabled:s-opacity-50"
      />
    </CommandPrimitive.Input>
  </div>
));

CommandInput.displayName = CommandPrimitive.Input.displayName;

const CommandList = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.List
    ref={ref}
    className={cn(
      "s-max-h-[300px] s-overflow-y-auto s-overflow-x-hidden",
      className
    )}
    {...props}
  />
));

CommandList.displayName = CommandPrimitive.List.displayName;

const CommandEmpty = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Empty>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>((props, ref) => (
  <CommandPrimitive.Empty
    ref={ref}
    className="s-py-6 s-text-center s-text-sm"
    {...props}
  />
));

CommandEmpty.displayName = CommandPrimitive.Empty.displayName;

const CommandGroup = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Group>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Group
    ref={ref}
    className={cn(
      "s-overflow-hidden s-p-1 s-text-foreground [&_[cmdk-group-heading]]:s-px-2 [&_[cmdk-group-heading]]:s-py-1.5 [&_[cmdk-group-heading]]:s-text-xs [&_[cmdk-group-heading]]:s-font-medium [&_[cmdk-group-heading]]:s-text-muted-foreground [&_[cmdk-group-items]]:s-pb-1",
      menuStyleClasses,
      className
    )}
    {...props}
  />
));

CommandGroup.displayName = CommandPrimitive.Group.displayName;

const CommandSeparator = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Separator
    ref={ref}
    className={cn(
      "-s-mx-1 s-h-px s-bg-border dark:s-bg-border-night",
      className
    )}
    {...props}
  />
));
CommandSeparator.displayName = CommandPrimitive.Separator.displayName;

const CommandItem = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Item
    ref={ref}
    className={cn(
      "[&_svg]:s-size-4 s-relative s-flex s-cursor-default s-select-none s-items-center s-gap-2 s-rounded-sm s-px-2 s-py-1.5 s-text-sm s-outline-none data-[disabled=true]:s-pointer-events-none data-[selected=true]:s-bg-muted-background data-[selected=true]:s-text-foreground data-[disabled=true]:s-opacity-50 dark:data-[selected=true]:s-bg-primary-900 dark:data-[selected=true]:s-text-foreground-night [&_svg]:s-pointer-events-none [&_svg]:s-shrink-0",
      className
    )}
    {...props}
  />
));

CommandItem.displayName = CommandPrimitive.Item.displayName;

const CommandShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => {
  return (
    <span
      className={cn(
        "s-ml-auto s-text-xs s-tracking-widest s-text-muted-foreground",
        className
      )}
      {...props}
    />
  );
};
CommandShortcut.displayName = "CommandShortcut";

export {
  Command as SamsCommand,
  CommandDialog as SamsCommandDialog,
  CommandEmpty as SamsCommandEmpty,
  CommandGroup as SamsCommandGroup,
  CommandInput as SamsCommandInput,
  CommandItem as SamsCommandItem,
  CommandList as SamsCommandList,
  CommandSeparator as SamsCommandSeparator,
  CommandShortcut as SamsCommandShortcut,
};
