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
  TextArea,
  TrashIcon,
} from "@dust-tt/sparkle";
import type {
  ContentNodesViewType,
  CoreAPIDocument,
  CoreAPILightDocument,
  CoreAPITable,
  DataSourceViewType,
  LightContentNode,
  LightWorkspaceType,
  PlanType,
} from "@dust-tt/types";
import { parseAndStringifyCsv } from "@dust-tt/types";
import { Err } from "@dust-tt/types";
import { BIG_FILE_SIZE, isSlugified, MAX_FILE_SIZES } from "@dust-tt/types";
import React, { useContext, useEffect, useRef, useState } from "react";

import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { handleFileUploadToText } from "@app/lib/client/handle_file_upload";
import { useDataSourceViewDocument } from "@app/lib/swr/data_source_views";
import { useTable } from "@app/lib/swr/tables";
import { classNames } from "@app/lib/utils";

const MAX_NAME_CHARS = 32;

function isCoreAPIDocumentType(
  doc: CoreAPIDocument | CoreAPILightDocument
): doc is CoreAPIDocument {
  return (
    "data_source_id" in doc &&
    "document_id" in doc &&
    "timestamp" in doc &&
    "tags" in doc &&
    "chunks" in doc
  );
}

interface DocumentOrTableUploadOrEditModalProps {
  contentNode?: LightContentNode;
  dataSourceView: DataSourceViewType;
  isOpen: boolean;
  onClose: (save: boolean) => void;
  owner: LightWorkspaceType;
  plan: PlanType;
  totalNodesCount: number;
  viewType: ContentNodesViewType;
}

export function DocumentOrTableUploadOrEditModal(
  props: DocumentOrTableUploadOrEditModalProps
) {
  const isTable = props.viewType === "tables";
  const initialId = props.contentNode?.internalId;

  const { table, isTableError, isTableLoading } = useTable({
    owner: props.owner,
    dataSourceView: props.dataSourceView,
    tableId: isTable ? initialId ?? null : null,
    disabled: !isTable,
  });

  const { document, isDocumentError, isDocumentLoading } =
    useDataSourceViewDocument({
      owner: props.owner,
      dataSourceView: props.dataSourceView,
      documentId: !isTable ? initialId ?? null : null,
      disabled: isTable,
    });
  return isTable ? (
    <TableUploadOrEditModal
      {...props}
      table={table}
      isTableError={isTableError}
      isTableLoading={isTableLoading ?? false}
      initialId={initialId}
    />
  ) : (
    <DocumentUploadOrEditModal
      {...props}
      document={document ?? null}
      isDocumentError={isDocumentError}
      isDocumentLoading={isDocumentLoading}
      initialId={initialId}
    />
  );
}

interface Document {
  name: string;
  file: File | null;
  text: string;
  tags: string[];
  sourceUrl: string;
}

interface DocumentUploadOrEditModalProps
  extends DocumentOrTableUploadOrEditModalProps {
  document: CoreAPIDocument | null;
  isDocumentError: boolean;
  isDocumentLoading: boolean;
  initialId?: string;
}

const DocumentUploadOrEditModal = ({
  document,
  isDocumentError,
  isDocumentLoading,
  initialId,
  dataSourceView,
  isOpen,
  onClose,
  owner,
  plan,
}: DocumentUploadOrEditModalProps) => {
  const sendNotification = useContext(SendNotificationsContext);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [documentState, setDocumentState] = useState<Document>({
    name: "",
    file: null,
    text: "",
    tags: [],
    sourceUrl: "",
  });
  const [editionStatus, setEditionStatus] = useState({
    name: false,
    content: false,
  });
  const [uploading, setUploading] = useState(false);
  const [isValidDocument, setIsValidDocument] = useState(false);
  const [developerOptionsVisible, setDeveloperOptionsVisible] = useState(false);

  useEffect(() => {
    if (!initialId) {
      setDocumentState({
        name: "",
        file: null,
        text: "",
        tags: [],
        sourceUrl: "",
      });
    } else if (document && isCoreAPIDocumentType(document)) {
      setDocumentState((prev) => ({
        ...prev,
        name: initialId,
        text: document.text ?? "",
        tags: document.tags,
        sourceUrl: document.source_url ?? "",
      }));
    }
  }, [initialId, document]);

  useEffect(() => {
    const isNameValid = !!documentState.name;
    const isContentValid = !!documentState.text || !!documentState.file;
    setIsValidDocument(isNameValid && isContentValid);
  }, [documentState]);

  const handleDocumentUpload = async (document: Document) => {
    setUploading(true);
    try {
      const base = `/api/w/${owner.sId}/vaults/${dataSourceView.vaultId}/data_sources/${dataSourceView.dataSource.sId}/documents`;
      const endpoint = initialId
        ? `${base}/${encodeURIComponent(document.name)}`
        : base;
      const body = {
        name: document.name,
        timestamp: null,
        parents: null,
        section: { prefix: null, content: document.text, sections: [] },
        text: null,
        source_url: document.sourceUrl || undefined,
        tags: document.tags.filter(Boolean),
        light_document_output: true,
        upsert_context: null,
        async: false,
      };
      const stringifiedBody = JSON.stringify(body);

      const res = await fetch(endpoint, {
        method: initialId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: stringifiedBody,
      });

      if (!res.ok) {
        throw new Error("Failed to upsert document");
      }

      sendNotification({
        type: "success",
        title: `Document successfully ${initialId ? "updated" : "added"}`,
        description: `Document ${document.name} was successfully ${initialId ? "updated" : "added"}.`,
      });
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Error upserting document",
        description: `An error occurred: ${error instanceof Error ? error.message : String(error)}.`,
      });
    } finally {
      setUploading(false);
    }
  };

  const handleUpload = async () => {
    try {
      await handleDocumentUpload(documentState);
      onClose(true);
    } catch (error) {
      console.error(error);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) {
      return;
    }

    setUploading(true);
    try {
      if (selectedFile.size > MAX_FILE_SIZES.plainText) {
        sendNotification({
          type: "error",
          title: "File too large",
          description: "Please upload a file smaller than 30MB.",
        });
        setUploading(false);
        return;
      }

      const res = await handleFileUploadToText(selectedFile);
      if (res.isErr()) {
        return new Err(res.error);
      }
      setDocumentState((prev) => ({ ...prev, text: res.value.content }));
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        onClose(false);
      }}
      hasChanged={!isDocumentError && !isDocumentLoading && isValidDocument}
      variant="side-md"
      title={`${initialId ? "Edit" : "Add"} document`}
      onSave={handleUpload}
      isSaving={uploading}
    >
      {isDocumentLoading ? (
        <div className="flex justify-center py-4">
          <Spinner variant="color" size="xs" />
        </div>
      ) : (
        <Page.Vertical align="stretch">
          {isDocumentError ? (
            <div className="space-y-4 p-4">Content cannot be loaded.</div>
          ) : (
            <div className="space-y-4 p-4">
              <div>
                <Page.SectionHeader title="Document name" />
                <Input
                  placeholder="Document title"
                  name="name"
                  maxLength={MAX_NAME_CHARS}
                  disabled={!!initialId}
                  value={documentState.name}
                  onChange={(value) => {
                    setEditionStatus((prev) => ({ ...prev, name: true }));
                    setDocumentState((prev) => ({ ...prev, name: value }));
                  }}
                  error={
                    !documentState.name && editionStatus.name
                      ? "You need to provide a name."
                      : null
                  }
                  showErrorLabel={true}
                />
              </div>

              <div>
                <Page.SectionHeader
                  title="Associated URL"
                  description="The URL of the associated document (if any). Will be used to link users to the original document in assistants citations."
                />
                <Input
                  placeholder="https://..."
                  name="sourceUrl"
                  value={documentState.sourceUrl}
                  onChange={(value) =>
                    setDocumentState((prev) => ({ ...prev, sourceUrl: value }))
                  }
                />
              </div>

              <div>
                <Page.SectionHeader
                  title="Text content"
                  description={`Copy paste content or upload a file (text or PDF). Up to ${
                    plan.limits.dataSources.documents.sizeMb === -1
                      ? "2"
                      : plan.limits.dataSources.documents.sizeMb
                  } MB of raw text.`}
                  action={{
                    label: uploading
                      ? "Uploading..."
                      : documentState.file
                        ? documentState.file.name
                        : initialId
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
                  accept=".txt, .pdf, .md, .csv"
                  onChange={handleFileChange}
                />
                <textarea
                  name="text"
                  rows={10}
                  className={classNames(
                    "font-mono text-normal block w-full min-w-0 flex-1 rounded-md",
                    "border-structure-200 bg-structure-50",
                    "focus:border-action-300 focus:ring-action-300"
                  )}
                  value={documentState.text}
                  onChange={(e) =>
                    setDocumentState((prev) => ({
                      ...prev,
                      text: e.target.value,
                    }))
                  }
                />
              </div>

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
                          setDocumentState((prev) => ({
                            ...prev,
                            tags: [...prev.tags, ""],
                          })),
                      }}
                    />
                    {documentState.tags.map((tag, index) => (
                      <div key={index} className="flex flex-grow flex-row">
                        <div className="flex flex-1 flex-row gap-8">
                          <div className="flex flex-1 flex-col">
                            <Input
                              className="w-full"
                              placeholder="Tag"
                              name="tag"
                              value={tag}
                              onChange={(value) => {
                                const newTags = [...documentState.tags];
                                newTags[index] = value;
                                setDocumentState((prev) => ({
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
                                const newTags = [...documentState.tags];
                                newTags.splice(index, 1);
                                setDocumentState((prev) => ({
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
            </div>
          )}
        </Page.Vertical>
      )}
    </Modal>
  );
};

interface Table {
  name: string;
  description: string;
  file: File | null;
}

interface TableUploadOrEditModalProps
  extends DocumentOrTableUploadOrEditModalProps {
  table: CoreAPITable | null;
  isTableError: boolean;
  isTableLoading: boolean;
  initialId?: string;
}

const TableUploadOrEditModal = ({
  table,
  isTableError,
  isTableLoading,
  initialId,
  dataSourceView,
  isOpen,
  onClose,
  owner,
}: TableUploadOrEditModalProps) => {
  const sendNotification = useContext(SendNotificationsContext);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tableState, setTableState] = useState<Table>({
    name: "",
    description: "",
    file: null,
  });
  const [editionStatus, setEditionStatus] = useState({
    name: false,
    description: false,
  });
  const [uploading, setUploading] = useState(false);
  const [isBigFile, setIsBigFile] = useState(false);
  const [isValidTable, setIsValidTable] = useState(false);

  useEffect(() => {
    if (!initialId) {
      setTableState({
        name: "",
        description: "",
        file: null,
      });
    } else if (table) {
      setTableState((prev) => ({
        ...prev,
        name: table.name,
        description: table.description,
      }));
    }
  }, [initialId, table]);

  useEffect(() => {
    const isNameValid = !!tableState.name && isSlugified(tableState.name);
    const isContentValid = !!tableState.description;
    setIsValidTable(isNameValid && isContentValid && !!tableState.file);
  }, [tableState]);

  const handleTableUpload = async (table: Table) => {
    setUploading(true);
    try {
      const fileContent = table.file
        ? await handleFileUploadToText(table.file)
        : null;
      if (fileContent && fileContent.isErr()) {
        return new Err(fileContent.error);
      }

      const csvContent = fileContent?.value
        ? await parseAndStringifyCsv(fileContent.value.content)
        : null;

      if (csvContent && csvContent.length > BIG_FILE_SIZE) {
        throw new Error("File too large");
      }

      const base = `/api/w/${owner.sId}/vaults/${dataSourceView.vaultId}/data_sources/${dataSourceView.dataSource.sId}/tables`;
      const endpoint = initialId ? `${base}/${initialId}` : base;

      const body = JSON.stringify({
        name: table.name,
        description: table.description,
        csv: csvContent,
        tableId: initialId,
        timestamp: null,
        tags: [],
        parents: [],
        truncate: false,
        async: false,
      });

      const res = await fetch(endpoint, {
        method: initialId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });

      if (!res.ok) {
        throw new Error("Failed to upsert table");
      }

      sendNotification({
        type: "success",
        title: `Table successfully ${initialId ? "updated" : "added"}`,
        description: `Table ${table.name} was successfully ${initialId ? "updated" : "added"}.`,
      });
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Error upserting table",
        description: `An error occurred: ${error instanceof Error ? error.message : String(error)}.`,
      });
    } finally {
      setUploading(false);
    }
  };

  const handleUpload = async () => {
    try {
      await handleTableUpload(tableState);
      onClose(true);
    } catch (error) {
      console.error(error);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) {
      return;
    }

    setUploading(true);
    try {
      if (selectedFile.size > MAX_FILE_SIZES.plainText) {
        sendNotification({
          type: "error",
          title: "File too large",
          description: "Please upload a file smaller than 30MB.",
        });
        setUploading(false);
        return;
      }

      setTableState((prev) => ({ ...prev, file: selectedFile }));
      setIsBigFile(selectedFile.size > BIG_FILE_SIZE);
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        onClose(false);
      }}
      hasChanged={!isTableError && !isTableLoading && isValidTable}
      variant="side-md"
      title={`${initialId ? "Edit" : "Add"} table`}
      onSave={handleUpload}
      isSaving={uploading}
    >
      {isTableLoading ? (
        <div className="flex justify-center py-4">
          <Spinner variant="color" size="xs" />
        </div>
      ) : (
        <Page.Vertical align="stretch">
          {isTableError ? (
            <div className="space-y-4 p-4">Content cannot be loaded.</div>
          ) : (
            <div className="space-y-4 p-4">
              <div>
                <Page.SectionHeader title="Table name" />
                <Input
                  placeholder="table_name"
                  name="name"
                  maxLength={MAX_NAME_CHARS}
                  disabled={!!initialId}
                  value={tableState.name}
                  onChange={(value) => {
                    setEditionStatus((prev) => ({ ...prev, name: true }));
                    setTableState((prev) => ({ ...prev, name: value }));
                  }}
                  error={
                    editionStatus.name &&
                    (!tableState.name || !isSlugified(tableState.name))
                      ? "Invalid name: Must be alphanumeric, max 32 characters and no space."
                      : null
                  }
                  showErrorLabel={true}
                />
              </div>

              <div>
                <Page.SectionHeader
                  title="Description"
                  description="Describe the content of your CSV file. It will be used by the LLM model to generate relevant queries."
                />
                <TextArea
                  placeholder="This table contains..."
                  value={tableState.description}
                  onChange={(value) => {
                    setEditionStatus((prev) => ({
                      ...prev,
                      description: true,
                    }));
                    setTableState((prev) => ({
                      ...prev,
                      description: value,
                    }));
                  }}
                  error={
                    !tableState.description && editionStatus.description
                      ? "You need to provide a description to your CSV file."
                      : null
                  }
                  showErrorLabel={true}
                  minRows={10}
                />
              </div>

              <div>
                <Page.SectionHeader
                  title="CSV File"
                  description="Select the CSV file for data extraction. The maximum file size allowed is 50MB."
                  action={{
                    label: uploading
                      ? "Uploading..."
                      : tableState.file
                        ? tableState.file.name
                        : initialId
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
                  accept=".csv, .tsv"
                  onChange={handleFileChange}
                />
                {isBigFile && (
                  <div className="flex flex-col gap-y-2 pt-4">
                    <div className="flex grow flex-row items-center gap-1 text-sm font-medium text-warning-500">
                      <ExclamationCircleIcon />
                      Warning: Large file (5MB+)
                    </div>
                    <div className="text-sm font-normal text-element-700">
                      This file is large and may take a while to upload.
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </Page.Vertical>
      )}
    </Modal>
  );
};
