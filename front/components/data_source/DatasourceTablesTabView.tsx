import {
  Button,
  DataTable,
  Dialog,
  Page,
  PlusIcon,
  Searchbar,
  ServerIcon,
} from "@dust-tt/sparkle";
import type { DataSourceType, WorkspaceType } from "@dust-tt/types";
import type { CellContext } from "@tanstack/react-table";
import { useContext, useState } from "react";
import * as React from "react";

import { TableUploadModal } from "@app/components/data_source/TableUploadModal";
import { EditOrDeleteDropdown } from "@app/components/misc/EditOrDeleteDropdown";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { useTables } from "@app/lib/swr";
import { timeAgoFrom } from "@app/lib/utils";

type RowData = {
  tableId: string;
  name: string;
  dataSourceId: string;
  timestamp: number;
  onClick?: () => void;
  onMoreClick?: () => void;
};

type Info = CellContext<RowData, unknown>;

interface ConfirmDeleteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onValidate: () => void;
}

function ConfirmDeleteDialog({
  isOpen,
  onClose,
  onValidate,
}: ConfirmDeleteDialogProps) {
  return (
    <Dialog
      isOpen={isOpen}
      onCancel={onClose}
      onValidate={onValidate}
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
}

export function DatasourceTablesTabView({
  owner,
  readOnly,
  dataSource,
}: {
  owner: WorkspaceType;
  readOnly: boolean;
  dataSource: DataSourceType;
}) {
  const [showTableUploadModal, setShowTableUploadModal] = useState(false);
  const [tableToLoad, setTableToLoad] = useState<string | null>(null);
  const [showTableDeleteDialog, setShowTableDeleteDialog] = useState(false);
  const [tableSearch, setTableSearch] = useState<string>("");

  const sendNotification = useContext(SendNotificationsContext);

  const { tables, mutateTables } = useTables({
    workspaceId: owner.sId,
    dataSourceName: dataSource.name,
  });

  const handleDelete = async (tableId: string) => {
    try {
      const res = await fetch(
        `/api/w/${owner.sId}/data_sources/${dataSource.name}/tables/${tableId}`,
        {
          method: "DELETE",
        }
      );

      if (!res.ok) {
        throw new Error("Failed to delete table");
      }

      sendNotification({
        type: "success",
        title: "Table successfully deleted",
        description: `The table was successfully deleted`,
      });

      await mutateTables();
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Error deleting table",
        description: "An error occurred while deleting the table.",
      });
    }
  };

  const columns = [
    {
      accessorKey: "name",
      header: "Name",
      cell: (info: Info) => (
        <DataTable.Cell icon={ServerIcon}>
          {info.row.original.name}
        </DataTable.Cell>
      ),
    },
    {
      header: "Last Edited",
      accessorKey: "lastEdited",
      cell: (info: Info) => (
        <DataTable.Cell>
          {timeAgoFrom(info.row.original.timestamp)} ago
        </DataTable.Cell>
      ),
    },
    {
      id: "actions",
      cell: (info: Info) => (
        <EditOrDeleteDropdown
          onEdit={() => {
            setTableToLoad(info.row.original.tableId);
            setShowTableUploadModal(true);
          }}
          onDelete={() => {
            setTableToLoad(info.row.original.tableId);
            setShowTableDeleteDialog(true);
          }}
        />
      ),
    },
  ];

  const rows = tables.map((t) => ({
    tableId: t.table_id,
    name: t.name,
    dataSourceId: t.data_source_id,
    timestamp: t.timestamp,
  }));

  return (
    <Page.Vertical align="stretch">
      <div className="mt-1 flex flex-row">
        {!readOnly && (
          <div className="w-full">
            <div className="flex w-full flex-row gap-2">
              <Searchbar
                name="search"
                placeholder="Search (Name)"
                value={tableSearch}
                onChange={setTableSearch}
              />
              <Button
                variant="primary"
                icon={PlusIcon}
                label="Add table"
                onClick={() => {
                  setTableToLoad(null);
                  setShowTableUploadModal(true);
                }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="py-8">
        <DataTable
          data={rows}
          columns={columns}
          initialColumnOrder={[{ id: "name", desc: false }]}
          filter={tableSearch}
          filterColumn={"name"}
        />
        {tables.length === 0 && (
          <div className="mt-10 flex flex-col items-center justify-center text-sm text-gray-500">
            <p>No tables found for this Folder.</p>
            <p className="mt-2">
              Tables let you create assistants that can query structured data
              from uploaded CSV files. You can add tables manually by clicking
              on the "Add table" button.
            </p>
          </div>
        )}
      </div>
      <TableUploadModal
        isOpen={showTableUploadModal}
        onClose={() => setShowTableUploadModal(false)}
        onSave={() => setShowTableUploadModal(false)}
        dataSource={dataSource}
        owner={owner}
        initialTableId={tableToLoad}
      />
      <ConfirmDeleteDialog
        isOpen={showTableDeleteDialog}
        onClose={() => setShowTableDeleteDialog(false)}
        onValidate={async () => {
          if (tableToLoad) {
            await handleDelete(tableToLoad);
          }
          setShowTableDeleteDialog(false);
        }}
      />
    </Page.Vertical>
  );
}
