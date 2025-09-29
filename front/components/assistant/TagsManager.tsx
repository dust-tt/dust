import {
  Button,
  Chip,
  DataTable,
  EmptyCTA,
  PencilSquareIcon,
  PlusIcon,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SparklesIcon,
  Spinner,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type { CellContext } from "@tanstack/react-table";
import { useState } from "react";

import { TagsSuggestDialog } from "@app/components/assistant_builder/TagsSuggestDialog";
import { useSendNotification } from "@app/hooks/useNotification";
import { useTagsUsage } from "@app/lib/swr/tags";
import type { WorkspaceType } from "@app/types";
import type { TagTypeWithUsage } from "@app/types/tag";

import { TagCreationDialog } from "../assistant_builder/TagCreationDialog";
import { EditTagDialog } from "../assistant_builder/TagUpdateDialog";
import { DeleteTagDialog } from "./DeleteTagDialog";

const columns = [
  {
    accessorKey: "name",
    header: "Tag label",
    cell: (info: CellContext<any, string>) => (
      <Chip label={info.row.original.name} color="golden" />
    ),
  },
  {
    accessorKey: "usage",
    header: "Tag usage",
  },
  {
    accessorKey: "action",
    header: "",
    cell: (info: CellContext<any, number>) => (
      <DataTable.MoreButton menuItems={info.row.original.menuItems} />
    ),
    meta: { className: "w-14" },
  },
];

const SuggestTagsButton = ({ owner }: { owner: WorkspaceType }) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        label="Suggest tags"
        icon={SparklesIcon}
        onClick={() => setOpen(true)}
        variant="primary"
      />
      <TagsSuggestDialog owner={owner} isOpen={open} setIsOpen={setOpen} />
    </>
  );
};
const NewTagButton = ({
  owner,
  empty = false,
}: {
  owner: WorkspaceType;
  empty?: boolean;
}) => {
  const sendNotification = useSendNotification();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        label={empty ? "Add tag manually" : "New tag"}
        icon={PlusIcon}
        onClick={() => setOpen(true)}
        variant={empty ? "outline" : "primary"}
      />
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
  const { isTagsLoading, tags } = useTagsUsage({ owner, disabled: !open });
  const [tagActionModal, setTagActionModal] = useState<{
    type: "delete" | "edit";
    tag: TagTypeWithUsage;
  } | null>(null);

  const rows = tags.map((tag) => ({
    ...tag,
    menuItems: [
      {
        icon: PencilSquareIcon,
        label: "Edit tag",
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
            {isTagsLoading && (
              <div className="flex flex-row items-center">
                <Spinner />
              </div>
            )}
            {rows.length > 0 && !isTagsLoading && (
              <>
                <div className="flex w-full flex-row justify-end">
                  <NewTagButton owner={owner} />
                </div>
                <DataTable data={rows} columns={columns} />
              </>
            )}
            {rows.length <= 1 && !isTagsLoading && (
              // We show the emptyCTA if there's only one tag, which should be the default "Company" tag
              <EmptyCTA
                action={
                  <div className="flex flex-row gap-2">
                    <SuggestTagsButton owner={owner} />
                    <NewTagButton owner={owner} empty />
                  </div>
                }
                message="No tags have been created yet. Let AI suggest tags for your agents, or add manually."
              />
            )}
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
