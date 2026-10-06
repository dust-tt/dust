import { useDeleteProviderCredential } from "@app/lib/swr/provider_credentials";
import type { ByokModelProviderIdType } from "@app/types/assistant/models/types";
import type { LightWorkspaceType } from "@app/types/user";
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

interface RemoveKeyDialogProps {
  owner: LightWorkspaceType;
  providerId: ByokModelProviderIdType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RemoveKeyDialog({
  owner,
  providerId,
  open,
  onOpenChange,
}: RemoveKeyDialogProps) {
  const { t } = useLingui();
  const { deleteProviderCredential, isDeleting } = useDeleteProviderCredential({
    owner,
  });

  const handleRemove = async () => {
    const deleted = await deleteProviderCredential({ providerId });
    if (deleted) {
      onOpenChange(false);
    }
  };

  const description =
    providerId === "openai"
      ? t`OpenAI powers your embedding model. Removing this key will not only disable all agents powered by OpenAI, but also search and data syncing across the entire workspace.`
      : t`Agents relying on this provider will stop responding immediately.`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Trans>Remove this model provider API key?</Trans>
          </DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <DialogDescription>{description}</DialogDescription>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: t`Cancel`,
            variant: "outline",
            disabled: isDeleting,
          }}
          rightButtonProps={{
            label: t`Remove key`,
            variant: "warning",
            onClick: handleRemove,
            disabled: isDeleting,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
