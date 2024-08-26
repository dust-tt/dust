import {
  Button,
  ChatBubbleBottomCenterTextIcon,
  CloudArrowUpIcon,
  DataTable,
  DocumentIcon,
  DocumentTextIcon,
  DropdownMenu,
  FolderIcon,
  PencilSquareIcon,
  PlusIcon,
  Popup,
  Searchbar,
  Spinner,
  TableIcon,
  TrashIcon,
} from "@dust-tt/sparkle";
import type {
  ContentNodesViewType,
  DataSourceViewType,
  LightContentNode,
  PlanType,
  VaultType,
  WorkspaceType,
} from "@dust-tt/types";
import type { CellContext } from "@tanstack/react-table";
import { useRouter } from "next/router";
import { useRef, useState } from "react";

import { DocumentDeleteDialog } from "@app/components/data_source/DocumentDeleteDialog";
import { DocumentUploadOrEditModal } from "@app/components/data_source/DocumentUploadOrEditModal";
import { MultipleDocumentsUpload } from "@app/components/data_source/MultipleDocumentsUpload";
import { TableDeleteDialog } from "@app/components/data_source/TableDeleteDialog";
import { TableUploadOrEditModal } from "@app/components/data_source/TableUploadOrEditModal";
import { useVaultDataSourceViewContent } from "@app/lib/swr";
import { classNames } from "@app/lib/utils";

type RowData = {
  internalId: string;
  icon: React.ComponentType;
  title: string;
  expandable: boolean;
  lastUpdatedAt: number | null;
  onClick?: () => void;
};

type VaultDataSourceViewContentListProps = {
  dataSourceView: DataSourceViewType;
  plan: PlanType;
  isAdmin: boolean;
  onSelect: (parentId: string) => void;
  owner: WorkspaceType;
  parentId: string | null;
  vault: VaultType;
};

const getTableColumns = () => {
  return [
    {
      header: "Name",
      accessorKey: "title",
      id: "title",
      cell: (info: CellContext<RowData, unknown>) => (
        <DataTable.CellContent
          // iconClassName="text-brand"
          icon={info.row.original.icon}
        >
          <span className="font-bold">{info.row.original.title}</span>
        </DataTable.CellContent>
      ),
    },
  ];
};

export const VaultDataSourceViewContentList = ({
  dataSourceView,
  plan,
  isAdmin,
  onSelect,
  owner,
  parentId,
  vault,
}: VaultDataSourceViewContentListProps) => {
  const [currentTab, setCurrentTab] =
    useState<ContentNodesViewType>("documents");

  const [dataSourceSearch, setDataSourceSearch] = useState<string>("");
  const [showDocumentsLimitPopup, setShowDocumentsLimitPopup] = useState(false);

  const [showDocumentUploadOrEditModal, setShowDocumentUploadOrEditModal] =
    useState(false);
  const [showDocumentDeleteDialog, setShowDocumentDeleteDialog] =
    useState(false);
  const [documentId, setDocumentId] = useState<string | null>(null);

  const [showTableUploadOrEditModal, setShowTableUploadOrEditModal] =
    useState(false);
  const [showTableDeleteDialog, setShowTableDeleteDialog] = useState(false);
  const [tableId, setTableId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const router = useRouter();
  const total = 0; // TODO get total number of files

  const visualTable = {
    file: DocumentTextIcon,
    folder: FolderIcon,
    database: TableIcon,
    channel: ChatBubbleBottomCenterTextIcon,
  };

  const getMenuItems = (
    dataSourceView: DataSourceViewType,
    contentNode: LightContentNode
  ) => {
    if (!dataSourceView.dataSource.connectorProvider) {
      // Folder data source - only documents and tables
      if (contentNode.type === "file") {
        return [
          {
            label: "Edit",
            icon: PencilSquareIcon,
            onClick: () => {
              setDocumentId(contentNode.internalId);
              setShowDocumentUploadOrEditModal(true);
            },
          },
          {
            label: "Delete",
            icon: TrashIcon,
            onClick: () => {
              setDocumentId(contentNode.internalId);
              setShowDocumentDeleteDialog(true);
            },
            variant: "warning",
          },
        ];
      }

      if (contentNode.type === "database") {
        return [
          {
            label: "Edit",
            icon: PencilSquareIcon,
            onClick: () => {
              setTableId(contentNode.internalId);
              setShowTableUploadOrEditModal(true);
            },
          },
          {
            label: "Delete",
            icon: TrashIcon,
            onClick: () => {
              setTableId(contentNode.internalId);
              setShowTableDeleteDialog(true);
            },
            variant: "warning",
          },
        ];
      }
    } else if (dataSourceView.dataSource.connectorProvider === "webcrawler") {
      // TODO Actions for webrawler datasource
    } else {
      // TODO Actions for managed datasource
    }

    return null;
  };

  const {
    vaultContent,
    isVaultContentLoading,
    mutateVaultDataSourceViewContent,
  } = useVaultDataSourceViewContent({
    dataSourceView,
    filterPermission: "read",
    owner,
    parentId,
    vaultId: vault.sId,
    viewType: currentTab,
  });

  const rows: RowData[] =
    vaultContent?.map((contentNode) => ({
      ...contentNode,
      icon: visualTable[contentNode.type] || DocumentIcon,
      onClick: () => {
        if (contentNode.expandable) {
          onSelect(contentNode.internalId);
        }
      },
      moreMenuItems: getMenuItems(dataSourceView, contentNode),
    })) || [];

  if (isVaultContentLoading) {
    return (
      <div className="mt-8 flex justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <>
      <div
        className={classNames(
          "flex gap-2",
          rows.length === 0 && isAdmin
            ? "h-36 w-full max-w-4xl items-center justify-center rounded-lg border bg-structure-50"
            : ""
        )}
      >
        <DropdownMenu>
          <DropdownMenu.Button>
            <Button
              size="sm"
              label="Add data"
              icon={PlusIcon}
              variant="primary"
              type="menu"
            />
          </DropdownMenu.Button>

          <DropdownMenu.Items width={300}>
            <DropdownMenu.Item
              icon={DocumentTextIcon}
              onClick={() => {
                setDocumentId(null);
                // Enforce plan limits: DataSource documents count.
                setShowDocumentUploadOrEditModal(true);
                if (
                  plan.limits.dataSources.documents.count != -1 &&
                  total >= plan.limits.dataSources.documents.count
                ) {
                  setShowDocumentUploadOrEditModal(false);
                } else {
                  setShowDocumentUploadOrEditModal(true);
                }
              }}
              label={"Create a document"}
            />
            <DropdownMenu.Item
              icon={TableIcon}
              onClick={() => {
                setTableId(null);
                setShowTableUploadOrEditModal(true);
              }}
              label={"Create a table"}
            />
            <DropdownMenu.Item
              icon={CloudArrowUpIcon}
              onClick={() => {
                fileInputRef.current?.click();
              }}
              label={"Upload multiple files"}
            />
          </DropdownMenu.Items>
        </DropdownMenu>
        {rows.length > 0 && (
          <>
            <Searchbar
              name="search"
              placeholder="Search (Name)"
              value={dataSourceSearch}
              onChange={(s) => {
                setDataSourceSearch(s);
              }}
            />
            <DropdownMenu>
              <DropdownMenu.Button>
                <Button
                  size="sm"
                  label="Type"
                  icon={PlusIcon}
                  variant="secondary"
                  type="menu"
                />
              </DropdownMenu.Button>

              <DropdownMenu.Items>
                <DropdownMenu.Item
                  onClick={() => {
                    setCurrentTab("documents");
                  }}
                  label={"Documents"}
                />
                <DropdownMenu.Item
                  onClick={() => {
                    setCurrentTab("tables");
                  }}
                  label={"Tables"}
                />
              </DropdownMenu.Items>
            </DropdownMenu>
          </>
        )}
      </div>
      {rows.length > 0 && (
        <DataTable
          data={rows}
          columns={getTableColumns()}
          filter={dataSourceSearch}
          filterColumn={"title"}
        />
      )}
      <Popup
        show={showDocumentsLimitPopup}
        chipLabel={`${plan.name} plan`}
        description={`You have reached the limit of documents per data source (${plan.limits.dataSources.documents.count} documents). Upgrade your plan for unlimited documents and data sources.`}
        buttonLabel="Check Dust plans"
        buttonClick={() => {
          void router.push(`/w/${owner.sId}/subscription`);
        }}
        onClose={() => {
          setShowDocumentsLimitPopup(false);
        }}
        className="absolute bottom-8 right-0"
      />
      <DocumentUploadOrEditModal
        isOpen={showDocumentUploadOrEditModal}
        onClose={() => setShowDocumentUploadOrEditModal(false)}
        owner={owner}
        dataSourceView={dataSourceView}
        plan={plan}
        onSave={mutateVaultDataSourceViewContent}
        documentIdToLoad={documentId}
      />
      <MultipleDocumentsUpload
        fileInputRef={fileInputRef}
        owner={owner}
        onSave={mutateVaultDataSourceViewContent}
        plan={plan}
        dataSourceView={dataSourceView}
      />
      <DocumentDeleteDialog
        isOpen={showDocumentDeleteDialog}
        onClose={() => setShowDocumentDeleteDialog(false)}
        onSave={mutateVaultDataSourceViewContent}
        documentId={documentId}
        documentName={documentId || ""}
        owner={owner}
        dataSourceView={dataSourceView}
      />
      <TableUploadOrEditModal
        isOpen={showTableUploadOrEditModal}
        onClose={() => setShowTableUploadOrEditModal(false)}
        onSave={mutateVaultDataSourceViewContent}
        dataSourceView={dataSourceView}
        owner={owner}
        initialTableId={tableId}
      />
      <TableDeleteDialog
        isOpen={showTableDeleteDialog}
        onClose={() => setShowTableDeleteDialog(false)}
        onSave={mutateVaultDataSourceViewContent}
        tableId={tableId}
        owner={owner}
        dataSourceView={dataSourceView}
      />
    </>
  );
};
