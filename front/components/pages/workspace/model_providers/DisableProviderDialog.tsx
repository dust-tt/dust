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
import { Trans, useLingui } from "@lingui/react/macro";

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
  const { t } = useLingui();
  const providerName = providerId ? getModelMakerDisplayName(providerId) : "";

  return (
    <Dialog open={providerId !== null} onOpenChange={() => onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Trans>Disable {providerName}?</Trans>
          </DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <DialogDescription>
            <Trans>
              Agents using {providerName} models will stop responding until they
              are reconfigured to use another provider.
            </Trans>
          </DialogDescription>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: t`Cancel`,
            variant: "outline",
          }}
          rightButtonProps={{
            label: t`Disable provider`,
            variant: "warning",
            onClick: onConfirm,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
