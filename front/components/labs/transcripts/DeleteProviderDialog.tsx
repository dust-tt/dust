import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dust-tt/sparkle";

interface DeleteProviderDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function DeleteProviderDialog({
  isOpen,
  onClose,
  onConfirm,
}: DeleteProviderDialogProps) {
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Disconnect transcripts provider</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          This will stop the processing of your meeting transcripts and delete
          all history. You can reconnect anytime.
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
          }}
          rightButtonProps={{
            label: "Ok",
            variant: "warning",
            onClick: async () => {
              await onConfirm();
              onClose();
            },
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
