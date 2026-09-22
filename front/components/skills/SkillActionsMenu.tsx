import type { MenuItem } from "@dust-tt/sparkle";
import { DataTable } from "@dust-tt/sparkle";
import { useState } from "react";

interface SkillActionsMenuProps {
  menuItems: MenuItem[];
  onOpenChange?: (open: boolean) => void;
}

export function SkillActionsMenu({
  menuItems,
  onOpenChange,
}: SkillActionsMenuProps) {
  // Control the menu locally so clicking "Copy link" does not close it.
  const [isOpen, setIsOpen] = useState(false);
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    onOpenChange?.(open);
  };

  return (
    <DataTable.MoreButton
      menuItems={menuItems.map((item) => {
        if (item.kind !== "item") {
          return item;
        }

        return {
          ...item,
          onClick: (event) => {
            item.onClick?.(event);
            if (!event.defaultPrevented) {
              handleOpenChange(false);
            }
          },
        };
      })}
      dropdownMenuProps={{
        open: isOpen,
        onOpenChange: handleOpenChange,
      }}
    />
  );
}
