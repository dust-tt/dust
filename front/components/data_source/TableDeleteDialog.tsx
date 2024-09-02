import { Dialog } from "@dust-tt/sparkle";
import type {
  DataSourceViewType,
  LightContentNode,
  LightWorkspaceType,
} from "@dust-tt/types";
import { useContext, useState } from "react";

import { SendNotificationsContext } from "@app/components/sparkle/Notification";

interface TableDeleteDialogProps {
  dataSourceView: DataSourceViewType;
  isOpen: boolean;
  onClose: (save: boolean) => void;
  owner: LightWorkspaceType;
  contentNode: LightContentNode;
}

export const TableDeleteDialog = ({
  dataSourceView,
  isOpen,
  onClose,
  owner,
  contentNode,
}: TableDeleteDialogProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const sendNotification = useContext(SendNotificationsContext);

  const handleDeleteTable = async () => {
    try {
      setIsLoading(true);

      const res = await fetch(
        `/api/w/${owner.sId}/vaults/${dataSourceView.vaultId}/data_sources/${dataSourceView.dataSource.name}/tables/${contentNode.internalId}`,
        {
          method: "DELETE",
        }
      );

      if (!res.ok) {
        throw new Error("Failed to upsert document");
      }

      sendNotification({
        type: "success",
        title: "Table successfully deleted",
        description: `The table ${contentNode.title} was deleted`,
      });
      onClose(true);
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Error deleting table",
        description: "An error occurred while deleting your table.",
      });
    } finally {
      setIsLoading(false);
    }
  };
  return (
    <Dialog
      isOpen={isOpen}
      isSaving={isLoading}
      onCancel={() => onClose(false)}
      onValidate={handleDeleteTable}
      title="Confirm deletion"
      validateVariant="primaryWarning"
      validateLabel="Delete"
    >
      <div className="mt-1 text-left">
        <p className="mb-4">Are you sure you want to delete this table?</p>
        <p className="mb-4 font-bold text-warning-500">
          This action cannot be undone.
        </p>
      </div>
    </Dialog>
  );
};
