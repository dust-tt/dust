import type { EditorSuggestion } from "@app/ui/components/input_bar/editor/suggestion";
import {
  Avatar,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  Spinner,
} from "@dust-tt/sparkle";
import React, { useCallback, useEffect, useRef, useState } from "react";

interface MentionDropdownProps {
  mentionDropdownState: {
    suggestions: EditorSuggestion[];
    onSelect: (suggestion: EditorSuggestion) => void;
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    triggerRect?: DOMRect | null;
    selectedIndex: number;
    onSelectedIndexChange: (index: number) => void;
    isLoading: boolean;
  };
}

export const MentionDropdown = ({
  mentionDropdownState: {
    suggestions,
    onSelect,
    isOpen,
    onOpenChange,
    triggerRect,
    selectedIndex,
    onSelectedIndexChange,
    isLoading,
  },
}: MentionDropdownProps) => {
  const triggerRef = useRef<HTMLDivElement>(null);
  const [virtualTriggerStyle, setVirtualTriggerStyle] =
    useState<React.CSSProperties>({});

  const updateTriggerPosition = useCallback(() => {
    if (triggerRect && triggerRef.current) {
      setVirtualTriggerStyle({
        position: "fixed",
        left: triggerRect.left,
        top: triggerRect.bottom,
        width: 1,
        height: 1,
        pointerEvents: "none",
        zIndex: -1,
      });
    }
  }, [triggerRect]);

  useEffect(() => {
    updateTriggerPosition();
  }, [triggerRect, updateTriggerPosition]);

  return (
    <DropdownMenu open={isOpen} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <div
          ref={triggerRef}
          style={virtualTriggerStyle}
          className="absolute"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-72"
        align="start"
        side="bottom"
        sideOffset={4}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {isLoading ? (
          <div className="flex h-12 w-full items-center justify-center">
            <Spinner />
          </div>
        ) : suggestions.length > 0 ? (
          <div className="flex flex-col gap-y-1 p-1">
            {suggestions.map((suggestion, index) => (
              <div key={suggestion.id}>
                <button
                  className={cn(
                    "flex items-center gap-x-2 px-2 py-1",
                    "flex-initial cursor-pointer text-left text-sm font-semibold",
                    index === selectedIndex
                      ? "text-highlight-500"
                      : "text-foreground dark:text-foreground-night"
                  )}
                  onClick={() => onSelect(suggestion)}
                  onMouseEnter={() => onSelectedIndexChange(index)}
                >
                  <Avatar size="xs" visual={suggestion.pictureUrl} />
                  <span className="truncate" title={suggestion.label}>
                    {suggestion.label}
                  </span>
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-12 w-full items-center justify-center text-sm text-muted-foreground">
            No result
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
