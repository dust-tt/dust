import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import type { EmojiMartData } from "@emoji-mart/data";
import data from "@emoji-mart/data";
import { init, SearchIndex } from "emoji-mart";
import shuffle from "lodash/shuffle";
import React, {
  forwardRef,
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

// Type the imported data, emoji-mart types are not the best
const emojiData = data as unknown as EmojiMartData;

// Curated list of commonly used emoji IDs (short codes)
const POPULAR_EMOJI_IDS = [
  "grinning",
  "joy",
  "heart",
  "+1",
  "fire",
  "tada",
  "heart_eyes",
  "thinking_face",
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

// Get popular emojis from emoji-mart data
const POPULAR_EMOJIS = POPULAR_EMOJI_IDS.map((id) => {
  const emoji = emojiData.emojis[id];
  return emoji
    ? {
        id,
        name: emoji.name,
        native: emoji.skins[0].native,
        shortcodes: emoji.id,
      }
    : null;
}).filter((emoji): emoji is NonNullable<typeof emoji> => emoji !== null);

type EmojiResult = {
  id: string;
  name: string;
  native: string;
  shortcodes: string;
};

export const EmojiDropdown = forwardRef<
  EmojiDropdownOnKeyDown,
  EmojiDropdownProps
>(({ query, clientRect, command, onClose }, ref) => {
  const [emojiMartInitialized, setEmojiMartInitialized] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filteredEmojis, setFilteredEmojis] = useState<EmojiResult[]>([]);
  const triggerRect = clientRect?.();

  useMemo(() => {
    // Initialize emoji-mart with data
    const _init = async () => {
      await init({ data: emojiData });
      setEmojiMartInitialized(true);
    };

    // eslint-disable-next-line react-hooks/set-state-in-render
    void _init();
  }, []);

  // Filter emojis based on query using emoji-mart's search
  useEffect(() => {
    if (!query) {
      // Show curated popular emojis when no query
      setFilteredEmojis(shuffle(POPULAR_EMOJIS).slice(0, 5));
      return;
    }

    const searchEmoji = async () => {
      // Use emoji-mart's search functionality
      const results = await SearchIndex.search(query, {
        maxResults: 20,
        caller: "EmojiDropdown",
      });
      const emojis = (results ?? []).map((result: any) => ({
        id: result.id,
        name: result.name,
        native: result.skins[0].native,
        shortcodes: result.id,
      }));
      setFilteredEmojis(emojis);
    };

    void searchEmoji();
  }, [query, emojiMartInitialized]);

  const selectedItemRef = useRef<HTMLDivElement>(null);

  const selectItem = (index: number) => {
    const emoji = filteredEmojis[index];
    if (emoji) {
      command({ name: emoji.id });
    }
  };

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

  const virtualTriggerStyle: React.CSSProperties = {
    position: "fixed",
    left: triggerRect.left,
    top:
      triggerRect.top +
      (typeof window === "undefined"
        ? 0
        : (window.visualViewport?.offsetTop ?? 0)),
    width: 1,
    height: triggerRect.height || 1,
    pointerEvents: "none",
    zIndex: -1,
    padding: 0,
    minWidth: 0,
    border: "none",
    background: "transparent",
  };

  return (
    <DropdownMenu open={true}>
      <DropdownMenuTrigger asChild>
        <div style={virtualTriggerStyle} />
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
          <div className="max-h-60">
            {filteredEmojis.map((emoji, index) => (
              <DropdownMenuItem
                key={emoji.id}
                ref={index === selectedIndex ? selectedItemRef : null}
                className={
                  index === selectedIndex
                    ? "text-highlight-500"
                    : "text-foreground dark:text-foreground-night"
                }
                onClick={() => {
                  selectItem(index);
                }}
                onMouseEnter={() => {
                  setSelectedIndex(index);
                }}
              >
                <div className="flex min-w-0 flex-1 items-center gap-x-2">
                  <span className="text-2xl">{emoji.native}</span>
                  <span className="truncate">:{emoji.shortcodes}:</span>
                </div>
              </DropdownMenuItem>
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
