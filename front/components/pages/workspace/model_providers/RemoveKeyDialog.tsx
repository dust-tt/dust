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
      ? "OpenAI powers your embedding model. Removing this key will not only disable all agents powered by OpenAI, but also search and data syncing across the entire workspace."
      : "Agents relying on this provider will stop responding immediately.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove this model provider API key?</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <DialogDescription>{description}</DialogDescription>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            disabled: isDeleting,
          }}
          rightButtonProps={{
            label: "Remove key",
            variant: "warning",
            onClick: handleRemove,
            disabled: isDeleting,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
