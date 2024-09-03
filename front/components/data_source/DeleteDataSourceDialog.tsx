import { Dialog } from "@dust-tt/sparkle";

interface DeleteDataSourceDialogProps {
  handleDelete: () => void;
  dataSourceUsage?: number;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

export function DeleteDataSourceDialog({
  handleDelete,
  dataSourceUsage,
  isOpen,
  setIsOpen,
}: DeleteDataSourceDialogProps) {
  const onDelete = async () => {
    await handleDelete();
    setIsOpen(false);
  };

  const message =
    dataSourceUsage === undefined
      ? "Are you sure you want to permanently delete this data source?"
      : dataSourceUsage > 0
        ? `${dataSourceUsage} assistants currently use this Data Source. Are you sure you want to remove?`
        : "No assistants are using this data source. Confirm permanent deletion?";

  return (
    <Dialog
      isOpen={isOpen}
      title="Removing Data Source"
      onValidate={onDelete}
      onCancel={() => setIsOpen(false)}
      validateVariant="primaryWarning"
    >
      <div>{message}</div>
    </Dialog>
  );
}
