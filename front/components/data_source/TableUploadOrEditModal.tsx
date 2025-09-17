import {
  DocumentPlusIcon,
  ExclamationCircleIcon,
  Input,
  Page,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Spinner,
  TextArea,
} from "@dust-tt/sparkle";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { useFileUploaderService } from "@app/hooks/useFileUploaderService";
import { useSendNotification } from "@app/hooks/useNotification";
import {
  useDataSourceViewTable,
  useUpdateDataSourceViewTable,
} from "@app/lib/swr/data_source_view_tables";
import { useUpsertFileAsDatasourceEntry } from "@app/lib/swr/files";
import type {
  DataSourceViewType,
  LightContentNode,
  PlanType,
  WorkspaceType,
} from "@app/types";
import {
  Err,
  fileSizeToHumanReadable,
  getSupportedFileExtensions,
  isBigFileSize,
  isSlugified,
  MAX_FILE_SIZES,
  truncate,
} from "@app/types";

interface Table {
  name: string;
  description: string;
  file: File | null;
}
export interface TableUploadOrEditModalProps {
  contentNode?: LightContentNode;
  dataSourceView: DataSourceViewType;
  isOpen: boolean;
  onClose: (save: boolean) => void;
  owner: WorkspaceType;
  plan: PlanType;
  totalNodesCount: number;
  initialId?: string;
}
const MAX_NAME_CHARS = 32;

export const TableUploadOrEditModal = ({
  initialId,
  dataSourceView,
  isOpen,
  onClose,
  owner,
}: TableUploadOrEditModalProps) => {
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
  const [isUpserting, setIsUpserting] = useState(false);
  const [isBigFile, setIsBigFile] = useState(false);
  const [isValidTable, setIsValidTable] = useState(false);
  const { table, isTableError, isTableLoading } = useDataSourceViewTable({
    owner: owner,
    dataSourceView: dataSourceView,
    tableId: initialId ?? null,
    disabled: !initialId,
  });

  // Get the processed file content from the file API
  const fileUploaderService = useFileUploaderService({
    owner,
    useCase: "upsert_table",
    useCaseMetadata: {
      spaceId: dataSourceView.spaceId,
    },
  });
  const [fileId, setFileId] = useState<string | null>(null);
  const doUpsertFileAsDataSourceEntry = useUpsertFileAsDatasourceEntry(
    owner,
    dataSourceView
  );
  const doUpdate = useUpdateDataSourceViewTable(
    owner,
    dataSourceView,
    initialId ?? ""
  );

  const handleTableUpload = useCallback(
    async (table: Table) => {
      setIsUpserting(true);
      let upsertRes = null;
      try {
        if (!fileId) {
          // Editing an existing table, not replacing the content.
          upsertRes = await doUpdate({
            name: table.name,
            description: table.description,
            truncate: false,
            title: table.name,
            mimeType: "text/csv",
            sourceUrl: null,
            timestamp: undefined,
            tags: undefined,
            parentId: undefined,
            parents: undefined,
            async: undefined,
            fileId: undefined,
          });
        } else {
          // Replacing the content of an existing table with a new file.
          upsertRes = await doUpsertFileAsDataSourceEntry({
            fileId,
            upsertArgs: {
              // Make sure to reuse the tableId from the initialId if it exists.
              tableId: initialId ?? fileId,
              name: table.name,
              description: table.description,
              title: table.name,
            },
          });
        }

        // Upsert successful, close and reset the modal
        if (upsertRes) {
          onClose(true);
          setTableState({
            name: "",
            description: "",
            file: null,
          });
          setEditionStatus({
            description: false,
            name: false,
          });
        }

        // No matter the result, reset the file uploader
        setFileId(null);
        fileUploaderService.resetUpload();
      } catch (error) {
        console.error(error);
      } finally {
        setIsUpserting(false);
      }
    },
    [
      initialId,
      onClose,
      doUpsertFileAsDataSourceEntry,
      fileUploaderService,
      fileId,
      doUpdate,
    ]
  );

  const handleUpload = useCallback(async () => {
    try {
      await handleTableUpload(tableState);
      onClose(true);
    } catch (error) {
      console.error(error);
    }
  }, [handleTableUpload, onClose, tableState]);

  // We don't disable the save button, we show an error message instead.
  // TODO (2024-12-13 lucas): Modify modal to allow disabling the save
  // button and showing a tooltip + enforce consistency across modal usage
  const onSave = useCallback(async () => {
    if (isTableLoading) {
      sendNotification({
        type: "error",
        title: "Error",
        description: "Cannot save the table: the file is still loading.",
      });
      return;
    }

    if (!isValidTable) {
      if (!initialId && !fileId) {
        sendNotification({
          type: "error",
          title: "Missing file",
          description: "You must upload a file to create a table.",
        });
        return;
      }
      if (
        tableState.name.trim().length === 0 ||
        !isSlugified(tableState.name)
      ) {
        sendNotification({
          type: "error",
          title: "Invalid name",
          description: "You must provide a valid name for the table.",
        });
        return;
      }

      if (tableState.description.trim() === "") {
        sendNotification({
          type: "error",
          title: "Invalid description",
          description: "You must provide a description for the table.",
        });
        return;
      }

      // Fallback
      sendNotification({
        type: "error",
        title: "Invalid table",
        description: "Please fill all the required fields.",
      });
      return;
    }

    await handleUpload();
  }, [
    handleUpload,
    isTableLoading,
    isValidTable,
    tableState,
    sendNotification,
    initialId,
    fileId,
  ]);

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

        // triggers content extraction -> tableState.content update
        setFileId(fileBlobs[0].fileId);
        setTableState((prev) => ({
          ...prev,
          file: selectedFile,
          name:
            prev.name.length > 0
              ? prev.name
              : stripTableName(selectedFile.name),
        }));
        setIsBigFile(isBigFileSize(selectedFile.size));
      } catch (error) {
        sendNotification({
          type: "error",
          title: "Error uploading file",
          description: error instanceof Error ? error.message : String(error),
        });
      } finally {
        e.target.value = "";
        fileUploaderService.resetUpload();
      }
    },
    [fileUploaderService, sendNotification]
  );

  // Effect: Validate the table state when inputs change
  useEffect(() => {
    const isNameValid =
      tableState.name.trim() !== "" && isSlugified(tableState.name);
    const isDescriptionValid = tableState.description.trim() !== "";
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    const fileOrInitialId = initialId || fileId;
    setIsValidTable(isNameValid && isDescriptionValid && !!fileOrInitialId);
  }, [tableState, initialId, fileId]);

  // Effect: Set the table state when the table is loaded
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

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose(false);
        }
      }}
    >
      <SheetContent size="xl">
        <SheetHeader>
          <SheetTitle>{`${initialId ? "Edit" : "Add"} table`}</SheetTitle>
        </SheetHeader>
        <SheetContainer>
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
                          ? "Invalid name: Must be lowercase alphanumeric, max 32 characters and no space."
                          : null
                      }
                      messageStatus="error"
                    />
                  </div>

                  <div>
                    <Page.SectionHeader
                      title="Description"
                      description="Describe the content of your data. It will be used by the LLM model to generate relevant queries."
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
                          ? "You need to provide a description for your data file."
                          : null
                      }
                      showErrorLabel
                      minRows={10}
                    />
                  </div>

                  <div>
                    <Page.SectionHeader
                      title="Data File"
                      description={
                        `Select your data file for extraction. Supported formats: CSV, ` +
                        `XLSX. Maximum file size: ${fileSizeToHumanReadable(MAX_FILE_SIZES.delimited)}.`
                      }
                      action={{
                        label: fileUploaderService.isProcessingFiles
                          ? "Uploading..."
                          : tableState.file
                            ? truncate(tableState.file.name, 24)
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
                      accept={getSupportedFileExtensions("delimited").join(",")}
                      onChange={handleFileChange}
                    />
                    {isBigFile && (
                      <div className="flex flex-col gap-y-2 pt-4">
                        <div className="flex grow flex-row items-center gap-1 text-sm font-medium text-warning-500">
                          <ExclamationCircleIcon />
                          Warning: Large file (5MB+)
                        </div>
                        <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
                          This file is large and may take a while to upload.
                        </div>
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
            label: isUpserting ? "Saving..." : "Save",
            onClick: async (event: MouseEvent) => {
              event.preventDefault();
              await onSave();
            },
            disabled:
              !(
                tableState.file !== null ||
                (table
                  ? table.description !== tableState.description ||
                    table.name !== tableState.name
                  : tableState.description.trim() !== "" ||
                    tableState.name.trim() !== "")
              ) || isUpserting,
          }}
        />
      </SheetContent>
    </Sheet>
  );
};

function stripTableName(name: string) {
  return name
    .replace(/\.(csv|tsv)$/, "")
    .replace(/[^a-z0-9]/gi, "_")
    .toLowerCase()
    .slice(0, 32);
}
