import {
  DocumentPlusIcon,
  ExclamationCircleIcon,
  Input,
  Modal,
  Page,
} from "@dust-tt/sparkle";
import type {
  DataSourceViewType,
  LightContentNode,
  LightWorkspaceType,
  PlanType,
  Result,
} from "@dust-tt/types";
import { parseAndStringifyCsv } from "@dust-tt/types";
import { Err, isSlugified, Ok } from "@dust-tt/types";
import { useContext, useEffect, useRef, useState } from "react";

import { DocumentLimitPopup } from "@app/components/data_source/DocumentLimitPopup";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { handleFileUploadToText } from "@app/lib/client/handle_file_upload";
import { useTable } from "@app/lib/swr";
import { classNames } from "@app/lib/utils";
import type { UpsertTableFromCsvRequestBody } from "@app/pages/api/w/[wId]/data_sources/[name]/tables/csv";

interface TableUploadOrEditModalProps {
  dataSourceView: DataSourceViewType;
  contentNode?: LightContentNode;
  isOpen: boolean;
  onClose: (save: boolean) => void;
  owner: LightWorkspaceType;
  plan: PlanType;
}

export function TableUploadOrEditModal({
  dataSourceView,
  contentNode,
  isOpen,
  onClose,
  owner,
  plan,
}: TableUploadOrEditModalProps) {
  const sendNotification = useContext(SendNotificationsContext);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tableName, setTableName] = useState<string>("");
  const [tableDescription, setTableDescription] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);

  const [hasChanged, setHasChanged] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [isBigFile, setIsBigFile] = useState(false);

  const initialTableId = contentNode?.internalId;

  const { table } = useTable({
    workspaceId: owner.sId,
    dataSourceName: dataSourceView.dataSource.name,
    tableId: initialTableId ?? null,
  });

  useEffect(() => {
    if (!initialTableId && !file) {
      return setHasChanged(true);
    }
    if (!tableName || !tableDescription) {
      return setHasChanged(true);
    }

    const edited =
      !initialTableId ||
      table?.name !== tableName ||
      table?.description !== tableDescription ||
      file;

    return setHasChanged(!edited);
  }, [tableName, tableDescription, file, initialTableId, table]);

  useEffect(() => {
    setTableName(table ? table.name : "");
    setTableDescription(table ? table.description : "");
  }, [initialTableId, table]);

  //TODO(GROUPS_UI)  Get the total number of documents
  const total = 0;

  if (
    !initialTableId && // If there is no document ID, it means we are creating a new document
    plan.limits.dataSources.documents.count != -1 &&
    total >= plan.limits.dataSources.documents.count
  ) {
    return (
      <DocumentLimitPopup
        isOpen={isOpen}
        plan={plan}
        onClose={() => onClose(false)}
        owner={owner}
      />
    );
  }

  const isNameValid = (name: string) => name.trim() !== "" && isSlugified(name);

  const handleUpload = async () => {
    setUploading(true);

    try {
      const fileContentRes: Result<string | null, null> = await (async () => {
        if (file) {
          const res = await handleFileUploadToText(file);
          if (res.isErr()) {
            sendNotification({
              type: "error",
              title: "Error uploading file",
              description: `An unexpected error occurred: ${res.error}.`,
            });
            return new Err(null);
          }

          const { content } = res.value;
          try {
            const stringifiedContent = await parseAndStringifyCsv(content);
            return new Ok(stringifiedContent);
          } catch (err) {
            if (err instanceof Error) {
              sendNotification({
                type: "error",
                title: "Error uploading file",
                description: `Invalid headers: ${err.message}.`,
              });
              return new Err(null);
            }

            sendNotification({
              type: "error",
              title: "Error uploading file",
              description: `An error occurred: ${err}.`,
            });
            return new Err(null);
          }
        }

        return new Ok(null);
      })();

      if (fileContentRes.isErr()) {
        return;
      }

      const fileContent = fileContentRes.value;

      if (fileContent && fileContent.length > 50_000_000) {
        sendNotification({
          type: "error",
          title: "File too large",
          description:
            "Please upload a file containing less than 50 million characters.",
        });
        return;
      }

      if (fileContent && fileContent.length > 5_000_000) {
        setIsBigFile(true);
      } else {
        setIsBigFile(false);
      }

      let body: UpsertTableFromCsvRequestBody;
      if (fileContent) {
        body = {
          name: tableName,
          description: tableDescription,
          csv: fileContent,
          tableId: initialTableId ?? undefined,
          timestamp: null,
          tags: [],
          parents: [],
          truncate: true,
          async: false,
        };
      } else if (initialTableId) {
        body = {
          name: tableName,
          description: tableDescription,
          tableId: initialTableId,
          timestamp: null,
          tags: [],
          parents: [],
          csv: undefined,
          truncate: false,
          async: false,
        };
      } else {
        throw new Error("Unreachable: fileContent is null");
      }

      //TODO(GROUPS_UI) replace endpoint https://github.com/dust-tt/dust/issues/6921
      const uploadRes = await fetch(
        `/api/w/${owner.sId}/data_sources/${dataSourceView.dataSource.name}/tables/csv`,
        {
          method: "POST",
          body: JSON.stringify(body),
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!uploadRes.ok) {
        sendNotification({
          type: "error",
          title: "Error uploading file",
          description: `An error occurred: ${await uploadRes.text()}.`,
        });
        return;
      }

      sendNotification({
        type: "success",
        title: "Table successfully added",
        description: `Table ${tableName} was successfully added.`,
      });
      onClose(true);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => onClose(false)}
      hasChanged={!hasChanged}
      variant="side-md"
      title={initialTableId ? "Edit table" : "Add a new table"}
      onSave={async () => {
        await handleUpload();
      }}
    >
      <Page.Vertical align="stretch">
        <div className="pt-4">
          <Page.SectionHeader
            title="Table name"
            description="Enter the table name. This identifier will be used in the Assistant builder to pick tables for querying."
          />
          <div className="pt-4">
            <Input
              placeholder="table_name"
              name="table-name"
              disabled={!!initialTableId}
              value={tableName}
              onChange={setTableName}
              error={
                !tableName || isNameValid(tableName)
                  ? null
                  : "Invalid name: Must be alphanumeric, max 32 characters and no space."
              }
              showErrorLabel={true}
            />
          </div>
        </div>

        <div className="pt-4">
          <Page.SectionHeader
            title="Description"
            description="Describe the content of your CSV file. It will be used by the LLM model to generate relevant queries."
          />
          <div className="pt-4">
            <textarea
              name="table-description"
              placeholder="This table contains..."
              rows={10}
              value={tableDescription}
              onChange={(e) => setTableDescription(e.target.value)}
              className={classNames(
                "font-mono text-normal block w-full min-w-0 flex-1 rounded-md",
                "border-structure-200 bg-structure-50",
                "focus:border-action-300 focus:ring-action-300"
              )}
            />
          </div>
        </div>

        <div className="pt-4">
          <Page.SectionHeader
            title="CSV File"
            description="Select the CSV file for data extraction. The maximum file size allowed is 50MB."
            action={{
              label: (() => {
                if (uploading) {
                  return "Uploading...";
                } else if (file) {
                  return file.name;
                } else if (initialTableId) {
                  return "Replace file";
                } else {
                  return "Upload file";
                }
              })(),
              variant: "primary",
              icon: DocumentPlusIcon,
              onClick: () => {
                if (fileInputRef.current) {
                  fileInputRef.current.click();
                }
              },
            }}
          />
          {isBigFile && (
            <div className="pt-4">
              <div className="flex flex-col gap-y-2">
                <div className="flex grow flex-row items-center gap-1 text-sm font-medium text-warning-500">
                  <ExclamationCircleIcon />
                  Warning: Large file (5MB+)
                </div>
                <div className="text-sm font-normal text-element-700">
                  This file is large and may take a while to upload.
                </div>
              </div>
            </div>
          )}
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: "none" }}
            accept=".csv, .tsv"
            onChange={async (e) => {
              setUploading(true);
              const csvFile = e?.target?.files?.[0];
              if (!csvFile) {
                return;
              }
              if (csvFile.size > 50_000_000) {
                sendNotification({
                  type: "error",
                  title: "File too large",
                  description: "Please upload a file smaller than 50MB.",
                });
                setUploading(false);
                return;
              }

              if (
                ![
                  "text/csv",
                  "text/tsv",
                  "text/comma-separated-values",
                  "text/tab-separated-values",
                ].includes(csvFile.type)
              ) {
                sendNotification({
                  type: "error",
                  title: "Invalid file type",
                  description: "Please upload a CSV or TSV file.",
                });
                setUploading(false);
                return;
              }

              setFile(csvFile);
              setUploading(false);
            }}
          />
        </div>
      </Page.Vertical>
    </Modal>
  );
}
