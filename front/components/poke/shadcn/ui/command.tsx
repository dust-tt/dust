"use client";

import { Dialog, DialogContent, MagnifyingGlassIcon } from "@dust-tt/sparkle";
import type { DialogProps } from "@radix-ui/react-dialog";
import { Command as CommandPrimitive } from "cmdk";
import Link from "next/link";
import * as React from "react";

import { cn } from "@app/components/poke/shadcn/lib/utils";

const CommandContext = React.createContext<{
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
}>({
  selectedIndex: 0,
  setSelectedIndex: () => {},
});

const Command = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
  <CommandPrimitive
    ref={ref}
    className={cn(
      "bg-popover text-popover-foreground flex h-full w-full flex-col overflow-hidden rounded-md",
      className
    )}
    {...props}
  />
));
Command.displayName = CommandPrimitive.displayName;

type CommandDialogProps = DialogProps & {
  className?: string;
  shouldFilter?: boolean;
};

const CommandDialog = ({
  children,
  className,
  onOpenChange,
  open,
  shouldFilter,
  ...props
}: CommandDialogProps) => {
  const [selectedIndex, setSelectedIndex] = React.useState(0);

  // Create a context to share the selection state.
  const commandContext = React.useMemo(
    () => ({
      selectedIndex,
      setSelectedIndex,
    }),
    [selectedIndex]
  );

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) {
        return;
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((current) => {
            const items = document.querySelectorAll("[cmdk-item]");
            if (current >= items.length - 1) {
              return 0;
            }
            return current + 1;
          });
          break;

        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((current) => {
            const items = document.querySelectorAll("[cmdk-item]");
            if (current <= 0) {
              return items.length - 1;
            }
            return current - 1;
          });
          break;

        case "Enter":
          e.preventDefault();
          const selectedItem = document.querySelector(
            `[cmdk-item][data-index="${selectedIndex}"]`
          );
          if (selectedItem instanceof HTMLElement) {
            selectedItem.click();
          }
          break;

        case "Escape":
          if (onOpenChange) {
            onOpenChange(false);
          }
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange, selectedIndex]);

  // Reset selection when dialog opens/closes.
  React.useEffect(() => {
    setSelectedIndex(0);
  }, [open]);

  return (
    <CommandContext.Provider value={commandContext}>
      <Dialog onOpenChange={onOpenChange} open={open} {...props}>
        <DialogContent className={cn("overflow-hidden p-0", className)}>
          <Command
            shouldFilter={shouldFilter}
            className={cn(
              "text-muted-foreground dark:text-muted-foreground-night",
              "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium",
              "[&_[cmdk-group-heading]]:text-muted-foreground",
              "dark:[&_[cmdk-group-heading]]:text-muted-foreground-night",
              "[&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2",
              "[&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12",
              "[&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5"
            )}
          >
            {children}
          </Command>
        </DialogContent>
      </Dialog>
    </CommandContext.Provider>
  );
};

const CommandInput = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Input>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(({ className, ...props }, ref) => (
  <div className="flex items-center border-b px-3" cmdk-input-wrapper="">
    <MagnifyingGlassIcon className="mb-3 mr-2 h-4 w-4 shrink-0 opacity-50" />
    <CommandPrimitive.Input
      ref={ref}
      className={cn(
        "mb-3 flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none",
        "placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
        "dark:placeholder:text-muted-foreground-night",
        className
      )}
      {...props}
    />
  </div>
));

CommandInput.displayName = CommandPrimitive.Input.displayName;

const CommandList = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.List
    ref={ref}
    className={cn("max-h-[300px] overflow-y-auto overflow-x-hidden", className)}
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
    className="py-6 text-center text-sm"
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
      "overflow-hidden p-1 text-foreground dark:text-foreground-night",
      "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5",
      "[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium",
      "[&_[cmdk-group-heading]]:text-muted-foreground",
      "dark:[&_[cmdk-group-heading]]:text-muted-foreground-night",
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
    className={cn("-mx-1 h-px bg-border", className)}
    {...props}
  />
));
CommandSeparator.displayName = CommandPrimitive.Separator.displayName;

const CommandItem = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item> & {
    index?: number;
    href?: string;
  }
>(({ children, className, href, index, ...props }, ref) => {
  const { selectedIndex } = React.useContext(CommandContext);

  const isSelected = typeof index === "number" && index === selectedIndex;
  const linkRef = React.useRef<HTMLAnchorElement>(null);

  const handleSelect = () => {
    if (href && linkRef.current) {
      linkRef.current.click();
    }
  };

  const content = (
    <CommandPrimitive.Item
      ref={ref}
      className={cn(
        "aria-selected:bg-accent aria-selected:text-accent-foreground relative flex cursor-pointer",
        "items-center rounded-sm px-2 py-1.5 text-sm outline-none",
        isSelected && "bg-accent text-warning-800",
        className
      )}
      data-index={index}
      onSelect={handleSelect}
      {...props}
    >
      {children}
    </CommandPrimitive.Item>
  );

  return href ? (
    <Link ref={linkRef} href={href} className="block">
      {content}
    </Link>
  ) : (
    content
  );
});

CommandItem.displayName = CommandPrimitive.Item.displayName;

const CommandShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => {
  return (
    <span
      className={cn(
        "ml-auto text-xs tracking-widest text-muted-foreground",
        "dark:text-muted-foreground-night",
        className
      )}
      {...props}
    />
  );
};
CommandShortcut.displayName = "CommandShortcut";

export {
  Command as PokeCommand,
  CommandDialog as PokeCommandDialog,
  CommandEmpty as PokeCommandEmpty,
  CommandGroup as PokeCommandGroup,
  CommandInput as PokeCommandInput,
  CommandItem as PokeCommandItem,
  CommandList as PokeCommandList,
  CommandSeparator as PokeCommandSeparator,
  CommandShortcut as PokeCommandShortcut,
};
