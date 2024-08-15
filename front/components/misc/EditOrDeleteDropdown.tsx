import {
  Button,
  DropdownMenu,
  MoreIcon,
  PencilSquareIcon,
  TrashIcon,
} from "@dust-tt/sparkle";
import * as React from "react";

interface EditOrDeleteDropdownProps {
  onEdit: () => void;
  onDelete: () => void;
}

export function EditOrDeleteDropdown({
  onEdit,
  onDelete,
}: EditOrDeleteDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenu.Button>
        <Button
          variant="tertiary"
          icon={MoreIcon}
          label="More"
          labelVisible={false}
          size="sm"
        />
      </DropdownMenu.Button>
      <DropdownMenu.Items origin="topRight" width={220}>
        <DropdownMenu.Item
          label="Edit"
          icon={PencilSquareIcon}
          onClick={onEdit}
        />
        <DropdownMenu.Item
          label="Delete"
          icon={TrashIcon}
          onClick={onDelete}
          variant="warning"
        />
      </DropdownMenu.Items>
    </DropdownMenu>
  );
}
