import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
} from "@dust-tt/sparkle";
import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";

type DeleteConversationsDialogProps = {
  isOpen: boolean;
  isDeleting?: boolean;
  onClose: () => void;
  onDelete: () => void;
  type: "all" | "selection";
  selectedCount?: number;
};

export const DeleteConversationsDialog = ({
  isOpen,
  isDeleting,
  onClose,
  onDelete,
  type,
  selectedCount,
}: DeleteConversationsDialogProps) => {
  const { t } = useLingui();
  const count = selectedCount ?? 1;

  const title =
    type === "all"
      ? t`Clear conversation history`
      : t`${plural(count, {
          one: "Delete conversation",
          other: "Delete conversations",
        })}`;

  const description =
    type === "all"
      ? t`Are you sure you want to delete ALL conversations?`
      : t`${plural(count, {
          one: "Are you sure you want to delete # conversation?",
          other: "Are you sure you want to delete # conversations?",
        })}`;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {isDeleting ? (
          <div className="flex justify-center py-8">
            <Spinner variant="dark" size="md" />
          </div>
        ) : (
          <>
            <DialogContainer>
              <b>
                <Trans>This action cannot be undone.</Trans>
              </b>
            </DialogContainer>
            <DialogFooter
              leftButtonProps={{
                label: t`Cancel`,
                variant: "outline",
              }}
              rightButtonProps={{
                label: t`Delete`,
                variant: "warning",
                onClick: async () => {
                  await onDelete();
                  onClose();
                },
              }}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
