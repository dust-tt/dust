import {
  Button,
  cn,
  DotsHorizontal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownTooltipTrigger,
} from "@dust-tt/sparkle";
import type { SuggestionProps } from "@tiptap/suggestion";
import type React from "react";
import {
  Fragment,
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

const DEFAULT_LIST_MAX_HEIGHT_CLASS_NAME = "max-h-96";

export interface SlashCommand {
  action: string;
  // Command-specific payload, opaque to the dropdown. Consumers narrow it back with type guards
  // (e.g. isSkillSlashCommand) when handling selection or details.
  data?: unknown;
  description?: string;
  // Whether the item exposes a details affordance (the "…" button) when onItemDetails is provided.
  hasDetails?: boolean;
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
  listMaxHeightClassName?: `max-h-${string}`;
  onClose?: () => void;
  onItemDetails?: (item: SlashCommand) => void;
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
      listMaxHeightClassName = DEFAULT_LIST_MAX_HEIGHT_CLASS_NAME,
      onClose,
      onItemDetails,
      size = "default",
    },
    ref
  ) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
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

    // Reset selected index when items change.
    // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
    useEffect(() => {
      setSelectedIndex(0);
    }, [items]);

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
            <div ref={listRef} className={listMaxHeightClassName}>
              {items.map((item, index) => {
                const canShowDetails = !!onItemDetails && !!item.hasDetails;
                const menuItem = (
                  <DropdownMenuItem
                    icon={item.icon}
                    itemId={item.id}
                    label={item.label}
                    description={item.description}
                    truncateText
                    endComponent={
                      canShowDetails ? (
                        <Button
                          icon={DotsHorizontal}
                          variant="outline"
                          size="mini"
                          className={cn(
                            "opacity-0 group-focus-within:opacity-100",
                            index === selectedIndex && "opacity-100"
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            onItemDetails?.(item);
                          }}
                        />
                      ) : undefined
                    }
                    onClick={() => selectItem(index)}
                    // onPointerMove only fires on actual pointer movement
                    // (not when items scroll under a stationary cursor).
                    // preventDefault stops Radix from setting
                    // data-highlighted, avoiding a double highlight.
                    onPointerMove={(e) => {
                      e.preventDefault();
                      setSelectedIndex(index);
                    }}
                    onPointerLeave={(e) => e.preventDefault()}
                    className={cn(
                      "group",
                      index === selectedIndex &&
                        "bg-muted-background dark:bg-muted-night [transition-duration:0ms]"
                    )}
                  />
                );

                // Wrap with DropdownTooltipTrigger if command has tooltip property.
                const itemContent = item.tooltip ? (
                  <DropdownTooltipTrigger
                    description={item.tooltip.description}
                    media={item.tooltip.media}
                    side="right"
                    sideOffset={8}
                  >
                    {menuItem}
                  </DropdownTooltipTrigger>
                ) : (
                  menuItem
                );

                return <Fragment key={item.id}>{itemContent}</Fragment>;
              })}
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
);

SlashCommandDropdown.displayName = "SlashCommandDropdown";
