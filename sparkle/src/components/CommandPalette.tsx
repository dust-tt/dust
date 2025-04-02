"use client";

import React, { useEffect, useRef } from "react";

import { cn } from "@sparkle/lib/utils";

import { useCommandPalette } from "../hooks/useCommandPalette";
import {
  SamsCommand,
  SamsCommandDialog,
  SamsCommandEmpty,
  SamsCommandGroup,
  SamsCommandInput,
  SamsCommandItem,
  SamsCommandList,
} from "./SamsCommandPalette";

export const CommandPalette: React.FC = () => {
  const { commands, isOpen, setOpen, closeCommandPalette } =
    useCommandPalette();
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the input when the palette opens
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
      return priorityA - priorityB; // Lower priority first
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
          <SamsCommandEmpty>No results found.</SamsCommandEmpty>
          {sortedCategories.map((category, categoryIndex) => (
            <SamsCommandGroup key={category} heading={category}>
              {groupedCommands[category].map((command, commandIndex) => (
                <SamsCommandItem
                  key={command.id}
                  onSelect={() => {
                    command.action();
                    // Optionally close the palette after executing a command
                    closeCommandPalette();
                  }}
                  className={cn(
                    "s-relative s-flex s-items-center s-gap-2 s-rounded-md s-px-2 s-py-1.5 s-text-sm s-font-medium",
                    command.id.includes("warning")
                      ? "s-text-warning-500 data-[selected=true]:s-bg-warning-50 data-[selected=true]:s-text-warning-500"
                      : "s-text-foreground data-[selected=true]:s-bg-muted-background data-[selected=true]:s-text-foreground",

                    // if it's the last one, rounded-b-md"
                    categoryIndex === sortedCategories.length - 1 &&
                      commandIndex === groupedCommands[category].length - 1
                      ? "s-rounded-b-xl"
                      : ""
                  )}
                >
                  {command.icon && (
                    <span className="s-mr-2 s-flex s-h-5 s-w-5 s-items-center s-justify-center">
                      {command.icon}
                    </span>
                  )}
                  <span>{command.label}</span>
                  {command.shortcut && (
                    <span className="s-ml-auto s-text-xs s-tracking-widest s-text-muted-foreground">
                      {command.shortcut}
                    </span>
                  )}
                </SamsCommandItem>
              ))}
            </SamsCommandGroup>
          ))}
        </SamsCommandList>
      </SamsCommand>
    </SamsCommandDialog>
  );
};
