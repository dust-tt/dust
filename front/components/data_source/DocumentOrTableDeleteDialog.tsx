import { Dialog } from "@dust-tt/sparkle";
import type {
  DataSourceViewType,
  LightContentNode,
  LightWorkspaceType,
} from "@dust-tt/types";
import * as _ from "lodash";
import { useContext, useState } from "react";

import { SendNotificationsContext } from "@app/components/sparkle/Notification";

interface DocumentOrTableDeleteDialogProps {
  dataSourceView: DataSourceViewType;
  isOpen: boolean;
  onClose: (save: boolean) => void;
  owner: LightWorkspaceType;
  contentNode: LightContentNode;
}

export const DocumentOrTableDeleteDialog = ({
  dataSourceView,
  isOpen,
  onClose,
  owner,
  contentNode,
}: DocumentOrTableDeleteDialogProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const sendNotification = useContext(SendNotificationsContext);

  const isTable = contentNode.type === "database";
  const itemType = isTable ? "table" : "document";

  const handleDelete = async () => {
    try {
      setIsLoading(true);
      const endpoint = `/api/w/${owner.sId}/vaults/${dataSourceView.vaultId}/data_sources/${dataSourceView.dataSource.name}/${itemType}s/${encodeURIComponent(contentNode.internalId)}`;

      const res = await fetch(endpoint, { method: "DELETE" });
      if (!res.ok) {
        throw new Error(`Failed to delete ${itemType}`);
      }

      sendNotification({
        type: "success",
        title: `${_.capitalize(itemType)} successfully deleted`,
        description: `The ${itemType} ${contentNode.title} was deleted`,
      });
      onClose(true);
    } catch (error) {
      sendNotification({
        type: "error",
        title: `Error deleting ${itemType}`,
        description: `An error occurred while deleting your ${itemType}.`,
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
      onValidate={handleDelete}
      title="Confirm deletion"
      validateVariant="primaryWarning"
      validateLabel="Delete"
    >
      <div className="mt-1 text-left">
        <p className="mb-4">
          Are you sure you want to delete {isTable ? "table" : "document"} '
          {contentNode.title}'?
        </p>
        <p className="mb-4 font-bold text-warning-500">
          This action cannot be undone.
        </p>
      </div>
    </Dialog>
  );
};
