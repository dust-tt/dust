import {
  Button,
  DocumentPlusIcon,
  ExclamationCircleIcon,
  EyeIcon,
  EyeSlashIcon,
  Input,
  Modal,
  Page,
  PlusIcon,
  Spinner,
  TrashIcon,
} from "@dust-tt/sparkle";
import type {
  DataSourceViewType,
  LightContentNode,
  LightWorkspaceType,
  PlanType,
  PostDataSourceDocumentRequestBody,
} from "@dust-tt/types";
import { Err, isSlugified, parseAndStringifyCsv } from "@dust-tt/types";
import React, { useContext, useEffect, useRef, useState } from "react";

import { DocumentLimitPopup } from "@app/components/data_source/DocumentLimitPopup";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { handleFileUploadToText } from "@app/lib/client/handle_file_upload";
import { useTable } from "@app/lib/swr";
import { classNames } from "@app/lib/utils";

interface DocumentOrTableUploadOrEditModalProps {
  dataSourceView: DataSourceViewType;
  contentNode?: LightContentNode;
  isOpen: boolean;
  onClose: (save: boolean) => void;
  owner: LightWorkspaceType;
  plan: PlanType;
}

type TableOrDocument = {
  name: string;
  description: string;
  file: File | null;
  text: string;
  tags: string[];
  sourceUrl: string;
};

export function DocumentOrTableUploadOrEditModal({
  dataSourceView,
  contentNode,
  isOpen,
  onClose,
  owner,
  plan,
}: DocumentOrTableUploadOrEditModalProps) {
  const sendNotification = useContext(SendNotificationsContext);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tableOrDoc, setTableOrDoc] = useState<TableOrDocument>({
    name: "",
    description: "",
    file: null,
    text: "",
    tags: [],
    sourceUrl: "",
  });

  const [uploading, setUploading] = useState(false);
  const [isBigFile, setIsBigFile] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [developerOptionsVisible, setDeveloperOptionsVisible] = useState(false);

  const isTable = contentNode?.type === "database";
  const initialId = contentNode?.internalId;

  const { table } = useTable({
    workspaceId: owner.sId,
    dataSourceName: dataSourceView.dataSource.name,
    tableId: isTable ? initialId ?? null : null,
  });

  function resetTableOrDoc() {
    setTableOrDoc({
      name: "",
      description: "",
      file: null,
      text: "",
      tags: [],
      sourceUrl: "",
    });
  }

  useEffect(() => {
    if (initialId) {
      setIsLoading(true);
      if (!isTable) {
        setUploading(true);
        fetch(
          `/api/w/${owner.sId}/data_sources/${
            dataSourceView.dataSource.name
          }/documents/${encodeURIComponent(initialId)}`
        )
          .then(async (res) => {
            if (res.ok) {
              const document = await res.json();
              setTableOrDoc((prev) => ({
                ...prev,
                name: initialId,
                text: document.document.text,
                tags: document.document.tags,
                sourceUrl: document.document.source_url,
              }));
            }
          })
          .catch((e) => console.error(e))
          .finally(() => setUploading(false));
      } else if (table) {
        setTableOrDoc((prev) => ({
          ...prev,
          name: table.name,
          description: table.description,
        }));
      }
      setIsLoading(false);
    } else {
      resetTableOrDoc();
    }
  }, [isTable, initialId, table, owner.sId, dataSourceView.dataSource.name]);

  const total = 0; // TODO: Get the total number of documents

  if (
    !initialId &&
    plan.limits.dataSources.documents.count !== -1 &&
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

  const handleUpload = async () => {
    setUploading(true);
    try {
      let endpoint, body;

      if (isTable) {
        const fileContent = tableOrDoc.file
          ? await handleFileUploadToText(tableOrDoc.file)
          : null;
        if (fileContent && fileContent.isErr()) {
          return new Err(fileContent.error);
        }

        const csvContent = fileContent?.value
          ? await parseAndStringifyCsv(fileContent.value.content)
          : null;

        if (csvContent && csvContent.length > 50_000_000) {
          throw new Error("File too large");
        }

        endpoint = `/api/w/${owner.sId}/data_sources/${dataSourceView.dataSource.name}/tables/csv`;
        body = JSON.stringify({
          name: tableOrDoc.name,
          description: tableOrDoc.description,
          csv: undefined,
          tableId: initialId,
          timestamp: null,
          tags: [],
          parents: [],
          truncate: false,
          async: false,
        });
      } else {
        endpoint = `/api/w/${owner.sId}/data_sources/${dataSourceView.dataSource.name}/documents/${encodeURIComponent(tableOrDoc.name)}`;
        body = JSON.stringify({
          timestamp: null,
          parents: null,
          section: { prefix: null, content: tableOrDoc.text, sections: [] },
          text: null,
          source_url: tableOrDoc.sourceUrl || undefined,
          tags: tableOrDoc.tags.filter(Boolean),
          light_document_output: true,
          upsert_context: null,
          async: false,
        } as PostDataSourceDocumentRequestBody);
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });

      if (!res.ok) {
        throw new Error(`Failed to upsert ${isTable ? "table" : "document"}`);
      }

      sendNotification({
        type: "success",
        title: `${isTable ? "Table" : "Document"} successfully ${initialId ? "updated" : "added"}`,
        description: `${isTable ? "Table" : "Document"} ${tableOrDoc.name} was successfully ${initialId ? "updated" : "added"}.`,
      });
      resetTableOrDoc();
      onClose(true);
    } catch (error) {
      sendNotification({
        type: "error",
        title: `Error upserting ${isTable ? "table" : "document"}`,
        description: `An error occurred: ${error instanceof Error ? error.message : String(error)}.`,
      });
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) {
      return;
    }

    setUploading(true);
    try {
      if (selectedFile.size > 50_000_000) {
        sendNotification({
          type: "error",
          title: "File too large",
          description: "Please upload a file smaller than 50MB.",
        });
        setUploading(false);
        return;
      }

      if (isTable) {
        setTableOrDoc((prev) => ({ ...prev, file: selectedFile }));
        setIsBigFile(selectedFile.size > 5_000_000);
      } else {
        const res = await handleFileUploadToText(selectedFile);
        if (res.isErr()) {
          return new Err(res.error);
        }
        setTableOrDoc((prev) => ({ ...prev, text: res.value.content }));
      }
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Error uploading file",
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setUploading(false);
    }
  };

  if (isLoading) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={() => onClose(false)}
        hasChanged={true}
        variant="side-md"
        title={`Edit ${isTable ? "table" : "document"}`}
        onSave={handleUpload}
      >
        <div className="flex justify-center py-4">
          <Spinner variant="color" size="xs" />
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => onClose(false)}
      hasChanged={true}
      variant="side-md"
      title={`${initialId ? "Edit" : "Add"} ${isTable ? "table" : "document"}`}
      onSave={handleUpload}
      isSaving={uploading}
    >
      <Page.Vertical align="stretch">
        <div className="space-y-4 p-4">
          <div>
            <Page.SectionHeader
              title={`${isTable ? "Table" : "Document"} name`}
            />
            <Input
              placeholder={isTable ? "table_name" : "Document title"}
              name="name"
              disabled={!!initialId}
              value={tableOrDoc.name}
              onChange={(value) =>
                setTableOrDoc((prev) => ({ ...prev, name: value }))
              }
              error={
                isTable && (!tableOrDoc.name || !isSlugified(tableOrDoc.name))
                  ? "Invalid name: Must be alphanumeric, max 32 characters and no space."
                  : null
              }
              showErrorLabel={true}
            />
          </div>

          {isTable ? (
            <div>
              <Page.SectionHeader
                title="Description"
                description="Describe the content of your CSV file. It will be used by the LLM model to generate relevant queries."
              />
              <textarea
                name="table-description"
                placeholder="This table contains..."
                rows={10}
                value={tableOrDoc.description}
                onChange={(e) =>
                  setTableOrDoc((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                className={classNames(
                  "font-mono text-normal block w-full min-w-0 flex-1 rounded-md",
                  "border-structure-200 bg-structure-50",
                  "focus:border-action-300 focus:ring-action-300"
                )}
              />
            </div>
          ) : (
            <div>
              <Page.SectionHeader
                title="Associated URL"
                description="The URL of the associated document (if any). Will be used to link users to the original document in assistants citations."
              />
              <Input
                placeholder="https://..."
                name="sourceUrl"
                value={tableOrDoc.sourceUrl}
                onChange={(value) =>
                  setTableOrDoc((prev) => ({ ...prev, sourceUrl: value }))
                }
              />
            </div>
          )}

          <div>
            <Page.SectionHeader
              title={isTable ? "CSV File" : "Text content"}
              description={
                isTable
                  ? "Select the CSV file for data extraction. The maximum file size allowed is 50MB."
                  : `Copy paste content or upload a file (text or PDF). Up to ${
                      plan.limits.dataSources.documents.sizeMb === -1
                        ? "2"
                        : plan.limits.dataSources.documents.sizeMb
                    } MB of raw text.`
              }
              action={{
                label: uploading
                  ? "Uploading..."
                  : tableOrDoc.file || table
                    ? "Replace file"
                    : "Upload file",
                variant: "primary",
                icon: DocumentPlusIcon,
                onClick: () => fileInputRef.current?.click(),
              }}
            />
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: "none" }}
              accept={isTable ? ".csv, .tsv" : ".txt, .pdf, .md, .csv"}
              onChange={handleFileChange}
            />
            {isTable ? (
              isBigFile && (
                <div className="flex flex-col gap-y-2 pt-4">
                  <div className="flex grow flex-row items-center gap-1 text-sm font-medium text-warning-500">
                    <ExclamationCircleIcon />
                    Warning: Large file (5MB+)
                  </div>
                  <div className="text-sm font-normal text-element-700">
                    This file is large and may take a while to upload.
                  </div>
                </div>
              )
            ) : (
              <textarea
                name="text"
                rows={10}
                className={classNames(
                  "font-mono text-normal block w-full min-w-0 flex-1 rounded-md",
                  "border-structure-200 bg-structure-50",
                  "focus:border-action-300 focus:ring-action-300"
                )}
                value={tableOrDoc.text}
                onChange={(e) =>
                  setTableOrDoc((prev) => ({ ...prev, text: e.target.value }))
                }
              />
            )}
          </div>

          {!isTable && (
            <div>
              <Page.SectionHeader
                title="Developer Options"
                action={{
                  label: developerOptionsVisible ? "Hide" : "Show",
                  variant: "tertiary",
                  icon: developerOptionsVisible ? EyeSlashIcon : EyeIcon,
                  onClick: () =>
                    setDeveloperOptionsVisible(!developerOptionsVisible),
                }}
              />
              {developerOptionsVisible && (
                <div className="pt-4">
                  <Page.SectionHeader
                    title=""
                    description="Tags can be set to filter Data Source retrieval or provide a user-friendly title for programmatically uploaded documents (`title:User-friendly Title`)."
                    action={{
                      label: "Add tag",
                      variant: "tertiary",
                      icon: PlusIcon,
                      onClick: () =>
                        setTableOrDoc((prev) => ({
                          ...prev,
                          tags: [...prev.tags, ""],
                        })),
                    }}
                  />
                  {tableOrDoc.tags.map((tag, index) => (
                    <div key={index} className="flex flex-grow flex-row">
                      <div className="flex flex-1 flex-row gap-8">
                        <div className="flex flex-1 flex-col">
                          <Input
                            className="w-full"
                            placeholder="Tag"
                            name="tag"
                            value={tag}
                            onChange={(value) => {
                              const newTags = [...tableOrDoc.tags];
                              newTags[index] = value;
                              setTableOrDoc((prev) => ({
                                ...prev,
                                tags: newTags,
                              }));
                            }}
                          />
                        </div>
                        <div className="flex">
                          <Button
                            label="Remove"
                            icon={TrashIcon}
                            variant="secondaryWarning"
                            onClick={() => {
                              const newTags = [...tableOrDoc.tags];
                              newTags.splice(index, 1);
                              setTableOrDoc((prev) => ({
                                ...prev,
                                tags: newTags,
                              }));
                            }}
                            labelVisible={false}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </Page.Vertical>
    </Modal>
  );
}
