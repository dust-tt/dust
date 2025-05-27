import {
  Avatar,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import { Spinner } from "@dust-tt/sparkle";
import React, { useEffect, useRef, useState } from "react";

import type { EditorSuggestion } from "@app/components/assistant/conversation/input_bar/editor/suggestion";
import { classNames } from "@app/lib/utils";

interface MentionDropdownProps {
  suggestions: EditorSuggestion[];
  onSelect: (suggestion: EditorSuggestion) => void;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  triggerRect?: DOMRect | null;
  selectedIndex: number;
  onSelectedIndexChange: (index: number) => void;
}

export const MentionDropdown = ({
  suggestions,
  onSelect,
  isOpen,
  onOpenChange,
  triggerRect,
  selectedIndex,
  onSelectedIndexChange,
}: MentionDropdownProps) => {
  const triggerRef = useRef<HTMLDivElement>(null);
  const [virtualTriggerStyle, setVirtualTriggerStyle] =
    useState<React.CSSProperties>({});

  // Update virtual trigger position based on triggerRect
  useEffect(() => {
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

  // Reset selected index when suggestions change
  useEffect(() => {
    onSelectedIndexChange(0);
  }, [suggestions, onSelectedIndexChange]);

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
        {suggestions.length > 0 ? (
          suggestions.map((suggestion, index) => (
            <DropdownMenuItem
              key={suggestion.id}
              icon={() => <Avatar size="xs" visual={suggestion.pictureUrl} />}
              className={classNames(
                "flex cursor-pointer flex-col items-center gap-2 px-2 py-2",
                index === selectedIndex
                  ? "bg-muted-background dark:bg-primary-900"
                  : ""
              )}
              onClick={() => onSelect(suggestion)}
              onMouseEnter={() => onSelectedIndexChange(index)}
              onSelect={(e) => e.preventDefault()}
              label={suggestion.label}
            />
          ))
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Spinner />
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
