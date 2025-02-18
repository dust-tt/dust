import {
  Button,
  DocumentPlusIcon,
  EyeIcon,
  EyeSlashIcon,
  Input,
  Page,
  PlusIcon,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Spinner,
  TextArea,
  TrashIcon,
  useSendNotification,
} from "@dust-tt/sparkle";
import type {
  CoreAPIDocument,
  CoreAPILightDocument,
  DataSourceViewType,
  LightContentNode,
  PlanType,
  WorkspaceType,
} from "@dust-tt/types";
import { Err, getSupportedNonImageFileExtensions } from "@dust-tt/types";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { useFileUploaderService } from "@app/hooks/useFileUploaderService";
import {
  useCreateDataSourceViewDocument,
  useDataSourceViewDocument,
  useUpdateDataSourceViewDocument,
} from "@app/lib/swr/data_source_view_documents";
import { useFileProcessedContent } from "@app/lib/swr/file";

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

interface Document {
  name: string;
  text: string;
  tags: string[];
  sourceUrl: string;
  mimeType: string | null;
}
export interface DocumentUploadOrEditModalProps {
  contentNode?: LightContentNode;
  dataSourceView: DataSourceViewType;
  isOpen: boolean;
  onClose: (save: boolean) => void;
  owner: WorkspaceType;
  plan: PlanType;
  totalNodesCount: number;
  initialId?: string;
}

export const DocumentUploadOrEditModal = ({
  dataSourceView,
  isOpen,
  onClose,
  owner,
  plan,
  initialId,
}: DocumentUploadOrEditModalProps) => {
  const sendNotification = useSendNotification();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [documentState, setDocumentState] = useState<Document>({
    name: "",
    text: "",
    tags: [],
    sourceUrl: "",
    mimeType: null,
  });
  const fileUploaderService = useFileUploaderService({
    owner,
    useCase: "upsert_document",
  });

  const [editionStatus, setEditionStatus] = useState({
    name: false,
    content: false,
  });

  const [hasChanged, setHasChanged] = useState(false);
  const [isValidDocument, setIsValidDocument] = useState(false);
  const [developerOptionsVisible, setDeveloperOptionsVisible] = useState(false);

  const { document, isDocumentError, isDocumentLoading } =
    useDataSourceViewDocument({
      owner: owner,
      dataSourceView: dataSourceView,
      documentId: initialId ?? null,
      disabled: !initialId,
    });

  // Get the processed file content from the file API
  const [fileId, setFileId] = useState<string | null>(null);
  const { isContentLoading } = useFileProcessedContent(owner, fileId ?? null, {
    disabled: !fileId,
    onSuccess: async (response) => {
      const content = await response.text();
      if (!content || content.trim().length === 0) {
        sendNotification({
          type: "error",
          title: "Empty document content",
          description:
            "The uploaded file is empty. Please upload a file with content.",
        });
        fileUploaderService.resetUpload();
        return;
      }
      setDocumentState((prev) => ({
        ...prev,
        text: content,
      }));
    },
    onError: (error) => {
      fileUploaderService.resetUpload();
      sendNotification({
        type: "error",
        title: "Error fetching document content",
        description: error instanceof Error ? error.message : String(error),
      });
    },
    shouldRetryOnError: false,
  });
  const [isUpsertingDocument, setIsUpsertingDocument] = useState(false);

  const doUpdate = useUpdateDataSourceViewDocument(
    owner,
    dataSourceView,
    initialId ?? ""
  );
  const doCreate = useCreateDataSourceViewDocument(owner, dataSourceView);

  const handleDocumentUpload = useCallback(
    async (document: Document) => {
      setIsUpsertingDocument(true);
      const body = {
        name: initialId ?? document.name,
        title: initialId ?? document.name,
        mime_type: document.mimeType ?? "text/plain",
        timestamp: null,
        parent_id: null,
        parents: [initialId ?? document.name],
        section: { prefix: null, content: document.text, sections: [] },
        text: null,
        source_url: document.sourceUrl || undefined,
        tags: document.tags.filter(Boolean),
        light_document_output: true,
        upsert_context: null,
        async: false,
      };

      // These mutations do the fetch and mutate, all at once
      let upsertRes = null;
      if (initialId) {
        upsertRes = await doUpdate(body);
      } else {
        upsertRes = await doCreate(body);
      }

      // Upsert successful, close and reset the modal
      if (upsertRes) {
        onClose(true);
        setDocumentState({
          name: "",
          text: "",
          tags: [],
          sourceUrl: "",
          mimeType: null,
        });
        setEditionStatus({
          content: false,
          name: false,
        });
        setHasChanged(false);
      }

      // No matter the result, reset the file uploader
      setFileId(null);
      fileUploaderService.resetUpload();
      setIsUpsertingDocument(false);
    },

    [doUpdate, doCreate, initialId, fileUploaderService, onClose]
  );

  const handleUpload = useCallback(async () => {
    try {
      // Create Data Source Document
      await handleDocumentUpload(documentState);
      onClose(true);
    } catch (error) {
      console.error(error);
    }
  }, [handleDocumentUpload, documentState, onClose]);

  // We don't disable the save button, we show an error message instead.
  const onSave = useCallback(async () => {
    if (!isValidDocument) {
      if (documentState.name.trim() === "") {
        sendNotification({
          type: "error",
          title: "Missing document name",
          description: "You must provide a name for the document.",
        });
        return;
      }

      if (documentState.text.trim() === "") {
        sendNotification({
          type: "error",
          title: "Missing document content",
          description:
            "You must provide content for the document. Either upload a file or specify the content.",
        });
        return;
      }

      // Fallback
      sendNotification({
        type: "error",
        title: "Invalid document",
        description: "Please fill in all required fields.",
      });
      return;
    }

    await handleUpload();
  }, [isValidDocument, handleUpload, documentState, sendNotification]);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      // Enforce single file upload
      const files = e.target.files;
      if (files && files.length > 1) {
        sendNotification({
          type: "error",
          title: "Multiple files",
          description: "Please upload only one file at a time.",
        });
        return;
      }

      try {
        // Create a file -> Allows to get processed text content via the file API.
        const selectedFile = files?.[0];
        if (!selectedFile) {
          return;
        }
        const fileBlobs = await fileUploaderService.handleFilesUpload([
          selectedFile,
        ]);
        if (!fileBlobs || fileBlobs.length == 0 || !fileBlobs[0].fileId) {
          fileUploaderService.resetUpload();
          return new Err(
            new Error(
              "Error uploading file. Please try again or contact support."
            )
          );
        }

        // triggers content extraction -> documentState.text update
        setFileId(fileBlobs[0].fileId);
        setDocumentState((prev) => ({
          ...prev,
          name: prev.name.length > 0 ? prev.name : selectedFile.name,
          mimeType: selectedFile.type,
          sourceUrl:
            prev.sourceUrl.length > 0
              ? prev.sourceUrl
              : fileBlobs[0].publicUrl ?? "",
        }));
        setHasChanged(true);
      } catch (error) {
        sendNotification({
          type: "error",
          title: "Error uploading file",
          description: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [fileUploaderService, sendNotification, setDocumentState]
  );

  // Effect: Set the document state when the document is loaded
  useEffect(() => {
    if (!initialId) {
      setDocumentState({
        name: "",
        text: "",
        tags: [],
        sourceUrl: "",
        mimeType: null,
      });
    } else if (document && isCoreAPIDocumentType(document)) {
      setDocumentState((prev) => ({
        ...prev,
        name: initialId,
        text: document.text ?? "",
        tags: document.tags,
        sourceUrl: document.source_url ?? "",
        mimeType: document.mime_type,
      }));
    }
  }, [initialId, document]);

  // Effect: Validate the document state
  useEffect(() => {
    const isNameValid = documentState.name.trim().length > 0;
    const isContentValid = documentState.text.trim().length > 0;
    setIsValidDocument(isNameValid && isContentValid);
  }, [documentState]);

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          fileUploaderService.resetUpload();
          onClose(false);
          setHasChanged(false);
        }
      }}
    >
      <SheetContent size="xl">
        <SheetHeader>
          <SheetTitle>{`${initialId ? "Edit" : "Add"} document`}</SheetTitle>
        </SheetHeader>
        <SheetContainer>
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
                        setHasChanged(true);
                      }}
                      message={
                        !documentState.name && editionStatus.name
                          ? "You must provide a name."
                          : null
                      }
                      messageStatus="error"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <div>
                      <Page.SectionHeader
                        title="Associated URL"
                        description="The URL of the associated document (if any). Will be used to link users to the original document in agents citations."
                      />
                    </div>
                    <div>
                      <Input
                        placeholder="https://..."
                        name="sourceUrl"
                        value={documentState.sourceUrl}
                        onChange={(e) => {
                          setDocumentState((prev) => ({
                            ...prev,
                            sourceUrl: e.target.value,
                          }));
                          setHasChanged(true);
                        }}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-4">
                    <Page.SectionHeader
                      title="Text content"
                      description={`Copy paste content or upload a file (${getSupportedNonImageFileExtensions().join(", ")}). \n Up to ${
                        plan.limits.dataSources.documents.sizeMb === -1
                          ? "2"
                          : plan.limits.dataSources.documents.sizeMb
                      } MB of raw text.`}
                      action={{
                        label:
                          fileUploaderService.isProcessingFiles ||
                          isContentLoading
                            ? "Uploading..."
                            : "Upload file",
                        variant: "primary",
                        icon: DocumentPlusIcon,
                        onClick: () => fileInputRef.current?.click(),
                        isLoading:
                          fileUploaderService.isProcessingFiles ||
                          isContentLoading,
                      }}
                    />
                    <input
                      type="file"
                      ref={fileInputRef}
                      style={{ display: "none" }}
                      accept={getSupportedNonImageFileExtensions().join(", ")}
                      onChange={handleFileChange}
                    />
                    <TextArea
                      minRows={10}
                      disabled={
                        isContentLoading ||
                        fileUploaderService.isProcessingFiles
                      }
                      placeholder="Your document content..."
                      value={documentState.text}
                      onChange={(e) => {
                        setEditionStatus((prev) => ({
                          ...prev,
                          content: true,
                        }));
                        setDocumentState((prev) => ({
                          ...prev,
                          text: e.target.value,
                        }));
                        setHasChanged(true);
                      }}
                      error={
                        editionStatus.content && !documentState.text
                          ? "You must upload a file or specify the content of the document."
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
                                    setHasChanged(true);
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
                                    setHasChanged(true);
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
        </SheetContainer>
        <SheetFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
          }}
          rightButtonProps={{
            label: isUpsertingDocument ? "Saving..." : "Save",
            onClick: async (event: MouseEvent) => {
              event.preventDefault();
              await onSave();
            },
            disabled: !hasChanged || isUpsertingDocument,
          }}
        />
      </SheetContent>
    </Sheet>
  );
};
