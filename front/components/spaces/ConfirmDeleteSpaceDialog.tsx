import {
  NewDialog,
  NewDialogContainer,
  NewDialogContent,
  NewDialogFooter,
  NewDialogHeader,
  NewDialogTitle,
  Spinner,
} from "@dust-tt/sparkle";
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
    <NewDialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <NewDialogContent>
        <NewDialogHeader>
          <NewDialogTitle>{`Deleting ${getSpaceName(space)}`}</NewDialogTitle>
        </NewDialogHeader>
        {isDeleting ? (
          <div className="flex justify-center py-8">
            <Spinner variant="dark" size="md" />
          </div>
        ) : (
          <>
            <NewDialogContainer>{message}</NewDialogContainer>
            <NewDialogFooter
              leftButtonProps={{
                label: "Cancel",
                variant: "outline",
              }}
              rightButtonProps={{
                label: "Delete",
                variant: "warning",
                onClick: async () => {
                  void handleDelete();
                },
              }}
            />
          </>
        )}
      </NewDialogContent>
    </NewDialog>
  );
}
