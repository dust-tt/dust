import { Dialog } from "@dust-tt/sparkle";
import type { DataSourceType } from "@dust-tt/types";

import { getDataSourceName } from "@app/lib/data_sources";

interface DeleteStaticDataSourceDialogProps {
  dataSource: DataSourceType;
  handleDelete: () => void;
  dataSourceUsage?: number;
  isOpen: boolean;
  onClose: () => void;
}

export function DeleteStaticDataSourceDialog({
  dataSource,
  handleDelete,
  dataSourceUsage,
  isOpen,
  onClose,
}: DeleteStaticDataSourceDialogProps) {
  const onDelete = async () => {
    await handleDelete();
    onClose();
  };

  const message =
    dataSourceUsage === undefined
      ? `Are you sure you want to permanently delete this ${getDataSourceName(dataSource)}?`
      : dataSourceUsage > 0
        ? `${dataSourceUsage} assistants currently use this ${getDataSourceName(dataSource)}. Are you sure you want to remove?`
        : `No assistants are using this ${getDataSourceName(dataSource)}. Confirm permanent deletion?`;

  return (
    <Dialog
      isOpen={isOpen}
      title={`Removing ${getDataSourceName(dataSource)}`}
      onValidate={onDelete}
      onCancel={onClose}
      validateVariant="primaryWarning"
    >
      <div>{message}</div>
    </Dialog>
  );
}
