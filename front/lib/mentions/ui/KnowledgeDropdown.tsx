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
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

export interface KnowledgeDropdownOnKeyDown {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export interface KnowledgeDropdownProps extends SuggestionProps {
  onClose?: () => void;
}

export const KnowledgeDropdown = forwardRef<
  KnowledgeDropdownOnKeyDown,
  KnowledgeDropdownProps
>(({ query, clientRect, command, onClose }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Simple attachment options - no complex menu levels
  const items = useMemo(() => {
    const allOptions = [
      {
        id: "attach-knowledge",
        label: "Attach knowledge 1",
        description: "Search and attach knowledge to your message",
        action: "insert-knowledge-node",
      },
      {
        id: "attach-file",
        label: "Attach file",
        description: "Upload and attach a file",
        action: "open-file-upload",
      },
      {
        id: "attach-url",
        label: "Attach URL",
        description: "Attach a web page or document by URL",
        action: "open-url-input",
      },
    ];

    if (!query || query.length === 0) {
      return allOptions;
    }

    // Filter options based on what user typed
    return allOptions.filter(
      (item) =>
        item.label.toLowerCase().includes(query.toLowerCase()) ||
        item.description.toLowerCase().includes(query.toLowerCase())
    );
  }, [query]);

  const selectItem = useCallback(
    (index: number) => {
      const item = items[index];
      if (item) {
        // Just pass the item to the command - let the suggestion system handle it
        command(item);
      }
    },
    [command, items]
  );

  const containerRef = useRef<HTMLDivElement>(null);

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

  // Virtual trigger - EXACTLY like MentionDropdown
  const triggerRect = clientRect?.();
  const triggerRef = useRef<HTMLDivElement>(null);
  const [virtualTriggerStyle, setVirtualTriggerStyle] =
    useState<React.CSSProperties>({});

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

  React.useEffect(() => {
    updateTriggerPosition();
  }, [updateTriggerPosition]);

  // // Scroll selected item into view when selection changes
  // React.useEffect(() => {
  //   if (selectedItemRef.current) {
  //     selectedItemRef.current.scrollIntoView({
  //       block: "nearest",
  //       behavior: "smooth",
  //     });
  //   }
  // }, [selectedIndex]);

  return (
    <DropdownMenu open={true}>
      <DropdownMenuTrigger asChild>
        <div ref={triggerRef} style={virtualTriggerStyle} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        ref={containerRef}
        className="w-96"
        align="start"
        side="bottom"
        sideOffset={4}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onEscapeKeyDown={() => onClose?.()}
        onInteractOutside={() => onClose?.()}
      >
        {items.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No attachment options found for "{query}"
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

KnowledgeDropdown.displayName = "KnowledgeDropdown";
