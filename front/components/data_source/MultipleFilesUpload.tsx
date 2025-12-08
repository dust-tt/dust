import {
  Button,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
} from "@dust-tt/sparkle";
import type { ChangeEvent } from "react";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { useFileDrop } from "@app/components/assistant/conversation/FileUploaderContext";
import { DocumentLimitPopup } from "@app/components/data_source/DocumentLimitPopup";
import type {
  FileBlob,
  FileBlobWithFileId,
} from "@app/hooks/useFileUploaderService";
import { useFileUploaderService } from "@app/hooks/useFileUploaderService";
import { useUpsertFileAsDatasourceEntry } from "@app/lib/swr/files";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type {
  ContentNode,
  DataSourceViewType,
  LightWorkspaceType,
  PlanType,
} from "@app/types";
import {
  getSupportedNonImageFileExtensions,
  isSupportedDelimitedTextContentType,
} from "@app/types";

// Helper to check if a file should be treated as a table based on its MIME type
function isDelimitedFile(file: File): boolean {
  const contentType = file.type || "application/octet-stream";
  return isSupportedDelimitedTextContentType(contentType);
}

type MultipleFilesUploadProps = {
  dataSourceView: DataSourceViewType;
  existingNodes: ContentNode[];
  isOpen: boolean;
  onClose: (save: boolean) => void;
  owner: LightWorkspaceType;
  totalNodesCount: number;
  plan: PlanType;
};

export const MultipleFilesUpload = ({
  dataSourceView,
  existingNodes,
  isOpen,
  onClose,
  owner,
  totalNodesCount,
  plan,
}: MultipleFilesUploadProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLimitPopupOpen, setIsLimitPopupOpen] = useState(false);
  const [wasOpened, setWasOpened] = useState(isOpen);
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const [duplicateFiles, setDuplicateFiles] = useState<string[]>([]);

  const close = useCallback(
    (save: boolean) => {
      // Clear the values of the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      onClose(save);
    },
    [onClose]
  );

  // Used for creating document files, with text extraction post-processing
  const documentUploaderService = useFileUploaderService({
    owner,
    useCase: "folders_document",
    useCaseMetadata: {
      spaceId: dataSourceView.spaceId,
    },
  });

  // Used for creating table files (CSV, XLS, XLSX) with structured data processing
  const tableUploaderService = useFileUploaderService({
    owner,
    useCase: "upsert_table",
    useCaseMetadata: {
      spaceId: dataSourceView.spaceId,
    },
  });

  const doUpsertFileAsDataSourceEntry = useUpsertFileAsDatasourceEntry(
    owner,
    dataSourceView
  );
  const [isBulkFilesUploading, setIsBulkFilesUploading] = useState<null | {
    total: number;
    completed: number;
  }>(null);

  const checkDuplicatesAndUpload = useCallback(
    async (files: File[], skipDuplicateCheck = false) => {
      // Empty file input
      if (files.length === 0) {
        close(false);
        return;
      }

      // Check for duplicates unless explicitly skipped
      if (!skipDuplicateCheck) {
        const existingTitles = new Set(existingNodes.map((node) => node.title));
        const duplicates = files.filter(
          (file) => existingTitles.has(file.name) && !isDelimitedFile(file)
        );

        if (duplicates.length > 0) {
          // Show confirmation dialog
          setDuplicateFiles(duplicates.map((f) => f.name));
          setPendingFiles(files);
          return;
        }
      }

      // Open plan popup if limit is reached
      if (
        plan.limits.dataSources.documents.count != -1 &&
        files.length + totalNodesCount > plan.limits.dataSources.documents.count
      ) {
        setIsLimitPopupOpen(true);
        return;
      }

      setIsBulkFilesUploading({
        total: files.length,
        completed: 0,
      });

      // Split files by type: delimited (tables) vs others (documents)
      const documentFiles: File[] = [];
      const tableFiles: File[] = [];
      for (const file of files) {
        if (isDelimitedFile(file)) {
          tableFiles.push(file);
        } else {
          documentFiles.push(file);
        }
      }

      let hasUploads = false;

      // Upload document files (non-delimited)
      if (documentFiles.length > 0) {
        const documentBlobs = (
          await documentUploaderService.handleFilesUpload(documentFiles)
        )?.filter(
          (fileBlob: FileBlob): fileBlob is FileBlobWithFileId =>
            !!fileBlob.fileId
        );

        if (documentBlobs && documentBlobs.length > 0) {
          hasUploads = true;
          await concurrentExecutor(
            documentBlobs,
            async (blob: FileBlobWithFileId) => {
              await doUpsertFileAsDataSourceEntry({
                fileId: blob.fileId,
                upsertArgs: {
                  title: blob.filename,
                  document_id: blob.filename,
                },
              });

              setIsBulkFilesUploading((prev) => ({
                total: files.length,
                completed: prev ? prev.completed + 1 : 1,
              }));
            },
            { concurrency: 4 }
          );
        }
        documentUploaderService.resetUpload();
      }

      // Upload table files (delimited: CSV, TSV, XLS, XLSX)
      if (tableFiles.length > 0) {
        const tableBlobs = (
          await tableUploaderService.handleFilesUpload(tableFiles)
        )?.filter(
          (fileBlob: FileBlob): fileBlob is FileBlobWithFileId =>
            !!fileBlob.fileId
        );

        if (tableBlobs && tableBlobs.length > 0) {
          hasUploads = true;
          await concurrentExecutor(
            tableBlobs,
            async (blob: FileBlobWithFileId) => {
              const tableName = blob.filename;
              await doUpsertFileAsDataSourceEntry({
                fileId: blob.fileId,
                upsertArgs: {
                  title: blob.filename,
                  tableId: blob.fileId,
                  name: tableName,
                  description: `Upload of ${blob.filename}`,
                },
              });

              setIsBulkFilesUploading((prev) => ({
                total: files.length,
                completed: prev ? prev.completed + 1 : 1,
              }));
            },
            { concurrency: 4 }
          );
        }
        tableUploaderService.resetUpload();
      }

      // Reset the upload state
      setIsBulkFilesUploading(null);
      close(hasUploads);
    },
    [
      existingNodes,
      documentUploaderService,
      tableUploaderService,
      close,
      plan.limits.dataSources.documents.count,
      totalNodesCount,
      doUpsertFileAsDataSourceEntry,
    ]
  );

  const handleDuplicateConfirmation = useCallback(
    (confirmed: boolean) => {
      if (confirmed && pendingFiles) {
        // User confirmed - proceed with upload (skip duplicate check)
        void checkDuplicatesAndUpload(pendingFiles, true);
      }
      // Clear pending files and duplicates
      setPendingFiles(null);
      setDuplicateFiles([]);
      if (!confirmed) {
        close(false);
      }
    },
    [pendingFiles, checkDuplicatesAndUpload, close]
  );

  // Process dropped files if any.
  const { droppedFiles, setDroppedFiles } = useFileDrop();
  useEffect(() => {
    const handleDroppedFiles = async () => {
      const droppedFilesCopy = [...droppedFiles];
      if (droppedFilesCopy.length > 0) {
        // Make sure the files are cleared after processing
        setDroppedFiles([]);
        await checkDuplicatesAndUpload(droppedFilesCopy);
      }
    };
    void handleDroppedFiles();
  }, [droppedFiles, setDroppedFiles, checkDuplicatesAndUpload]);

  // Handle file change from file input.
  const handleFileChange = useCallback(
    async (
      e: ChangeEvent<HTMLInputElement> & { target: { files: File[] } }
    ) => {
      const selectedFiles = Array.from(
        (e?.target as HTMLInputElement).files ?? []
      );
      await checkDuplicatesAndUpload(selectedFiles);
    },
    [checkDuplicatesAndUpload]
  );

  const handleFileInputBlur = useCallback(() => {
    close(false);
  }, [close]);

  // Effect: add event listener to file input
  useEffect(() => {
    const ref = fileInputRef.current;
    ref?.addEventListener("cancel", handleFileInputBlur);
    return () => {
      ref?.removeEventListener("cancel", handleFileInputBlur);
    };
  }, [handleFileInputBlur]);

  // Effect: open file input when the dialog is opened
  useEffect(() => {
    if (isOpen && !wasOpened) {
      const ref = fileInputRef.current;
      ref?.click();
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWasOpened(isOpen);
  }, [handleFileInputBlur, isOpen, wasOpened]);

  return (
    <>
      <DocumentLimitPopup
        isOpen={isLimitPopupOpen}
        plan={plan}
        onClose={() => setIsLimitPopupOpen(false)}
        owner={owner}
      />
      <Dialog open={duplicateFiles.length > 0}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Replace existing files?</DialogTitle>
            <DialogDescription>
              {duplicateFiles.length === 1 ? (
                <>
                  A file named <strong>{duplicateFiles[0]}</strong> already
                  exists in this folder. Do you want to replace it?
                </>
              ) : (
                <>
                  {duplicateFiles.length} files already exist in this folder:
                  <ul className="ml-4 mt-2 list-disc">
                    {duplicateFiles.slice(0, 5).map((name) => (
                      <li key={name}>{name}</li>
                    ))}
                    {duplicateFiles.length > 5 && (
                      <li>and {duplicateFiles.length - 5} more...</li>
                    )}
                  </ul>
                  Do you want to replace them?
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="tertiary"
              label="Cancel"
              onClick={() => handleDuplicateConfirmation(false)}
            />
            <Button
              variant="primary"
              label="Replace"
              onClick={() => handleDuplicateConfirmation(true)}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={isBulkFilesUploading !== null}>
        <DialogContent
          size="md"
          isAlertDialog
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader hideButton>
            <DialogTitle>Uploading files</DialogTitle>
            <DialogDescription>
              {isBulkFilesUploading && (
                <>
                  Processing files {isBulkFilesUploading.completed} /{" "}
                  {isBulkFilesUploading.total}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogContainer>
            {isBulkFilesUploading && (
              <div className="flex justify-center">
                <Spinner variant="dark" size="md" />
              </div>
            )}
          </DialogContainer>
        </DialogContent>
      </Dialog>
      <input
        className="hidden"
        type="file"
        accept={getSupportedNonImageFileExtensions().join(", ")}
        ref={fileInputRef}
        multiple={true}
        onChange={handleFileChange}
        onBlur={handleFileInputBlur}
      />
    </>
  );
};
