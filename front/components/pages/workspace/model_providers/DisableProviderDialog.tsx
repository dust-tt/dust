import { getModelMakerDisplayName } from "@app/types/assistant/models/providers";
import type { WhitelistableModelMakerIdType } from "@app/types/assistant/models/types";
import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dust-tt/sparkle";

interface DisableProviderDialogProps {
  providerId: WhitelistableModelMakerIdType | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DisableProviderDialog({
  providerId,
  onConfirm,
  onCancel,
}: DisableProviderDialogProps) {
  const providerName = providerId ? getModelMakerDisplayName(providerId) : "";

  return (
    <Dialog open={providerId !== null} onOpenChange={() => onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Disable {providerName}?</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <DialogDescription>
            Agents using {providerName} models will stop responding until they
            are reconfigured to use another provider.
          </DialogDescription>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
          }}
          rightButtonProps={{
            label: "Disable provider",
            variant: "warning",
            onClick: onConfirm,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
