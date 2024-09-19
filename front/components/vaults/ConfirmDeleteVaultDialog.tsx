import { Dialog } from "@dust-tt/sparkle";
import type { VaultType } from "@dust-tt/types";

import { getVaultName } from "@app/lib/vaults";

interface ConfirmDeleteVaultDialogProps {
  vault: VaultType;
  handleDelete: () => void;
  dataSourceUsage?: number;
  isOpen: boolean;
  isDeleting: boolean;
  onClose: () => void;
}

export function ConfirmDeleteVaultDialog({
  vault,
  handleDelete,
  dataSourceUsage,
  isOpen,
  isDeleting,
  onClose,
}: ConfirmDeleteVaultDialogProps) {
  const message =
    dataSourceUsage === undefined
      ? `Are you sure you want to permanently delete vault ${getVaultName(vault)}?`
      : dataSourceUsage > 0
        ? `${dataSourceUsage} assistants currently use vault ${getVaultName(vault)}. Are you sure you want to delete?`
        : `No assistants are using this ${getVaultName(vault)}. Confirm permanent deletion?`;

  return (
    <Dialog
      isOpen={isOpen}
      title={`Deleting ${getVaultName(vault)}`}
      onValidate={handleDelete}
      onCancel={onClose}
      validateVariant="primaryWarning"
      isSaving={isDeleting}
    >
      <div>{message}</div>
    </Dialog>
  );
}
