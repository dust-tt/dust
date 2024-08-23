import { Dialog } from "@dust-tt/sparkle";
import type { DataSourceViewType, WorkspaceType } from "@dust-tt/types";
import { useContext, useState } from "react";

import { SendNotificationsContext } from "@app/components/sparkle/Notification";

interface TableDeleteDialogProps {
  owner: WorkspaceType;
  dataSourceView: DataSourceViewType;
  isOpen: boolean;
  onClose: () => void;
  tableId: string | null;
}

export const TableDeleteDialog = ({
  isOpen,
  onClose,
  owner,
  dataSourceView,
  tableId,
}: TableDeleteDialogProps) => {
  const [loading, setLoading] = useState(false);
  const sendNotification = useContext(SendNotificationsContext);

  const handleDeleteTable = async () => {
    try {
      if (!tableId) {
        return;
      }

      setLoading(true);

      const res = await fetch(
        `/api/w/${owner.sId}/data_sources/${dataSourceView.dataSource.name}/tables/${tableId}`,
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
        description: `Your table was deleted`,
      });
      onClose();
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Error deleting table",
        description: "An error occurred while deleting your table.",
      });
    } finally {
      setLoading(false);
    }
  };
  return (
    <Dialog
      isOpen={isOpen}
      isSaving={loading}
      onCancel={onClose}
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
