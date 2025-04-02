"use client";

import React, { useEffect, useRef } from "react";

import { Icon, Tooltip } from "@sparkle/components";
import {
  SamsCommand,
  SamsCommandDialog,
  SamsCommandGroup,
  SamsCommandInput,
  SamsCommandItem,
  SamsCommandList,
} from "@sparkle/components/SamsCommandPalette";
import { cn } from "@sparkle/lib/utils";

import { useCommandPalette } from "../hooks/useCommandPalette";

export function CommandPalette() {
  const inputRef = useRef<HTMLInputElement>(null);
  const { commands, isOpen, setOpen, closeCommandPalette } =
    useCommandPalette();

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      // Use a small timeout to ensure the dialog is fully rendered before focusing
      const focusTimeout = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);

      return () => clearTimeout(focusTimeout);
    }
  }, [isOpen]);

  // Group commands by category
  const groupedCommands = commands.reduce<Record<string, typeof commands>>(
    (acc, command) => {
      const category = command.category || "General";
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(command);
      return acc;
    },
    {}
  );

  // Sort categories and commands
  const sortedCategories = Object.keys(groupedCommands).sort();

  // Sort commands by priority (if specified)
  Object.keys(groupedCommands).forEach((category) => {
    groupedCommands[category].sort((a, b) => {
      const priorityA = a.priority ?? 0;
      const priorityB = b.priority ?? 0;
      return priorityA - priorityB; // 0 is highest priority
    });
  });

  return (
    <SamsCommandDialog open={isOpen} onOpenChange={setOpen}>
      <SamsCommand>
        <SamsCommandInput
          ref={inputRef}
          placeholder="Type a command or search..."
          autoFocus
        />
        <SamsCommandList>
          {sortedCategories.map((category, categoryIndex) => (
            <SamsCommandGroup key={category} heading={category}>
              {groupedCommands[category].map(
                ({ icon: CommandIcon, ...command }, commandIndex) => {
                  const commandContent = (
                    <SamsCommandItem
                      key={command.id}
                      disabled={command.disabled}
                      onSelect={() => {
                        command.action();
                        if (command.closeCommandPaletteOnAction) {
                          closeCommandPalette();
                        }
                      }}
                      className={cn(
                        "s-relative s-flex s-items-center s-gap-2 s-rounded-md s-px-2 s-py-1.5 s-text-sm s-font-medium",
                        "s-relative s-flex s-cursor-pointer s-select-none s-items-center s-gap-2 s-rounded-md s-px-2 s-py-2 s-text-sm s-font-semibold s-outline-none s-transition-colors s-duration-300",
                        "data-[disabled]:s-text-primary-400 dark:data-[disabled]:s-text-primary-400-night",
                        "focus:s-text-foreground dark:focus:s-text-foreground-night",
                        "hover:s-bg-muted-background dark:hover:s-bg-primary-900",

                        command.id.includes("warning") &&
                          "s-text-warning-500 data-[selected=true]:s-bg-warning-50 data-[selected=true]:s-text-warning-500 dark:s-text-warning-500-night dark:data-[selected=true]:s-bg-warning-100-night dark:data-[selected=true]:s-text-warning-500-night",

                        // if it's the last one, rounded-b-xl"
                        categoryIndex === sortedCategories.length - 1 &&
                          commandIndex === groupedCommands[category].length - 1
                          ? "s-rounded-b-xl"
                          : ""
                      )}
                    >
                      {CommandIcon ? <Icon visual={CommandIcon} /> : null}
                      <span>{command.label}</span>
                      {command.shortcut ? (
                        <span className="s-ml-auto s-text-xs s-tracking-widest s-text-muted-foreground dark:s-text-muted-foreground-night">
                          {command.shortcut}
                        </span>
                      ) : null}
                    </SamsCommandItem>
                  );

                  const withTooltip =
                    command?.tooltip ||
                    (command?.disabled && command?.disabledTooltip);

                  if (!withTooltip) {
                    return commandContent;
                  }

                  const tooltipContent = command?.disabled
                    ? command?.disabledTooltip
                    : command?.tooltip;

                  return (
                    <Tooltip
                      trigger={<div className="s-w-full">{commandContent}</div>}
                      label={tooltipContent}
                      tooltipTriggerAsChild
                    />
                  );
                }
              )}
            </SamsCommandGroup>
          ))}
        </SamsCommandList>
      </SamsCommand>
    </SamsCommandDialog>
  );
}
