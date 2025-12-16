import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import { emojis } from "@tiptap/extension-emoji";
import shuffle from "lodash/shuffle";
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
  EmojiDropdownOnKeyDown,
  EmojiDropdownProps,
} from "@app/components/editor/input_bar/types";
import { classNames } from "@app/lib/utils";

// Curated list of commonly used emoji names
const POPULAR_EMOJI_NAMES = [
  "smiley",
  "joy",
  "heart",
  "+1",
  "fire",
  "tada",
  "heart_eyes",
  "thinking",
  "eyes",
  "rocket",
  "white_check_mark",
  "x",
  "wave",
  "clap",
  "pray",
  "bulb",
  "sparkles",
  "star",
  "100",
];

const EMOJIS_MAP = new Map(emojis.map((emoji) => [emoji.name, emoji]));

const POPULAR_EMOJIS = POPULAR_EMOJI_NAMES.map((name) =>
  EMOJIS_MAP.get(name)
).filter((emoji) => emoji !== undefined);

export const EmojiDropdown = forwardRef<
  EmojiDropdownOnKeyDown,
  EmojiDropdownProps
>(({ query, clientRect, command, onClose }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const triggerRect = useMemo(
    () => (clientRect ? clientRect() : null),
    [clientRect]
  );

  // Get popular emojis by matching names from the full emoji list

  // Filter emojis based on query
  const filteredEmojis = useMemo(() => {
    if (!query) {
      // Show curated popular emojis when no query
      return shuffle(POPULAR_EMOJIS).slice(0, 5);
    }

    const lowerQuery = query.toLowerCase();
    return emojis
      .filter((emoji) => {
        // Search in shortcodes and tags
        return (
          emoji.shortcodes?.some((code) => code.includes(lowerQuery)) ||
          emoji.tags?.some((tag) => tag.includes(lowerQuery))
        );
      })
      .slice(0, 20); // Limit to 20 results
  }, [query]);

  const triggerRef = useRef<HTMLDivElement>(null);
  const [virtualTriggerStyle, setVirtualTriggerStyle] =
    useState<React.CSSProperties>({});
  const selectedItemRef = useRef<HTMLButtonElement>(null);

  const selectItem = (index: number) => {
    const emoji = filteredEmojis[index];
    if (emoji) {
      command({ name: emoji.name });
    }
  };

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

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === "ArrowUp") {
        setSelectedIndex(
          (selectedIndex + filteredEmojis.length - 1) % filteredEmojis.length
        );
        return true;
      }

      if (event.key === "ArrowDown") {
        if (filteredEmojis.length === 0) {
          return false;
        }
        setSelectedIndex((selectedIndex + 1) % filteredEmojis.length);
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

  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredEmojis]);

  useEffect(() => {
    if (selectedItemRef.current) {
      selectedItemRef.current.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    }
  }, [selectedIndex]);

  if (!triggerRect) {
    return null;
  }

  const contentKey =
    filteredEmojis.length === 0 ? "empty" : `results-${filteredEmojis.length}`;

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
        {filteredEmojis.length > 0 ? (
          <div className="flex max-h-60 flex-col gap-y-1 overflow-y-auto p-1">
            {filteredEmojis.map((emoji, index) => (
              <div key={emoji.name}>
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
                    <span className="text-2xl">{emoji.emoji}</span>
                    <span className="truncate">
                      :{emoji.shortcodes?.[0] || emoji.name}:
                    </span>
                  </div>
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-12 w-full items-center justify-center text-sm text-muted-foreground">
            No emoji found
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

EmojiDropdown.displayName = "EmojiDropdown";
