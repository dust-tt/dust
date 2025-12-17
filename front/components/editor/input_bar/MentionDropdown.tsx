import {
  Avatar,
  Chip,
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
} from "@app/components/editor/input_bar/types";
import { useMentionSuggestions } from "@app/lib/swr/mentions";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import { classNames } from "@app/lib/utils";

export const MentionDropdown = forwardRef<
  MentionDropdownOnKeyDown,
  MentionDropdownProps
>(
  (
    {
      query,
      clientRect,
      command,
      onClose,
      owner,
      conversationId,
      includeCurrentUser,
      select,
    },
    ref
  ) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    // Call clientRect() on every render to get the latest position.
    // This avoids caching stale coordinates that may be invalid (0,0) when typing @ quickly after refresh.
    const triggerRect = clientRect?.();

    const featureFlags = useFeatureFlags({ workspaceId: owner.sId });
    const mentionsV2 = featureFlags.hasFeature("mentions_v2");

    // Fetch suggestions from server using the query.
    // Backend handles all prioritization logic (participants, preferred agent, etc.)
    const { suggestions, isLoading } = useMentionSuggestions({
      workspaceId: owner.sId,
      conversationId,
      query,
      select,
      includeCurrentUser,
    });

    const triggerRef = useRef<HTMLDivElement>(null);
    const [virtualTriggerStyle, setVirtualTriggerStyle] =
      useState<React.CSSProperties>({});
    const selectedItemRef = useRef<HTMLButtonElement>(null);

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
          if (suggestions.length === 0) {
            return false;
          }
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
      updateTriggerPosition();
    }, [updateTriggerPosition]);

    // Reset the selected index when items change (e.g., when query changes).
    useEffect(() => {
      setSelectedIndex(0);
    }, [suggestions]);

    // Scroll selected item into view when selection changes.
    useEffect(() => {
      if (selectedItemRef.current) {
        selectedItemRef.current.scrollIntoView({
          block: "nearest",
          behavior: "smooth",
        });
      }
    }, [selectedIndex]);

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

    // Don't render the dropdown if there are no results
    if (mentionsV2 && suggestions.length === 0 && !isLoading) {
      return null;
    }

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
            <div className="flex max-h-60 flex-col gap-y-1 overflow-y-auto p-1">
              {suggestions.map((suggestion, index) => (
                <div key={suggestion.id}>
                  <button
                    ref={index === selectedIndex ? selectedItemRef : null}
                    className={classNames(
                      "flex items-center px-2 py-1",
                      "w-full flex-initial cursor-pointer text-left text-sm",
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
                    <div className="flex min-w-0 flex-1 items-center gap-x-2">
                      <Avatar
                        size="xs"
                        visual={suggestion.pictureUrl}
                        isRounded={suggestion.type === "user"}
                      />
                      <span
                        className="truncate font-semibold"
                        title={suggestion.label}
                      >
                        {suggestion.label}
                      </span>
                    </div>
                    {suggestion.type === "user" && (
                      <Chip
                        size="mini"
                        color="primary"
                        label="User"
                        className="ml-2 shrink-0"
                      />
                    )}
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
  }
);

MentionDropdown.displayName = "MentionDropdown";
