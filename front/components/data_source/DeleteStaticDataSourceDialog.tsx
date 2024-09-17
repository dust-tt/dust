import { Dialog } from "@dust-tt/sparkle";
import type { DataSourceType } from "@dust-tt/types";
import { useState } from "react";

import { getDataSourceName, isManaged } from "@app/lib/data_sources";

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
  const [isLoading, setIsLoading] = useState(false);

  const onDelete = async () => {
    setIsLoading(true);
    await handleDelete();
    setIsLoading(false);
    onClose();
  };
  const name = !isManaged(dataSource)
    ? dataSource.name
    : getDataSourceName(dataSource);

  const message =
    dataSourceUsage === undefined
      ? `Are you sure you want to permanently delete ${name}?`
      : dataSourceUsage > 0
        ? `${dataSourceUsage} assistants currently use ${name}. Are you sure you want to remove?`
        : `No assistants are using ${name}. Confirm permanent deletion?`;

  return (
    <Dialog
      isOpen={isOpen}
      title={`Removing ${name}`}
      onValidate={onDelete}
      isSaving={isLoading}
      onCancel={onClose}
      validateVariant="primaryWarning"
    >
      <div>{message}</div>
    </Dialog>
  );
}
