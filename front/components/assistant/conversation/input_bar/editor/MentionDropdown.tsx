import {
  Avatar,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  Spinner,
} from "@dust-tt/sparkle";
import React, { useCallback, useEffect, useRef, useState } from "react";

import type { EditorSuggestion } from "@app/components/assistant/conversation/input_bar/editor/suggestion";
import { classNames } from "@app/lib/utils";

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
        // On iOS based browsers, the position is not correct without adding the offsetTop.
        // Something related to the position calculation when there is a scrollable area.
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

  // Only render the dropdown if we have a valid trigger.
  if (!triggerRect) {
    return null;
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <div ref={triggerRef} style={virtualTriggerStyle} />
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
                  className={classNames(
                    "flex items-center gap-x-2 px-2 py-1",
                    "w-full flex-initial cursor-pointer text-left text-sm font-semibold",
                    index === selectedIndex
                      ? "text-highlight-500"
                      : "text-foreground dark:text-foreground-night"
                  )}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onSelect(suggestion);
                  }}
                  onMouseDown={(e) => {
                    // This prevents the browser from taking focus away from the editor when onClick is triggered
                    e.preventDefault();
                  }}
                  onMouseEnter={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onSelectedIndexChange(index);
                  }}
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
