import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import { DocumentIcon } from "@dust-tt/sparkle";
import type { SuggestionProps } from "@tiptap/suggestion";
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

export interface SlashCommand {
  id: string;
  label: string;
  description: string;
  action: string;
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
        className="min-h-16 w-96"
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
          items.map((item, index) => (
            <DropdownMenuItem
              key={item.id}
              icon={DocumentIcon}
              label={item.label}
              description={item.description}
              truncateText
              onClick={() => selectItem(index)}
              onMouseEnter={() => setSelectedIndex(index)}
              className={
                index === selectedIndex ? "bg-gray-100 dark:bg-gray-800" : ""
              }
            />
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

SlashCommandDropdown.displayName = "SlashCommandDropdown";
