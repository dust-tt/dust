import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownTooltipTrigger,
} from "@dust-tt/sparkle";
import type { SuggestionProps } from "@tiptap/suggestion";
import type React from "react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

interface SlashCommandTooltip {
  description: string;
  media?: React.ReactNode;
}

const DEFAULT_EMPTY_MESSAGE = "No commands found";
const DEFAULT_LIST_MAX_HEIGHT = "24rem";
export interface SlashCommand {
  action: string;
  description?: string;
  icon: React.ComponentType<any>;
  id: string;
  label: string;
  tooltip?: SlashCommandTooltip;
}

export interface SlashCommandDropdownProps
  extends Pick<
    SuggestionProps<SlashCommand>,
    "clientRect" | "command" | "items"
  > {
  emptyMessage?: string;
  header?: string;
  listMaxHeight?: string;
  onClose?: () => void;
  showScrollFade?: boolean;
  size?: "default" | "wide";
}

export interface SlashCommandDropdownRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export const SlashCommandDropdown = forwardRef<
  SlashCommandDropdownRef,
  SlashCommandDropdownProps
>(
  (
    {
      items,
      command,
      clientRect,
      emptyMessage = DEFAULT_EMPTY_MESSAGE,
      header,
      listMaxHeight = DEFAULT_LIST_MAX_HEIGHT,
      onClose,
      showScrollFade = false,
      size = "default",
    },
    ref
  ) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [canScrollDown, setCanScrollDown] = useState(false);
    const itemCount = items.length;
    const listRef = useRef<HTMLDivElement>(null);
    const [virtualTriggerStyle, setVirtualTriggerStyle] =
      useState<React.CSSProperties>({});

    const selectItem = useCallback(
      (index: number) => {
        const item = items[index];
        if (item) {
          command(item);
        }
      },
      [command, items]
    );

    useImperativeHandle(
      ref,
      () => ({
        onKeyDown: ({ event }) => {
          if (items.length === 0) {
            return false;
          }

          if (event.key === "ArrowDown") {
            event.preventDefault();
            setSelectedIndex(
              (prevSelectedIndex) => (prevSelectedIndex + 1) % items.length
            );
            return true;
          }

          if (event.key === "ArrowUp") {
            event.preventDefault();
            setSelectedIndex(
              (prevSelectedIndex) =>
                (prevSelectedIndex + items.length - 1) % items.length
            );
            return true;
          }

          if (event.key === "Enter" || event.key === "Tab") {
            event.preventDefault();
            selectItem(selectedIndex);
            return true;
          }

          return false;
        },
      }),
      [selectItem, selectedIndex, items.length]
    );

    const updateCanScrollDown = useCallback(() => {
      const list = listRef.current;

      if (!showScrollFade || !list) {
        setCanScrollDown(false);
        return;
      }

      setCanScrollDown(
        list.scrollTop + list.clientHeight < list.scrollHeight - 1
      );
    }, [showScrollFade]);

    // Reset selected index when items change.
    // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
    useEffect(() => {
      setSelectedIndex(0);
    }, [items]);

    useEffect(() => {
      if (itemCount === 0) {
        setCanScrollDown(false);
        return;
      }

      updateCanScrollDown();

      const list = listRef.current;
      if (!list || typeof ResizeObserver === "undefined") {
        return;
      }

      const resizeObserver = new ResizeObserver(updateCanScrollDown);
      resizeObserver.observe(list);

      return () => resizeObserver.disconnect();
    }, [itemCount, updateCanScrollDown]);

    // Update virtual trigger position.
    const updateTriggerPosition = useCallback(() => {
      const triggerRect = clientRect?.();
      if (triggerRect) {
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
    }, [clientRect]);

    useEffect(() => {
      updateTriggerPosition();

      const viewport = window.visualViewport;
      if (viewport) {
        // Event triggered when hitting CMD +/-.
        viewport.addEventListener("resize", updateTriggerPosition);
        return () => {
          viewport.removeEventListener("resize", updateTriggerPosition);
        };
      }
    }, [updateTriggerPosition]);

    return (
      <DropdownMenu open={true}>
        <DropdownMenuTrigger asChild>
          <div style={virtualTriggerStyle} />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className={size === "wide" ? "w-80" : "w-64"}
          align="start"
          avoidCollisions
          collisionPadding={12}
          highlightedItemId={items[selectedIndex]?.id}
          side="bottom"
          sideOffset={4}
          onEscapeKeyDown={onClose}
          onInteractOutside={onClose}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
          scrollHighlightedItemIntoView
        >
          {header ? (
            <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground dark:text-muted-foreground-night">
              {header}
            </div>
          ) : null}
          {items.length === 0 ? (
            <div className="px-2 py-4 text-center text-sm text-muted-foreground dark:text-muted-foreground-night">
              {emptyMessage}
            </div>
          ) : (
            <div className="relative">
              <div
                ref={listRef}
                className="overflow-y-auto"
                onScroll={updateCanScrollDown}
                style={{ maxHeight: listMaxHeight }}
              >
                {items.map((item, index) => {
                  const menuItem = (
                    <DropdownMenuItem
                      key={item.id}
                      icon={item.icon}
                      itemId={item.id}
                      label={item.label}
                      description={item.description}
                      truncateText
                      onClick={() => selectItem(index)}
                      onMouseEnter={() => setSelectedIndex(index)}
                      className={
                        index === selectedIndex
                          ? "bg-muted-background dark:bg-muted-night [transition-duration:0ms]"
                          : ""
                      }
                    />
                  );

                  // Wrap with DropdownTooltipTrigger if command has tooltip property.
                  if (item.tooltip) {
                    return (
                      <DropdownTooltipTrigger
                        key={item.id}
                        description={item.tooltip.description}
                        media={item.tooltip.media}
                        side="right"
                        sideOffset={8}
                      >
                        {menuItem}
                      </DropdownTooltipTrigger>
                    );
                  }

                  return menuItem;
                })}
              </div>
              <div
                className={cn(
                  "pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-b from-transparent via-background/85 to-background opacity-0 transition-opacity duration-150 dark:via-muted-background-night/85 dark:to-muted-background-night",
                  showScrollFade && canScrollDown && "opacity-100"
                )}
                aria-hidden
              />
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
);

SlashCommandDropdown.displayName = "SlashCommandDropdown";
