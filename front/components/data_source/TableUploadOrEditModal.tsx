import { useFileUploaderService } from "@app/hooks/useFileUploaderService";
import { useSendNotification } from "@app/hooks/useNotification";
import { formatFileSize } from "@app/lib/i18n/format";
import {
  useDataSourceViewTable,
  useUpdateDataSourceViewTable,
} from "@app/lib/swr/data_source_view_tables";
import { useUpsertFileAsDatasourceEntry } from "@app/lib/swr/files";
import type { LightContentNode } from "@app/types/api/public/spaces";
import type { DataSourceViewType } from "@app/types/data_source_view";
import {
  getSupportedFileExtensions,
  isBigFileSize,
  MAX_FILE_SIZES,
} from "@app/types/files";
import type { PlanType } from "@app/types/plan";
import { Err } from "@app/types/shared/result";
import { isSlugified, truncate } from "@app/types/shared/utils/string_utils";
import type { WorkspaceType } from "@app/types/user";
import {
  AlertCircle,
  FilePlus03,
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
import { Trans, useLingui } from "@lingui/react/macro";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

interface Table {
  name: string;
  description: string;
  file: File | null;
}
interface TableUploadOrEditModalProps {
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
  const { t } = useLingui();
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
    hasSandboxTools: false,
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
        title: t`Error`,
        description: t`Cannot save the table: the file is still loading.`,
      });
      return;
    }

    if (!isValidTable) {
      if (!initialId && !fileId) {
        sendNotification({
          type: "error",
          title: t`Missing file`,
          description: t`You must upload a file to create a table.`,
        });
        return;
      }
      if (
        tableState.name.trim().length === 0 ||
        !isSlugified(tableState.name)
      ) {
        sendNotification({
          type: "error",
          title: t`Invalid name`,
          description: t`You must provide a valid name for the table.`,
        });
        return;
      }

      if (tableState.description.trim() === "") {
        sendNotification({
          type: "error",
          title: t`Invalid description`,
          description: t`You must provide a description for the table.`,
        });
        return;
      }

      // Fallback
      sendNotification({
        type: "error",
        title: t`Invalid table`,
        description: t`Please fill all the required fields.`,
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
    t,
  ]);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      // Enforce single file upload
      const files = e.target.files;
      if (files && files.length > 1) {
        sendNotification({
          type: "error",
          title: t`Multiple files`,
          description: t`Please upload only one file at a time.`,
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
          title: t`Error uploading file`,
          description: error instanceof Error ? error.message : String(error),
        });
      } finally {
        e.target.value = "";
        fileUploaderService.resetUpload();
      }
    },
    [fileUploaderService, sendNotification, t]
  );

  // Effect: Validate the table state when inputs change
  useEffect(() => {
    const isNameValid =
      tableState.name.trim() !== "" && isSlugified(tableState.name);
    const isDescriptionValid = tableState.description.trim() !== "";
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

  const maxFileSize = formatFileSize(MAX_FILE_SIZES.delimited, { decimals: 0 });

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
          <SheetTitle>{initialId ? t`Edit table` : t`Add table`}</SheetTitle>
        </SheetHeader>
        <SheetContainer>
          {isTableLoading ? (
            <div className="flex justify-center py-4">
              <Spinner size="xs" />
            </div>
          ) : (
            <Page.Vertical align="stretch">
              {isTableError ? (
                <div className="space-y-4 p-4">
                  <Trans>Content cannot be loaded.</Trans>
                </div>
              ) : (
                <div className="space-y-4 p-4">
                  <div>
                    <Page.SectionHeader title={t`Table name`} />
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
                          ? t`Invalid name: Must be lowercase alphanumeric, max 32 characters and no space.`
                          : null
                      }
                      messageStatus="error"
                    />
                  </div>

                  <div>
                    <Page.SectionHeader
                      title={t`Description`}
                      description={t`Describe the content of your data. It will be used by the LLM model to generate relevant queries.`}
                    />
                    <TextArea
                      placeholder={t`This table contains...`}
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
                          ? t`You need to provide a description for your data file.`
                          : null
                      }
                      showErrorLabel
                      minRows={10}
                    />
                  </div>

                  <div>
                    <Page.SectionHeader
                      title={t`Data file`}
                      description={t`Select your data file for extraction. Supported formats: CSV, XLSX. Maximum file size: ${maxFileSize}.`}
                      action={{
                        label: fileUploaderService.isProcessingFiles
                          ? t`Uploading...`
                          : tableState.file
                            ? truncate(tableState.file.name, 24)
                            : initialId
                              ? t`Replace file`
                              : t`Upload file`,
                        variant: "primary",
                        icon: FilePlus03,
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
                          <AlertCircle />
                          <Trans>Warning: Large file (5MB+)</Trans>
                        </div>
                        <div className="text-sm font-normal text-muted-foreground">
                          <Trans>
                            This file is large and may take a while to upload.
                          </Trans>
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
            label: t`Cancel`,
            variant: "outline",
          }}
          rightButtonProps={{
            label: isUpserting ? t`Saving...` : t`Save`,
            onClick: async (event: React.MouseEvent<HTMLButtonElement>) => {
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
