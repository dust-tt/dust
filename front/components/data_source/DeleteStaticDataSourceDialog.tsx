import { Dialog } from "@dust-tt/sparkle";
import type { DataSourceType, LightWorkspaceType } from "@dust-tt/types";
import { useMemo, useState } from "react";

import { getDisplayNameForDataSource } from "@app/lib/data_sources";
import { useDataSourceUsage } from "@app/lib/swr/data_sources";

interface DeleteStaticDataSourceDialogProps {
  owner: LightWorkspaceType;
  dataSource: DataSourceType;
  handleDelete: () => Promise<void>;
  isOpen: boolean;
  onClose: () => void;
}

export function DeleteStaticDataSourceDialog({
  owner,
  dataSource,
  handleDelete,
  isOpen,
  onClose,
}: DeleteStaticDataSourceDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { usage, isUsageLoading, isUsageError } = useDataSourceUsage({
    owner,
    dataSource,
  });

  const onDelete = async () => {
    setIsLoading(true);
    await handleDelete();
    setIsLoading(false);
    onClose();
  };
  const name = getDisplayNameForDataSource(dataSource);

  const message = useMemo(() => {
    if (isUsageLoading) {
      return "Checking usage...";
    }
    if (isUsageError) {
      return "Failed to check usage.";
    }
    if (!usage) {
      return "No usage data available.";
    }
    if (usage.count > 0) {
      return `${usage.count} assistants currently use "${name}": ${usage.agentNames.join(", ")}.`;
    }
    return `No assistants are using "${name}".`;
  }, [isUsageLoading, isUsageError, usage, name]);

  return (
    <Dialog
      alertDialog
      isOpen={isOpen}
      title={`Removing ${name}`}
      onValidate={onDelete}
      isSaving={isLoading || isUsageLoading}
      onCancel={onClose}
      validateVariant="primaryWarning"
    >
      <div>
        {message}
        <br />
        <br />
        <b>Are you sure you want to remove ?</b>
      </div>
    </Dialog>
  );
}
