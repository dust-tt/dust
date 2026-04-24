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
  onClose?: () => void;
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
      onClose,
      size = "default",
    },
    ref
  ) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const contentRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLDivElement>(null);
    const itemRefs = useRef<(HTMLElement | null)[]>([]);
    const viewportRef = useRef<HTMLDivElement>(null);
    const [virtualTriggerStyle, setVirtualTriggerStyle] =
      useState<React.CSSProperties>({});
    const [maxViewportHeight, setMaxViewportHeight] = useState<number>();
    const [hasOverflow, setHasOverflow] = useState(false);

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

    // Reset selected index when items change.
    // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
    useEffect(() => {
      itemRefs.current = [];
      setSelectedIndex(0);
    }, [items]);

    useEffect(() => {
      itemRefs.current[selectedIndex]?.scrollIntoView({
        block: "nearest",
      });
    }, [selectedIndex]);

    const updateViewportLayout = useCallback(() => {
      const viewport = viewportRef.current;
      if (!viewport) {
        setMaxViewportHeight(undefined);
        setHasOverflow(false);
        return;
      }

      const availableHeightVar = Number.parseFloat(
        window
          .getComputedStyle(viewport)
          .getPropertyValue("--radix-dropdown-menu-content-available-height")
      );
      const rootFontSize = Number.parseFloat(
        window.getComputedStyle(document.documentElement).fontSize
      );
      const fallbackMaxHeight =
        24 * (Number.isFinite(rootFontSize) ? rootFontSize : 16);
      const contentRect = contentRef.current?.getBoundingClientRect();
      const viewportRect = viewport.getBoundingClientRect();
      const verticalChrome =
        contentRect != null
          ? viewportRect.top -
            contentRect.top +
            (contentRect.bottom - viewportRect.bottom)
          : 0;
      const maxAllowedHeight = Math.max(
        0,
        Math.min(
          fallbackMaxHeight,
          Number.isFinite(availableHeightVar)
            ? availableHeightVar
            : fallbackMaxHeight
        ) - verticalChrome
      );

      const itemHeights = itemRefs.current
        .filter((item): item is HTMLElement => Boolean(item))
        .map((item) => item.getBoundingClientRect().height);

      if (itemHeights.length === 0) {
        setMaxViewportHeight(undefined);
        setHasOverflow(false);
        return;
      }

      const totalItemsHeight = itemHeights.reduce(
        (totalHeight, itemHeight) => totalHeight + itemHeight,
        0
      );
      let nextMaxHeight = 0;
      for (const itemHeight of itemHeights) {
        if (
          nextMaxHeight > 0 &&
          nextMaxHeight + itemHeight > maxAllowedHeight
        ) {
          break;
        }
        nextMaxHeight += itemHeight;
      }

      const snappedViewportHeight = Math.ceil(
        Math.min(nextMaxHeight, maxAllowedHeight)
      );

      setMaxViewportHeight(snappedViewportHeight);
      setHasOverflow(totalItemsHeight > snappedViewportHeight + 1);
    }, []);

    useEffect(() => {
      if (items.length === 0) {
        setMaxViewportHeight(undefined);
        setHasOverflow(false);
        return;
      }

      updateViewportLayout();
    }, [items, updateViewportLayout]);

    useEffect(() => {
      if (items.length === 0) {
        return;
      }

      const viewport = viewportRef.current;
      if (!viewport) {
        return;
      }

      const content = viewport.firstElementChild as HTMLElement | null;
      const resizeObserver = new ResizeObserver(() => {
        updateViewportLayout();
      });

      resizeObserver.observe(viewport);
      if (content) {
        resizeObserver.observe(content);
      }

      return () => {
        resizeObserver.disconnect();
      };
    }, [items.length, updateViewportLayout]);

    // Update virtual trigger position.
    const updateTriggerPosition = useCallback(() => {
      const triggerRect = clientRect?.();
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
          <div ref={triggerRef} style={virtualTriggerStyle} />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          ref={contentRef}
          className={size === "wide" ? "w-80" : "w-64"}
          align="start"
          avoidCollisions
          collisionPadding={12}
          side="bottom"
          sideOffset={4}
          onEscapeKeyDown={onClose}
          onInteractOutside={onClose}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
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
                ref={viewportRef}
                className="overflow-y-auto"
                style={
                  maxViewportHeight
                    ? { maxHeight: `${maxViewportHeight}px` }
                    : undefined
                }
              >
                {items.map((item, index) => {
                  const menuItem = (
                    <DropdownMenuItem
                      key={item.id}
                      ref={(element) => {
                        itemRefs.current[index] = element;
                      }}
                      icon={item.icon}
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
              {hasOverflow ? (
                <div
                  className={cn(
                    "pointer-events-none absolute inset-x-0 bottom-0 h-10 rounded-b-xl bg-gradient-to-t",
                    "from-background via-background/95 to-transparent",
                    "dark:from-muted-background-night dark:via-muted-background-night/95"
                  )}
                />
              ) : null}
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
);

SlashCommandDropdown.displayName = "SlashCommandDropdown";
