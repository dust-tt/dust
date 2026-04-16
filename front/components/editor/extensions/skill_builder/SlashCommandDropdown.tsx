import {
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
  className?: string;
  emptyMessage?: string;
  header?: React.ReactNode;
  itemsClassName?: string;
  onEscapeKeyDown?: () => void;
  onInteractOutside?: () => void;
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
      className = "w-64",
      emptyMessage = "No commands found",
      header,
      itemsClassName,
      onEscapeKeyDown,
      onInteractOutside,
    },
    ref
  ) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const selectedItemRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLDivElement>(null);
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
            setSelectedIndex((selectedIndex + 1) % items.length);
            return true;
          }

          if (event.key === "ArrowUp") {
            event.preventDefault();
            setSelectedIndex((selectedIndex + items.length - 1) % items.length);
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
    }, [items.length]);

    // biome-ignore lint/correctness/useExhaustiveDependencies: selectedIndex drives which item owns the ref.
    useEffect(() => {
      selectedItemRef.current?.scrollIntoView({
        block: "nearest",
      });
    }, [selectedIndex]);

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
          ref={containerRef}
          className={className}
          align="start"
          avoidCollisions
          collisionPadding={12}
          side="bottom"
          sideOffset={4}
          onEscapeKeyDown={onEscapeKeyDown}
          onInteractOutside={onInteractOutside}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {header}
          {items.length === 0 ? (
            <div className="px-2 py-4 text-center text-sm text-muted-foreground">
              {emptyMessage}
            </div>
          ) : (
            <div className={itemsClassName}>
              {items.map((item, index) => {
                const menuItem = (
                  <DropdownMenuItem
                    key={item.id}
                    ref={index === selectedIndex ? selectedItemRef : null}
                    icon={item.icon}
                    label={item.label}
                    description={item.description}
                    truncateText
                    onClick={() => selectItem(index)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={
                      index === selectedIndex
                        ? "bg-gray-100 dark:bg-gray-800"
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
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
);

SlashCommandDropdown.displayName = "SlashCommandDropdown";
