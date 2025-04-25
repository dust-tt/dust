import {
  Button,
  DataTable,
  PencilSquareIcon,
  PlusIcon,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Spinner,
  useSendNotification,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type { CellContext } from "@tanstack/react-table";
import { useState } from "react";

import { useTagsUsage } from "@app/lib/swr/tags";
import type { WorkspaceType } from "@app/types";
import type { TagTypeWithUsage } from "@app/types/tag";

import {
  EditTagDialog,
  TagCreationDialog,
} from "../assistant_builder/TagCreationDialog";
import { DeleteTagDialog } from "./DeleteTagDialog";

const columns = [
  {
    accessorKey: "name",
    header: "Tag label",
  },
  {
    accessorKey: "usage",
    header: "Tag usage",
  },
  {
    accessorKey: "action",
    header: "",
    cell: (info: CellContext<any, number>) => (
      <DataTable.MoreButton menuItems={info.row.original.moreMenuItems} />
    ),
    meta: { className: "w-14" },
  },
];

const NewTagButton = ({ owner }: { owner: WorkspaceType }) => {
  const sendNotification = useSendNotification();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button label="New tag" icon={PlusIcon} onClick={() => setOpen(true)} />
      <TagCreationDialog
        owner={owner}
        isOpen={open}
        onTagCreated={() => {
          sendNotification({
            type: "success",
            title: "Tag created",
          });
        }}
        setIsOpen={setOpen}
      />
    </>
  );
};

export type TagsManagerProps = {
  open: boolean;
  setOpen: (open: boolean) => void;
  owner: WorkspaceType;
};

export function TagsManager({ open, setOpen, owner }: TagsManagerProps) {
  const { isTagsLoading, tags } = useTagsUsage({ owner });
  const [tagActionModal, setTagActionModal] = useState<{
    type: "delete" | "edit";
    tag: TagTypeWithUsage;
  } | null>(null);

  const rows = tags.map((tag) => ({
    ...tag,
    moreMenuItems: [
      {
        icon: PencilSquareIcon,
        label: "Edit tag label",
        onClick: (e: React.MouseEvent) => {
          e.stopPropagation();
          setTagActionModal({ type: "edit", tag });
        },
        kind: "item",
      },
      {
        icon: XMarkIcon,
        label: "Delete tag",
        onClick: (e: React.MouseEvent) => {
          e.stopPropagation();
          setTagActionModal({ type: "delete", tag });
        },
        variant: "warning",
        kind: "item",
      },
    ],
  }));

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent size="lg">
          <SheetHeader>
            <SheetTitle>Managing tags</SheetTitle>
          </SheetHeader>

          <SheetContainer>
            <div className="flex w-full flex-row justify-end">
              <NewTagButton owner={owner} />
            </div>

            {isTagsLoading && (
              <div className="flex flex-row items-center">
                <Spinner />
              </div>
            )}
            <DataTable data={rows} columns={columns} />
          </SheetContainer>
        </SheetContent>
      </Sheet>

      {tagActionModal != null && tagActionModal.type === "delete" && (
        <DeleteTagDialog
          owner={owner}
          open
          setOpen={() => setTagActionModal(null)}
          tag={tagActionModal.tag}
        />
      )}
      {tagActionModal !== null && tagActionModal.type === "edit" && (
        <EditTagDialog
          owner={owner}
          tag={tagActionModal.tag}
          isOpen
          setIsOpen={() => setTagActionModal(null)}
        />
      )}
    </>
  );
}
