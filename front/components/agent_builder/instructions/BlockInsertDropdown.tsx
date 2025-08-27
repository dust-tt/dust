import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import React, { useCallback, useEffect, useRef, useState } from "react";

import type {
  BlockInsertDropdownView as DropdownView,
  BlockSuggestion,
} from "@app/components/agent_builder/instructions/useBlockInsertDropdown";

interface BlockInsertDropdownProps {
  blockDropdownState: DropdownView & {
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

  if (!isOpen) {
    return null;
  }

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
        <div className="px-2 pb-0.5 pt-1">
          <span className="text-xs font-medium text-muted-foreground">
            Insert
          </span>
        </div>
        {suggestions.length === 0 ? (
          <div className="flex h-12 w-full items-center justify-center text-sm text-muted-foreground">
            No matching blocks
          </div>
        ) : (
          <>
            {suggestions.map((suggestion, index) => {
              const Icon = suggestion.icon;
              return (
                <DropdownMenuItem
                  key={suggestion.id}
                  icon={() => <Icon className="h-3.5 w-3.5" />}
                  label={suggestion.label}
                  className={cn(
                    index === selectedIndex &&
                      "bg-muted-background dark:bg-muted-background-night"
                  )}
                  onClick={() => onSelect(suggestion)}
                  onMouseEnter={() => onSelectedIndexChange(index)}
                />
              );
            })}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
