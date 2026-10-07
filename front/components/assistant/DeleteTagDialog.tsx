import { useDeleteTag } from "@app/lib/swr/tags";
import type { TagType } from "@app/types/tag";
import type { WorkspaceType } from "@app/types/user";
import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";

interface DeleteTagDialogProps {
  owner: WorkspaceType;
  tag: TagType;
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const DeleteTagDialog = ({
  owner,
  tag,
  open,
  setOpen,
}: DeleteTagDialogProps) => {
  const { t } = useLingui();
  const { deleteTag } = useDeleteTag({ owner });
  const onDeleteTag = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteTag(tag.sId);
  };

  const tagName = tag.name;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Trans>Are you absolutely sure?</Trans>
          </DialogTitle>
        </DialogHeader>

        <DialogContainer>
          <Trans>This action cannot be undone.</Trans>
          <br />
          <Trans>This will delete the tag "{tagName}" permanently.</Trans>
        </DialogContainer>

        <DialogFooter
          leftButtonProps={{ label: t`Cancel`, variant: "outline" }}
          rightButtonProps={{
            label: t`Delete tag`,
            variant: "warning",
            onClick: onDeleteTag,
          }}
        />
      </DialogContent>
    </Dialog>
  );
};
