import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dust-tt/sparkle";

import { useDeleteTag } from "@app/lib/swr/tags";
import type { WorkspaceType } from "@app/types";
import type { TagType } from "@app/types/tag";

export const DeleteTagDialog = ({
  owner,
  tag,
  open,
  setOpen,
}: {
  owner: WorkspaceType;
  tag: TagType;
  open: boolean;
  setOpen: (open: boolean) => void;
}) => {
  const { deleteTag } = useDeleteTag({ owner });
  const onDeleteTag = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteTag(tag.sId);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Are you absolutely sure?</DialogTitle>
        </DialogHeader>

        <DialogContainer>
          This action cannot be undone.
          <br />
          This will delete the tag "{tag.name}" permanently.
        </DialogContainer>

        <DialogFooter
          leftButtonProps={{ label: "Cancel", variant: "outline" }}
          rightButtonProps={{
            label: "Delete tag",
            variant: "warning",
            autoFocus: true,
            onClick: onDeleteTag,
          }}
        />
      </DialogContent>
    </Dialog>
  );
};
