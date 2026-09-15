import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  type DropdownMenuItemProps,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@sparkle/components/Dropdown";
import { ScrollArea, ScrollBar } from "@sparkle/components/ScrollArea";
import React from "react";

interface BaseMenuItem {
  kind: "item" | "submenu";
  label: string;
  disabled?: boolean;
}

interface RegularMenuItem
  extends BaseMenuItem,
    Omit<DropdownMenuItemProps, "children" | "label"> {
  kind: "item";
}

type SubmenuEntry = {
  id: string;
  name: string;
  checked?: boolean;
  description?: string;
};

interface SubmenuMenuItem extends BaseMenuItem {
  kind: "submenu";
  items: SubmenuEntry[];
  onSelect: (itemId: string) => void;
  selectionMode?: "default" | "checkbox";
}

export type MenuItem = RegularMenuItem | SubmenuMenuItem;

const preventMenuItemClickThrough = (event: React.PointerEvent) => {
  // Prevent the subsequent click from reaching elements behind the menu when
  // it closes on pointer down (modal={false}).
  event.preventDefault();
};

// Shared menu rendering functions
const renderSubmenuItem = (
  item: SubmenuMenuItem,
  index: number,
  onItemClick?: () => void
) => (
  <DropdownMenuSub key={`${item.label}-${index}`}>
    <DropdownMenuSubTrigger
      label={item.label}
      disabled={item.disabled}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
    />
    <DropdownMenuPortal>
      <DropdownMenuSubContent>
        {item.selectionMode === "checkbox" ? (
          item.items.map((subItem) => (
            <DropdownMenuCheckboxItem
              key={subItem.id}
              label={subItem.name}
              description={subItem.description}
              checked={subItem.checked}
              onCheckedChange={(checked) => {
                if (!checked) {
                  return;
                }
                item.onSelect(subItem.id);
                onItemClick?.();
              }}
              onSelect={(event) => {
                event.preventDefault();
              }}
            />
          ))
        ) : (
          <ScrollArea className="flex max-h-72 min-w-24 flex-col" hideScrollBar>
            {item.items.map((subItem) => (
              <DropdownMenuItem
                key={subItem.id}
                label={subItem.name}
                description={subItem.description}
                onPointerDown={preventMenuItemClickThrough}
                onClick={(event) => {
                  event.stopPropagation();
                  item.onSelect(subItem.id);
                  onItemClick?.();
                }}
              />
            ))}
            <ScrollBar className="py-0" />
          </ScrollArea>
        )}
      </DropdownMenuSubContent>
    </DropdownMenuPortal>
  </DropdownMenuSub>
);

const renderRegularItem = (
  item: RegularMenuItem,
  index: number,
  onItemClick?: () => void
) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { kind, ...itemProps } = item;
  return (
    <DropdownMenuItem
      key={`item-${index}`}
      {...itemProps}
      onPointerDown={preventMenuItemClickThrough}
      onClick={(event) => {
        event.stopPropagation();
        itemProps.onClick?.(event);
        onItemClick?.();
      }}
    />
  );
};

export const renderMenuItem = (
  item: MenuItem,
  index: number,
  onItemClick?: () => void
) => {
  switch (item.kind) {
    case "submenu":
      return renderSubmenuItem(item, index, onItemClick);
    case "item":
      return renderRegularItem(item, index, onItemClick);
  }
};

/**
 * Right-click support for a list or table row: returns the handler to put on
 * the row and the menu itself, a dropdown pinned to where the click landed.
 * Rows without entries keep the browser's own menu.
 */
export function useRowContextMenu(menuItems?: MenuItem[]) {
  const [position, setPosition] = React.useState<{
    x: number;
    y: number;
  } | null>(null);

  const onContextMenu = (event: React.MouseEvent) => {
    if (!menuItems?.length) {
      return;
    }

    event.preventDefault();
    setPosition({ x: event.clientX, y: event.clientY });
  };

  const contextMenu =
    position && menuItems?.length ? (
      <DropdownMenu
        open
        onOpenChange={(open) => !open && setPosition(null)}
        modal
      >
        <DropdownMenuPortal>
          <DropdownMenuContent
            align="start"
            className="whitespace-nowrap"
            style={{
              position: "fixed",
              left: position.x,
              top: position.y,
            }}
          >
            <DropdownMenuGroup>
              {menuItems.map((item, index) =>
                renderMenuItem(item, index, () => setPosition(null))
              )}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenu>
    ) : null;

  return { onContextMenu, contextMenu };
}
