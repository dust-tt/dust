import {
  Avatar,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  Spinner,
} from "@dust-tt/sparkle";
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import type {
  MentionDropdownOnKeyDown,
  MentionDropdownProps,
} from "@app/components/assistant/conversation/input_bar/editor/types";
import { classNames } from "@app/lib/utils";

export const MentionDropdown = forwardRef<
  MentionDropdownOnKeyDown,
  MentionDropdownProps
>(({ items, clientRect, command, onClose }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const isLoading = false;
  const triggerRect = clientRect ? clientRect() : null;
  const triggerRef = useRef<HTMLDivElement>(null);
  const [virtualTriggerStyle, setVirtualTriggerStyle] =
    useState<React.CSSProperties>({});

  const selectItem = (index: number) => {
    const item = items[index];

    if (item) {
      command(item);
    }
  };

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

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === "ArrowUp") {
        setSelectedIndex((selectedIndex + items.length - 1) % items.length);
        return true;
      }

      if (event.key === "ArrowDown") {
        setSelectedIndex((selectedIndex + 1) % items.length);
        return true;
      }

      if (event.key === "Enter" || event.key === "Tab") {
        selectItem(selectedIndex);
        return true;
      }

      return false;
    },
  }));

  useEffect(() => {
    updateTriggerPosition();
  }, [triggerRect, updateTriggerPosition]);

  // Only render the dropdown if we have a valid trigger.
  if (!triggerRect) {
    return null;
  }

  return (
    <DropdownMenu open={true}>
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
        onEscapeKeyDown={() => {
          onClose?.();
        }}
        onInteractOutside={() => {
          onClose?.();
        }}
      >
        {isLoading ? (
          <div className="flex h-12 w-full items-center justify-center">
            <Spinner />
          </div>
        ) : items.length > 0 ? (
          <div className="flex flex-col gap-y-1 p-1">
            {items.map((suggestion, index) => (
              <div key={suggestion.id}>
                <button
                  className={classNames(
                    "flex items-center gap-x-2 px-2 py-1",
                    "w-full flex-initial cursor-pointer text-left text-sm font-semibold",
                    index === selectedIndex
                      ? "text-highlight-500"
                      : "text-foreground dark:text-foreground-night"
                  )}
                  onClick={() => {
                    selectItem(index);
                  }}
                  onMouseEnter={() => {
                    setSelectedIndex(index);
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
});

MentionDropdown.displayName = "MentionDropdown";
