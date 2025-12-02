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
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  MentionDropdownOnKeyDown,
  MentionDropdownProps,
} from "@app/components/editor/input_bar/types";
import { useMentionSuggestions } from "@app/lib/swr/mentions";
import { classNames } from "@app/lib/utils";

export const MentionDropdown = forwardRef<
  MentionDropdownOnKeyDown,
  MentionDropdownProps
>(({ query, clientRect, command, onClose, owner, conversationId }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const triggerRect = useMemo(
    () => (clientRect ? clientRect() : null),
    [clientRect]
  );

  // Fetch suggestions from server using the query.
  const { suggestions, isLoading } = useMentionSuggestions({
    workspaceId: owner.sId,
    conversationId,
    query,
    select: { agents: true, users: true },
  });

  const triggerRef = useRef<HTMLDivElement>(null);
  const [virtualTriggerStyle, setVirtualTriggerStyle] =
    useState<React.CSSProperties>({});

  const selectItem = (index: number) => {
    const item = suggestions[index];

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
        setSelectedIndex(
          (selectedIndex + suggestions.length - 1) % suggestions.length
        );
        return true;
      }

      if (event.key === "ArrowDown") {
        setSelectedIndex((selectedIndex + 1) % suggestions.length);
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    updateTriggerPosition();
  }, [updateTriggerPosition]);

  // Reset the selected index when items change (e.g., when query changes).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedIndex(0);
  }, [suggestions]);

  // Only render the dropdown if we have a valid trigger.
  if (!triggerRect) {
    return null;
  }

  // Generate a key based on content state to force remount when content size changes significantly.
  // This ensures Radix UI recalculates collision detection and positioning.
  const contentKey = isLoading
    ? "loading"
    : suggestions.length === 0
      ? "empty"
      : `results-${suggestions.length}`;

  return (
    <DropdownMenu open={true}>
      <DropdownMenuTrigger asChild>
        <div ref={triggerRef} style={virtualTriggerStyle} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        key={contentKey}
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
                  onClick={() => {
                    selectItem(index);
                  }}
                  onMouseEnter={() => {
                    setSelectedIndex(index);
                  }}
                >
                  <Avatar
                    size="xs"
                    visual={suggestion.pictureUrl}
                    isRounded={suggestion.type === "user"}
                  />
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
