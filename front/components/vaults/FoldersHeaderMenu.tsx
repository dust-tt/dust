import {
  Button,
  CloudArrowUpIcon,
  DocumentTextIcon,
  DropdownMenu,
  PlusIcon,
  TableIcon,
} from "@dust-tt/sparkle";
import type { RefObject } from "react";

import type { ContentActionsRef } from "@app/components/vaults/ContentActions";

type FoldersHeaderMenuProps = {
  contentActionsRef: RefObject<ContentActionsRef>;
};

export const FoldersHeaderMenu = ({
  contentActionsRef,
}: FoldersHeaderMenuProps) => {
  return (
    <DropdownMenu>
      <DropdownMenu.Button>
        <Button
          size="sm"
          label="Add data"
          icon={PlusIcon}
          variant="primary"
          type="menu"
        />
      </DropdownMenu.Button>

      <DropdownMenu.Items width={300}>
        <DropdownMenu.Item
          icon={DocumentTextIcon}
          onClick={() => {
            contentActionsRef.current?.callAction("DocumentUploadOrEditModal");
          }}
          label="Create a document"
        />
        <DropdownMenu.Item
          icon={TableIcon}
          onClick={() => {
            contentActionsRef.current?.callAction("TableUploadOrEditModal");
          }}
          label="Create a table"
        />
        <DropdownMenu.Item
          icon={CloudArrowUpIcon}
          onClick={() => {
            contentActionsRef.current?.callAction("MultipleDocumentsUpload");
          }}
          label="Upload multiple files"
        />
      </DropdownMenu.Items>
    </DropdownMenu>
  );
};
