import { Dialog } from "@dust-tt/sparkle";
import type { SpaceType } from "@dust-tt/types";

import { getSpaceName } from "@app/lib/spaces";

interface ConfirmDeleteSpaceDialogProps {
  space: SpaceType;
  handleDelete: () => void;
  dataSourceUsage?: number;
  isOpen: boolean;
  isDeleting: boolean;
  onClose: () => void;
}

export function ConfirmDeleteSpaceDialog({
  space,
  handleDelete,
  dataSourceUsage,
  isOpen,
  isDeleting,
  onClose,
}: ConfirmDeleteSpaceDialogProps) {
  const message =
    dataSourceUsage === undefined
      ? `Are you sure you want to permanently delete space ${getSpaceName(space)}?`
      : dataSourceUsage > 0
        ? `${dataSourceUsage} assistants currently use space ${getSpaceName(space)}. Are you sure you want to delete?`
        : `No assistants are using this ${getSpaceName(space)}. Confirm permanent deletion?`;

  return (
    <Dialog
      isOpen={isOpen}
      title={`Deleting ${getSpaceName(space)}`}
      onValidate={handleDelete}
      onCancel={onClose}
      validateVariant="warning"
      isSaving={isDeleting}
    >
      <div>{message}</div>
    </Dialog>
  );
}
