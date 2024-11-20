import { supportedPlainTextExtensions } from "@dust-tt/client";
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
  SparklesIcon,
  Spinner,
  TextArea,
  TrashIcon,
  useSendNotification,
} from "@dust-tt/sparkle";
import type {
  ContentNodesViewType,
  CoreAPIDocument,
  CoreAPILightDocument,
  DataSourceViewType,
  LightContentNode,
  PlanType,
  WorkspaceType,
} from "@dust-tt/types";
import {
  BIG_FILE_SIZE,
  Err,
  isSlugified,
  MAX_FILE_LENGTH,
  MAX_FILE_SIZES,
  maxFileSizeToHumanReadable,
  parseAndStringifyCsv,
} from "@dust-tt/types";
import React, { useEffect, useRef, useState } from "react";

import { useFileUploaderService } from "@app/hooks/useFileUploaderService";
import { handleFileUploadToText } from "@app/lib/client/handle_file_upload";
import type { FileVersion } from "@app/lib/resources/file_resource";
import { useDataSourceViewDocument } from "@app/lib/swr/data_source_views";
import { useTable } from "@app/lib/swr/tables";
import { useFeatureFlags } from "@app/lib/swr/workspaces";

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

const fetchFileTextContent = async (
  workspaceId: string,
  fileId: string,
  version: FileVersion
) => {
  const response = await fetch(
    `/api/w/${workspaceId}/files/${fileId}?action=view&version=${version}`
  );
  if (!response.ok) {
    return null;
  }
  return response.text();
};

interface DocumentOrTableUploadOrEditModalProps {
  contentNode?: LightContentNode;
  dataSourceView: DataSourceViewType;
  isOpen: boolean;
  onClose: (save: boolean) => void;
  owner: WorkspaceType;
  plan: PlanType;
  totalNodesCount: number;
  viewType: ContentNodesViewType;
  initialId?: string;
}

export function DocumentOrTableUploadOrEditModal(
  props: DocumentOrTableUploadOrEditModalProps
) {
  const isTable = props.viewType === "tables";
  const initialId = props.contentNode?.internalId;

  return isTable ? (
    <TableUploadOrEditModal {...props} initialId={initialId} />
  ) : (
    <DocumentUploadorEditModal {...props} initialId={initialId} />
  );
}

function hasAssociatedFile(document: CoreAPIDocument) {
  // Return true iff the document has a file associated with it
  // Faster than actually querying the db
  return (
    document.document_id &&
    document.document_id.startsWith("fil_") &&
    document.tags.some((tag) => tag.startsWith("title:"))
  );
}

interface Document {
  name: string;
  text: string;
  tags: string[];
  sourceUrl: string;
  // Populated for uploads, because a file is created
  fileId: string | null;
}

const DocumentUploadorEditModal = ({
  dataSourceView,
  isOpen,
  onClose,
  owner,
  plan,
  initialId,
}: DocumentOrTableUploadOrEditModalProps) => {
  const sendNotification = useSendNotification();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [documentState, setDocumentState] = useState<Document>({
    name: "",
    text: "",
    tags: [],
    sourceUrl: "",
    fileId: null,
  });
  const fileUploaderService = useFileUploaderService({
    owner,
    useCase: "folder",
  });

  const [editionStatus, setEditionStatus] = useState({
    name: false,
    content: false,
  });
  const [uploading, setUploading] = useState(false);
  const [creatingFile, setCreatingFile] = useState(false);
  const [isValidDocument, setIsValidDocument] = useState(false);
  const [developerOptionsVisible, setDeveloperOptionsVisible] = useState(false);

  const { document, isDocumentError, isDocumentLoading } =
    useDataSourceViewDocument({
      owner: owner,
      dataSourceView: dataSourceView,
      documentId: initialId ?? null,
      disabled: !initialId,
    });

  useEffect(() => {
    if (!initialId) {
      setDocumentState({
        name: "",
        text: "",
        tags: [],
        sourceUrl: "",
        fileId: null,
      });
    } else if (document && isCoreAPIDocumentType(document)) {
      // Extract title from tags
      const titleTagContent = document.tags
        .find((tag) => tag.startsWith("title:"))
        ?.split(":")[1];

      setDocumentState((prev) => ({
        ...prev,
        name: titleTagContent || initialId,
        text: document.text ?? "",
        tags: document.tags,
        sourceUrl: document.source_url ?? "",
        fileId: hasAssociatedFile(document) ? document.document_id : null,
      }));
    }
  }, [initialId, document]);

  useEffect(() => {
    const isNameValid = !!documentState.name;
    const isContentValid = !!documentState.text;
    setIsValidDocument(isNameValid && isContentValid);
  }, [documentState]);

  const handleDocumentUpload = async (document: Document) => {
    setUploading(true);
    try {
      // Add a "title:"" tag iff none exists
      // That prevents the title from being overwitten by the file id
      if (!document.tags.some((tag) => tag.startsWith("title:"))) {
        document.tags.push(`title:${document.name}`);
      }

      const body = {
        // /!\ Use the fileId as the document name to achieve foreign-key-like behavior
        // This unlocks use case such as file download
        // If pasted text is entered, the name will be the document name
        // If a document already exists, reuse its id for patching
        name: initialId ? initialId : document.fileId ?? document.name,
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

      const base = `/api/w/${owner.sId}/spaces/${dataSourceView.spaceId}/data_sources/${dataSourceView.dataSource.sId}/documents`;
      const endpoint = initialId ? `${base}/${initialId}` : base;
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
      setDocumentState({
        name: "",
        text: "",
        tags: [],
        sourceUrl: "",
        fileId: null,
      });
      setEditionStatus({
        content: false,
        name: false,
      });
      fileUploaderService.resetUpload();
    }
  };

  const handleUpload = async () => {
    try {
      // Create Data Source Document
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

    setCreatingFile(true);
    try {
      // Create file
      const fileBlobs = await fileUploaderService.handleFilesUpload([
        selectedFile,
      ]);
      if (!fileBlobs || fileBlobs.length == 0 || !fileBlobs[0].fileId) {
        setCreatingFile(false);
        fileUploaderService.resetUpload();
        return new Err(
          new Error(
            "Error uploading file. Please try again or contact support."
          )
        );
      }

      // fetch file's processed text
      const fileId = fileBlobs[0].fileId;
      const processedText = await fetchFileTextContent(
        owner.sId,
        fileId,
        "processed"
      );
      if (!processedText) {
        fileUploaderService.removeFile(fileBlobs[0].fileId);
        setCreatingFile(false);
        return new Err(new Error("Error reading file content"));
      }

      // update text box and fileId -> will be used to link document to file
      setDocumentState((prev) => ({
        ...prev,
        text: processedText,
        fileId,
      }));
      setCreatingFile(false);
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Error uploading file",
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setCreatingFile(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        fileUploaderService.resetUpload();
        onClose(false);
      }}
      hasChanged={
        !isDocumentError &&
        !isDocumentLoading &&
        !creatingFile &&
        isValidDocument
      }
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
                  value={documentState.name}
                  disabled={!!initialId}
                  onChange={(e) => {
                    setEditionStatus((prev) => ({ ...prev, name: true }));
                    setDocumentState((prev) => ({
                      ...prev,
                      name: e.target.value,
                    }));
                  }}
                  message={
                    !documentState.name && editionStatus.name
                      ? "You need to provide a name."
                      : null
                  }
                  messageStatus="error"
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
                  onChange={(e) =>
                    setDocumentState((prev) => ({
                      ...prev,
                      sourceUrl: e.target.value,
                    }))
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
                    label: creatingFile
                      ? "Uploading..."
                      : documentState.fileId
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
                  accept={supportedPlainTextExtensions.join(", ")}
                  onChange={handleFileChange}
                />
                <TextArea
                  minRows={10}
                  disabled={creatingFile || !!documentState.fileId}
                  placeholder="Your document content..."
                  value={documentState.text}
                  onChange={(e) => {
                    setEditionStatus((prev) => ({ ...prev, content: true }));
                    setDocumentState((prev) => ({
                      ...prev,
                      text: e.target.value,
                    }));
                  }}
                  error={
                    editionStatus.content && !documentState.text
                      ? "You need to upload a file or specify the content of the document."
                      : null
                  }
                  showErrorLabel
                />
              </div>

              <div>
                <Page.SectionHeader
                  title="Developer Options"
                  action={{
                    label: developerOptionsVisible ? "Hide" : "Show",
                    variant: "ghost",
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
                        variant: "ghost",
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
                              onChange={(e) => {
                                const newTags = [...documentState.tags];
                                newTags[index] = e.target.value;
                                setDocumentState((prev) => ({
                                  ...prev,
                                  tags: newTags,
                                }));
                              }}
                            />
                          </div>
                          <div className="flex">
                            <Button
                              tooltip="Remove"
                              icon={TrashIcon}
                              variant="warning"
                              onClick={() => {
                                const newTags = [...documentState.tags];
                                newTags.splice(index, 1);
                                setDocumentState((prev) => ({
                                  ...prev,
                                  tags: newTags,
                                }));
                              }}
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

const TableUploadOrEditModal = ({
  initialId,
  dataSourceView,
  isOpen,
  onClose,
  owner,
}: DocumentOrTableUploadOrEditModalProps) => {
  const sendNotification = useSendNotification();
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
  const [useAppForHeaderDetection, setUseAppForHeaderDetection] =
    useState(false);

  const { table, isTableError, isTableLoading } = useTable({
    owner: owner,
    dataSourceView: dataSourceView,
    tableId: initialId ?? null,
  });

  const { featureFlags } = useFeatureFlags({ workspaceId: owner.sId });

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

      if (csvContent && csvContent.length > MAX_FILE_LENGTH) {
        throw new Error("File too large");
      }

      const base = `/api/w/${owner.sId}/spaces/${dataSourceView.spaceId}/data_sources/${dataSourceView.dataSource.sId}/tables`;
      const endpoint = initialId ? `${base}/${initialId}` : base;

      const body = JSON.stringify({
        name: table.name,
        description: table.description,
        csv: csvContent,
        tableId: initialId,
        timestamp: null,
        tags: [],
        parents: [],
        truncate: true,
        async: false,
        useAppForHeaderDetection,
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
          description: `Please upload a file smaller than ${maxFileSizeToHumanReadable(MAX_FILE_SIZES.plainText)}.`,
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
                  onChange={(e) => {
                    setEditionStatus((prev) => ({ ...prev, name: true }));
                    setTableState((prev) => ({
                      ...prev,
                      name: e.target.value,
                    }));
                  }}
                  message={
                    editionStatus.name &&
                    (!tableState.name || !isSlugified(tableState.name))
                      ? "Invalid name: Must be alphanumeric, max 32 characters and no space."
                      : null
                  }
                  messageStatus="error"
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
                  onChange={(e) => {
                    setEditionStatus((prev) => ({
                      ...prev,
                      description: true,
                    }));
                    setTableState((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }));
                  }}
                  error={
                    !tableState.description && editionStatus.description
                      ? "You need to provide a description to your CSV file."
                      : null
                  }
                  showErrorLabel
                  minRows={10}
                />
              </div>

              <div>
                <Page.SectionHeader
                  title="CSV File"
                  description={`Select the CSV file for data extraction. The maximum file size allowed is ${maxFileSizeToHumanReadable(MAX_FILE_SIZES.plainText)}.`}
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
              {featureFlags.includes("use_app_for_header_detection") && (
                <div>
                  <Page.SectionHeader
                    title="Enable header detection"
                    description={
                      "Use the LLM model to detect headers in the CSV file."
                    }
                    action={{
                      label: useAppForHeaderDetection ? "Disable" : "Enable",
                      variant: useAppForHeaderDetection ? "primary" : "ghost",
                      icon: SparklesIcon,
                      onClick: () =>
                        setUseAppForHeaderDetection(!useAppForHeaderDetection),
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </Page.Vertical>
      )}
    </Modal>
  );
};
