import { PencilSquareIcon, TrashIcon } from "@dust-tt/sparkle";
import type {
  DataSourceViewType,
  LightContentNode,
  PlanType,
  WorkspaceType,
} from "@dust-tt/types";

import { DocumentDeleteDialog } from "@app/components/data_source/DocumentDeleteDialog";
import { DocumentUploadOrEditModal } from "@app/components/data_source/DocumentUploadOrEditModal";
import { MultipleDocumentsUpload } from "@app/components/data_source/MultipleDocumentsUpload";
import { TableDeleteDialog } from "@app/components/data_source/TableDeleteDialog";
import { TableUploadOrEditModal } from "@app/components/data_source/TableUploadOrEditModal";

export type ContentAction = {
  key:
    | "DocumentUploadOrEditModal"
    | "MultipleDocumentsUpload"
    | "DocumentDeleteDialog"
    | "TableUploadOrEditModal"
    | "TableDeleteDialog";
  contentNode?: LightContentNode;
};

type ContentActionsProps = {
  dataSourceView: DataSourceViewType;
  plan: PlanType;
  owner: WorkspaceType;
  onSave: () => void;
  currentAction: ContentAction | null;
  setCurrentAction: (action: ContentAction | null) => void;
};

export const ContentActions = ({
  dataSourceView,
  owner,
  plan,
  onSave,
  currentAction,
  setCurrentAction,
}: ContentActionsProps) => {
  return (
    <>
      <DocumentUploadOrEditModal
        contentNode={currentAction?.contentNode}
        dataSourceView={dataSourceView}
        isOpen={currentAction?.key === "DocumentUploadOrEditModal"}
        onClose={() => setCurrentAction(null)}
        onSave={onSave}
        owner={owner}
        plan={plan}
      />
      <MultipleDocumentsUpload
        dataSourceView={dataSourceView}
        isOpen={currentAction?.key === "MultipleDocumentsUpload"}
        onClose={() => setCurrentAction(null)}
        onSave={onSave}
        owner={owner}
        plan={plan}
      />
      <DocumentDeleteDialog
        contentNode={currentAction?.contentNode}
        dataSourceView={dataSourceView}
        isOpen={currentAction?.key === "DocumentDeleteDialog"}
        onClose={() => setCurrentAction(null)}
        onSave={onSave}
        owner={owner}
      />
      <TableUploadOrEditModal
        contentNode={currentAction?.contentNode}
        dataSourceView={dataSourceView}
        isOpen={currentAction?.key === "TableUploadOrEditModal"}
        onClose={() => setCurrentAction(null)}
        onSave={onSave}
        owner={owner}
        plan={plan}
      />
      <TableDeleteDialog
        contentNode={currentAction?.contentNode}
        dataSourceView={dataSourceView}
        isOpen={currentAction?.key === "TableDeleteDialog"}
        onClose={() => setCurrentAction(null)}
        onSave={onSave}
        owner={owner}
      />
    </>
  );
};

export const getFolderMenuItems = (contentNode: LightContentNode) => {
  if (contentNode.type === "file") {
    return [
      {
        label: "Edit",
        icon: PencilSquareIcon,
        key: "DocumentUploadOrEditModal" as const,
      },
      {
        label: "Delete",
        icon: TrashIcon,
        key: "DocumentDeleteDialog" as const,
        variant: "warning",
      },
    ];
  }

  if (contentNode.type === "database") {
    return [
      {
        label: "Edit",
        icon: PencilSquareIcon,
        key: "TableUploadOrEditModal" as const,
      },
      {
        label: "Delete",
        icon: TrashIcon,
        key: "TableDeleteDialog" as const,
        variant: "warning",
      },
    ];
  }

  return [];
};

export const getWebfolderMenuItems = (contentNode: LightContentNode) => {
  // TODO Actions for webrawler datasource
  console.log(contentNode);
  return [];
};

export const getConnectedDataSourceMenuItems = (
  contentNode: LightContentNode
) => {
  // TODO Actions for managed datasource
  console.log(contentNode);
  return [];
};

export const getMenuItems = (
  dataSourceView: DataSourceViewType,
  contentNode: LightContentNode
) => {
  if (!dataSourceView.dataSource.connectorProvider) {
    return getFolderMenuItems(contentNode);
  }
  if (dataSourceView.dataSource.connectorProvider === "webcrawler") {
    return getWebfolderMenuItems(contentNode);
  }
  return getConnectedDataSourceMenuItems(contentNode);
};
