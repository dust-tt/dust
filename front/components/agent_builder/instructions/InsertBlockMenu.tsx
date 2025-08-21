import {
  CommandLineIcon,
  DocumentIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import { cn } from "@dust-tt/sparkle";
import React, { useCallback, useEffect, useRef, useState } from "react";

export interface BlockMenuItem {
  id: string;
  label: string;
  description: string;
  icon?: React.ComponentType<{ className?: string }>;
}

export const BLOCK_MENU_ITEMS: BlockMenuItem[] = [
  {
    id: "xml-block",
    label: "XML Tag",
    description: "",
    icon: DocumentIcon,
  },
  {
    id: "code-block",
    label: "Code Block",
    description: "",
    icon: CommandLineIcon,
  },
  // Add more block types here in the future
];

interface InsertBlockMenuProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  triggerRect: DOMRect | null;
  items: BlockMenuItem[];
  selectedIndex: number;
  onSelectedIndexChange: (index: number) => void;
  onSelect: (item: BlockMenuItem) => void;
}

export const InsertBlockMenu: React.FC<InsertBlockMenuProps> = ({
  isOpen,
  onOpenChange,
  triggerRect,
  items,
  selectedIndex,
  onSelectedIndexChange,
  onSelect,
}) => {
  const triggerRef = useRef<HTMLDivElement>(null);
  const [virtualTriggerStyle, setVirtualTriggerStyle] =
    useState<React.CSSProperties>({});

  const updateTriggerPosition = useCallback(() => {
    if (triggerRect && triggerRef.current) {
      setVirtualTriggerStyle({
        position: "fixed",
        left: triggerRect.left - 4, // Slight offset to the left
        top: triggerRect.bottom + (window.visualViewport?.offsetTop ?? 0),
        width: 1,
        height: 1,
        pointerEvents: "none",
        zIndex: -1,
      });
    }
  }, [triggerRect]);

  useEffect(() => {
    updateTriggerPosition();
  }, [triggerRect, updateTriggerPosition]);

  // Only render the dropdown if we have a valid trigger
  if (!triggerRect) {
    return null;
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <div ref={triggerRef} style={virtualTriggerStyle} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-48"
        align="start"
        side="bottom"
        sideOffset={4}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="px-3 pb-0.5 pt-1">
          <span className="text-xs font-medium text-muted-foreground">
            Insert
          </span>
        </div>
        {items.length === 0 ? (
          <div className="px-3 py-3 text-sm text-muted-foreground">
            No matching blocks
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto p-1">
            {items.map((item, index) => (
              <button
                key={item.id}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2 rounded-md px-1 py-1.5 text-left",
                  index === selectedIndex
                    ? "bg-muted-background dark:bg-muted-background-night"
                    : "text-foreground hover:bg-muted"
                )}
                onClick={() => onSelect(item)}
                onMouseEnter={() => onSelectedIndexChange(index)}
              >
                <div
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded",
                    index === selectedIndex ? "bg-muted" : "bg-muted"
                  )}
                >
                  {item.icon ? (
                    <item.icon className="h-3 w-3" />
                  ) : (
                    <DocumentIcon className="h-3 w-3" />
                  )}
                </div>
                <div className="text-sm font-medium">{item.label}</div>
              </button>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
