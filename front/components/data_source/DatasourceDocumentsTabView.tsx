import {
  Button,
  DataTable,
  Dialog,
  DocumentTextIcon,
  Page,
  PencilSquareIcon,
  PlusIcon,
  Popup,
  Searchbar,
  TrashIcon,
} from "@dust-tt/sparkle";
import type {
  DataSourceType,
  PlanType,
  PostDataSourceDocumentRequestBody,
  WorkspaceType,
} from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type { CellContext } from "@tanstack/react-table";
import { useRouter } from "next/router";
import { useContext, useEffect, useRef, useState } from "react";
import * as React from "react";

import { DocumentUploadModal } from "@app/components/data_source/DocumentUploadModal";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { handleFileUploadToText } from "@app/lib/client/handle_file_upload";
import { getDisplayNameForDocument } from "@app/lib/data_sources";
import { useDocuments } from "@app/lib/swr";
import { ClientSideTracking } from "@app/lib/tracking/client";
import { timeAgoFrom } from "@app/lib/utils";

type RowData = {
  name: string;
  size: number;
  timestamp: number;
  onClick?: () => void;
  moreMenuItems: {
    variant?: "default" | "warning";
    label: string;
    description?: string;
    icon: React.ComponentType;
    onClick: () => void;
  }[];
};

type Info = CellContext<RowData, unknown>;

interface ConfirmDeleteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onValidate: () => void;
  documentName: string;
}

export function ConfirmDeleteDialog({
  isOpen,
  onClose,
  onValidate,
  documentName,
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
        <p className="mb-4">
          Are you sure you want to delete the document "{documentName}"?
        </p>
        <p className="mb-4 font-bold text-warning-500">
          This action cannot be undone.
        </p>
      </div>
    </Dialog>
  );
}

export function DatasourceDocumentsTabView({
  owner,
  plan,
  readOnly,
  dataSource,
}: {
  owner: WorkspaceType;
  plan: PlanType;
  readOnly: boolean;
  dataSource: DataSourceType;
}) {
  const [limit] = useState(10);

  const router = useRouter();

  const {
    documents,
    total,
    isDocumentsLoading,
    isDocumentsError,
    mutateDocuments,
  } = useDocuments(owner, dataSource, limit, 0);
  const [showDocumentsLimitPopup, setShowDocumentsLimitPopup] = useState(false);
  const [showDataSourceUploadModal, setShowDataSourceUploadModal] =
    useState(false);
  const [showDataSourceDeleteDialog, setShowDataSourceDeleteDialog] =
    useState(false);
  const [dataSourceSearch, setDataSourceSearch] = useState<string>("");
  const [displayNameByDocId, setDisplayNameByDocId] = useState<
    Record<string, string>
  >({});
  const [documentId, setDocumentId] = useState<string | null>(null);
  const sendNotification = useContext(SendNotificationsContext);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [bulkFilesUploading, setBulkFilesUploading] = useState<null | {
    total: number;
    completed: number;
  }>(null);

  const handleDelete = async () => {
    if (!documentId) {
      return;
    }
    const res = await fetch(
      `/api/w/${owner.sId}/data_sources/${
        dataSource.name
      }/documents/${encodeURIComponent(documentId)}`,
      {
        method: "DELETE",
      }
    );

    if (!res.ok) {
      alert("There was an error deleting the document.");
      return;
    }
    sendNotification({
      type: "success",
      title: "Document successfully deleted",
      description: `Document ${documentId} was successfully deleted`,
    });
  };

  const handleUpsert = async (text: string, documentId: string) => {
    const body: PostDataSourceDocumentRequestBody = {
      timestamp: null,
      parents: null,
      section: {
        prefix: null,
        content: text,
        sections: [],
      },
      text: null,
      source_url: undefined,
      tags: [],
      light_document_output: true,
      upsert_context: null,
      async: false,
    };

    try {
      const res = await fetch(
        `/api/w/${owner.sId}/data_sources/${
          dataSource.name
        }/documents/${encodeURIComponent(documentId)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }
      );

      if (!res.ok) {
        let errMsg = "";
        try {
          const data = await res.json();
          errMsg = data.error.message;
        } catch (e) {
          errMsg = "An error occurred while uploading your document.";
        }
        return new Err(errMsg);
      }
    } catch (e) {
      return new Err("An error occurred while uploading your document.");
    }

    return new Ok(null);
  };

  useEffect(() => {
    if (!isDocumentsLoading && !isDocumentsError) {
      setDisplayNameByDocId(
        documents.reduce(
          (acc, doc) =>
            Object.assign(acc, {
              [doc.document_id]: getDisplayNameForDocument(doc),
            }),
          {}
        )
      );
    }
    if (isDocumentsError) {
      setDisplayNameByDocId({});
    }
  }, [documents, isDocumentsLoading, isDocumentsError]);

  const columns = [
    {
      accessorKey: "name",
      header: "Name",
      cell: (info: Info) => (
        <DataTable.Cell icon={DocumentTextIcon}>
          {info.row.original.name}
        </DataTable.Cell>
      ),
    },
    {
      header: "Size",
      accessorKey: "size",
      cell: (info: Info) => (
        <DataTable.Cell>
          {Math.floor(info.row.original.size / 1024)} kb
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
  ];

  const rows: RowData[] = !isDocumentsLoading
    ? documents.map((document) => {
        return {
          name: displayNameByDocId[document.document_id],
          size: document.text_size,
          timestamp: document.timestamp,
          moreMenuItems: [
            {
              label: "Edit",
              icon: PencilSquareIcon,
              onClick: () => {},
            },
            {
              label: "Delete",
              icon: TrashIcon,
              onClick: () => {},
              variant: "warning",
            },
          ],
        };
      })
    : [];

  return (
    <Page.Vertical align="stretch">
      <div className="mt-1 flex flex-row">
        {readOnly ? null : (
          <div className="w-full">
            <div className="relative mt-0 flex-none">
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

              <div className="flex w-full flex-row gap-2">
                <Dialog
                  onCancel={() => {
                    //no-op as we can't cancel file upload
                  }}
                  onValidate={() => {
                    //no-op as we can't cancel file upload
                  }}
                  // isSaving is always true since we are showing this Dialog while
                  // uploading files only
                  isSaving={true}
                  isOpen={bulkFilesUploading !== null}
                  title={`Uploading files`}
                >
                  {bulkFilesUploading && (
                    <>
                      Processing files {bulkFilesUploading.completed} /{" "}
                      {bulkFilesUploading.total}
                    </>
                  )}
                </Dialog>
                <input
                  className="hidden"
                  type="file"
                  accept=".txt, .pdf, .md, .csv"
                  ref={fileInputRef}
                  multiple={true}
                  onChange={async (e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      const files = e.target.files;
                      ClientSideTracking.trackMultiFilesUploadUsed({
                        fileCount: files.length,
                        workspaceId: owner.sId,
                      });
                      let i = 0;
                      for (const file of files) {
                        setBulkFilesUploading({
                          total: files.length,
                          completed: i++,
                        });
                        try {
                          const uploadRes = await handleFileUploadToText(file);
                          if (uploadRes.isErr()) {
                            sendNotification({
                              type: "error",
                              title: `Error uploading document ${file.name}`,
                              description: uploadRes.error.message,
                            });
                          } else {
                            const upsertRes = await handleUpsert(
                              uploadRes.value.content,
                              file.name
                            );
                            if (upsertRes.isErr()) {
                              sendNotification({
                                type: "error",
                                title: `Error uploading document ${file.name}`,
                                description: upsertRes.error,
                              });
                            }
                          }
                        } catch (e) {
                          sendNotification({
                            type: "error",
                            title: "Error uploading document",
                            description: `An error occurred while uploading your documents.`,
                          });
                        }
                      }
                      setBulkFilesUploading(null);
                      await mutateDocuments();
                    }
                  }}
                ></input>

                <Searchbar
                  name="search"
                  placeholder="Search (Name)"
                  value={dataSourceSearch}
                  onChange={(s) => {
                    setDataSourceSearch(s);
                  }}
                />
                <Button
                  variant="secondary"
                  icon={PlusIcon}
                  label="Upload multiple files"
                  onClick={() => {
                    fileInputRef.current?.click();
                  }}
                />
                <Button
                  variant="primary"
                  icon={PlusIcon}
                  label="Add document"
                  onClick={() => {
                    setDocumentId(null);
                    // Enforce plan limits: DataSource documents count.
                    if (
                      plan.limits.dataSources.documents.count != -1 &&
                      total >= plan.limits.dataSources.documents.count
                    ) {
                      setShowDocumentsLimitPopup(true);
                    } else {
                      setShowDataSourceUploadModal(true);
                    }
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="py-8">
        <DataTable
          data={rows}
          columns={columns}
          initialColumnOrder={[{ id: "name", desc: false }]}
          filter={dataSourceSearch}
          filterColumn={"name"}
        />
      </div>
      <DocumentUploadModal
        isOpen={showDataSourceUploadModal}
        onClose={() => setShowDataSourceUploadModal(false)}
        owner={owner}
        dataSource={dataSource}
        plan={plan}
        documentIdToLoad={documentId}
      />
      <ConfirmDeleteDialog
        isOpen={showDataSourceDeleteDialog}
        onClose={() => setShowDataSourceDeleteDialog(false)}
        onValidate={async () => {
          await handleDelete();
          setShowDataSourceDeleteDialog(false);
        }}
        documentName={documentId ?? ""}
      />
    </Page.Vertical>
  );
}
