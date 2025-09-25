import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dust-tt/sparkle";

import { useDeleteWebhookSource } from "@app/lib/swr/webhook_source";
import type { LightWorkspaceType } from "@app/types";
import type { WebhookSourceType } from "@app/types/triggers/webhooks";

type DeleteWebhookSourceDialogProps = {
  owner: LightWorkspaceType;
  onClose: () => void;
  webhookSource: WebhookSourceType;
  isOpen: boolean;
};

export function DeleteWebhookSourceDialog({
  owner,
  webhookSource,
  isOpen,
  onClose,
}: DeleteWebhookSourceDialogProps) {
  const { deleteWebhookSource, isDeleting } = useDeleteWebhookSource({ owner });

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm Removal</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <div>
            Are you sure you want to remove{" "}
            <span className="font-semibold">{webhookSource.name}</span> ?
          </div>
          <div className="mt-2">
            <span className="font-semibold">This action cannot be undone.</span>
          </div>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            disabled: isDeleting,
            variant: "outline",
            onClick: onClose,
          }}
          rightButtonProps={{
            isLoading: isDeleting,
            label: "Remove",
            variant: "warning",
            disabled: isDeleting,
            autoFocus: true,
            onClick: async () => {
              const success = await deleteWebhookSource(webhookSource.sId);
              if (success) {
                onClose();
              }
            },
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
