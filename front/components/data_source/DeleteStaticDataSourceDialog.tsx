import { Dialog } from "@dust-tt/sparkle";
import type {
  DataSourceType,
  DataSourceWithAgentsUsageType,
} from "@dust-tt/types";
import { useState } from "react";

import { getDataSourceName, isManaged } from "@app/lib/data_sources";

interface DeleteStaticDataSourceDialogProps {
  dataSource: DataSourceType;
  handleDelete: () => void;
  dataSourceUsage?: DataSourceWithAgentsUsageType;
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
      : dataSourceUsage.count > 0
        ? `${dataSourceUsage.count} assistants currently use "${name}": ${dataSourceUsage.agentNames.join(", ")}.`
        : `No assistants are using "${name}".`;

  return (
    <Dialog
      isOpen={isOpen}
      title={`Removing ${name}`}
      onValidate={onDelete}
      isSaving={isLoading}
      onCancel={onClose}
      validateVariant="primaryWarning"
    >
      <div>
        {message}
        <br />
        <br />
        <b>Are you sure you want to remove&nbsp;?</b>
      </div>
    </Dialog>
  );
}
