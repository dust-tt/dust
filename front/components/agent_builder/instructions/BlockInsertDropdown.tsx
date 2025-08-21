import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import React, { useCallback, useEffect, useRef, useState } from "react";

import type {
  BlockInsertDropdownState as DropdownState,
  BlockSuggestion,
} from "@app/components/agent_builder/instructions/useBlockInsertDropdown";

interface BlockInsertDropdownProps {
  blockDropdownState: DropdownState & {
    onSelect: (suggestion: BlockSuggestion) => void;
    onOpenChange: (open: boolean) => void;
    onSelectedIndexChange: (index: number) => void;
  };
}

export const BlockInsertDropdown = ({
  blockDropdownState,
}: BlockInsertDropdownProps) => {
  const {
    suggestions,
    onSelect,
    isOpen,
    onOpenChange,
    triggerRect,
    selectedIndex,
    onSelectedIndexChange,
  } = blockDropdownState;

  const triggerRef = useRef<HTMLDivElement>(null);
  const [virtualTriggerStyle, setVirtualTriggerStyle] =
    useState<React.CSSProperties>({});

  const updateTriggerPosition = useCallback(() => {
    if (triggerRect && triggerRef.current) {
      setVirtualTriggerStyle({
        position: "fixed",
        left: triggerRect.left,
        top: triggerRect.top + (window.visualViewport?.offsetTop ?? 0),
        width: 1,
        height: triggerRect.height || 1,
        pointerEvents: "none",
        zIndex: -1,
      });
    }
  }, [triggerRect]);

  useEffect(() => {
    updateTriggerPosition();
  }, [triggerRect, updateTriggerPosition]);

  // Early return if not open to prevent any focus interference
  if (!isOpen) {
    return null;
  }

  // Check for valid trigger rect
  if (!triggerRect) {
    return null;
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <div ref={triggerRef} style={virtualTriggerStyle} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-48"
        align="start"
        side="bottom"
        sideOffset={4}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="px-3 pb-0.5 pt-1">
          <span className="text-xs font-medium text-muted-foreground">
            Insert
          </span>
        </div>
        {suggestions.length === 0 ? (
          <div className="flex h-12 w-full items-center justify-center text-sm text-muted-foreground">
            No matching blocks
          </div>
        ) : (
          <div className="flex flex-col gap-y-1 p-1">
            {suggestions.map((suggestion, index) => {
              const Icon = suggestion.icon;
              return (
                <button
                  key={suggestion.id}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left",
                    index === selectedIndex
                      ? "bg-muted-background dark:bg-muted-background-night"
                      : "text-foreground hover:bg-muted"
                  )}
                  onClick={() => onSelect(suggestion)}
                  onMouseEnter={() => onSelectedIndexChange(index)}
                >
                  <div
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded",
                      index === selectedIndex ? "bg-muted" : "bg-muted/50"
                    )}
                  >
                    <Icon className="h-3 w-3" />
                  </div>
                  <span className="text-sm font-medium">
                    {suggestion.label}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
