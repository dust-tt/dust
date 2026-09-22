import { Button } from "@sparkle/components/Button";
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
  DropdownMenuTrigger,
} from "@sparkle/components/Dropdown";
import { ScrollArea, ScrollBar } from "@sparkle/components/ScrollArea";
import { DotsHorizontal } from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib/utils";
import React, { useState } from "react";

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

export interface DataTableMoreButtonProps {
  className?: string;
  /** Menu entries — regular items or submenus (with default or checkbox selection). */
  menuItems?: MenuItem[];
  /** Extra props forwarded to the underlying DropdownMenu. */
  dropdownMenuProps?: Omit<
    React.ComponentPropsWithoutRef<typeof DropdownMenu>,
    "modal"
  >;
  disabled?: boolean;
}

/** "..." row-actions button that opens a dropdown of menuItems. */
export function MoreButton({
  className,
  menuItems,
  dropdownMenuProps,
  disabled,
}: DataTableMoreButtonProps) {
  const [open, setOpen] = useState(false);

  if (!menuItems?.length) {
    return null;
  }

  const { onOpenChange: dropdownOnOpenChange, ...restDropdownMenuProps } =
    dropdownMenuProps ?? {};

  const closeMenu = () => {
    setOpen(false);
  };

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        dropdownOnOpenChange?.(nextOpen);
      }}
      modal={false}
      {...restDropdownMenuProps}
    >
      <DropdownMenuTrigger
        onClick={(event) => {
          event.stopPropagation();
        }}
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
        asChild
      >
        <Button
          icon={DotsHorizontal}
          size="icon"
          variant="ghost-secondary"
          disabled={disabled}
          className={cn(disabled && "cursor-not-allowed opacity-50", className)}
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" hidden={disabled}>
        <DropdownMenuGroup>
          {menuItems.map((item, index) =>
            renderMenuItem(item, index, closeMenu)
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
