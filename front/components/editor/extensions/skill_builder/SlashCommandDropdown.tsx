import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownTooltipTrigger,
} from "@dust-tt/sparkle";
import type { SuggestionProps } from "@tiptap/suggestion";
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

export interface SlashCommandTooltip {
  description: string;
  media?: React.ReactNode;
}

export interface SlashCommand {
  action: string;
  icon: React.ComponentType<any>;
  id: string;
  label: string;
  tooltip?: SlashCommandTooltip;
}

export interface SlashCommandDropdownProps extends SuggestionProps<SlashCommand> {}

export interface SlashCommandDropdownRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export const SlashCommandDropdown = forwardRef<
  SlashCommandDropdownRef,
  SlashCommandDropdownProps
>(({ items, command, clientRect }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
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
  useEffect(() => {
    setSelectedIndex(0);
  }, [items.length]);

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
  }, [updateTriggerPosition]);

  return (
    <DropdownMenu open={true}>
      <DropdownMenuTrigger asChild>
        <div ref={triggerRef} style={virtualTriggerStyle} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        ref={containerRef}
        className="w-64"
        align="start"
        side="bottom"
        sideOffset={4}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {items.length === 0 ? (
          <div className="px-2 py-4 text-center text-sm text-muted-foreground">
            No commands found
          </div>
        ) : (
          items.map((item, index) => {
            const menuItem = (
              <DropdownMenuItem
                key={item.id}
                icon={item.icon}
                label={item.label}
                truncateText
                onClick={() => selectItem(index)}
                onMouseEnter={() => setSelectedIndex(index)}
                className={
                  index === selectedIndex ? "bg-gray-100 dark:bg-gray-800" : ""
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
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

SlashCommandDropdown.displayName = "SlashCommandDropdown";
