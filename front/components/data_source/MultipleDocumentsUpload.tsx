import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
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
import { useUpsertFileAsDatasourceEntry } from "@app/lib/swr/file";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type {
  DataSourceViewType,
  LightWorkspaceType,
  PlanType,
} from "@app/types";
import { getSupportedNonImageFileExtensions } from "@app/types";

type MultipleDocumentsUploadProps = {
  dataSourceView: DataSourceViewType;
  isOpen: boolean;
  onClose: (save: boolean) => void;
  owner: LightWorkspaceType;
  totalNodesCount: number;
  plan: PlanType;
};

export const MultipleDocumentsUpload = ({
  dataSourceView,
  isOpen,
  onClose,
  owner,
  totalNodesCount,
  plan,
}: MultipleDocumentsUploadProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLimitPopupOpen, setIsLimitPopupOpen] = useState(false);
  const [wasOpened, setWasOpened] = useState(isOpen);

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

  // Used for creating files, with text extraction post-processing
  const fileUploaderService = useFileUploaderService({
    owner,
    useCase: "upsert_document",
  });

  const doUpsertFileAsDataSourceEntry = useUpsertFileAsDatasourceEntry(
    owner,
    dataSourceView
  );
  const [isBulkFilesUploading, setIsBulkFilesUploading] = useState<null | {
    total: number;
    completed: number;
  }>(null);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      // Empty file input
      if (files.length === 0) {
        close(false);
        return;
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

      // upload Files and get FileBlobs (only keep successful uploads)
      // Each individual error triggers a notification
      const fileBlobs = (
        await fileUploaderService.handleFilesUpload(files)
      )?.filter(
        (fileBlob: FileBlob): fileBlob is FileBlobWithFileId =>
          !!fileBlob.fileId
      );
      if (!fileBlobs || fileBlobs.length === 0) {
        setIsBulkFilesUploading(null);
        close(false);
        fileUploaderService.resetUpload();
        return;
      }

      // upsert the file as Data Source Documents
      await concurrentExecutor(
        fileBlobs,
        async (blob: { fileId: string; filename: string }) => {
          // This also notifies in case of error
          await doUpsertFileAsDataSourceEntry({
            fileId: blob.fileId,
            // Have to use the filename to avoid fileId becoming apparent in the UI.
            upsertArgs: {
              title: blob.filename,
              document_id: blob.filename,
            },
          });

          setIsBulkFilesUploading((prev) => ({
            total: fileBlobs.length,
            completed: prev ? prev.completed + 1 : 1,
          }));
        },
        { concurrency: 4 }
      );

      // Reset the upload state
      setIsBulkFilesUploading(null);
      fileUploaderService.resetUpload();
      close(true);
    },
    [
      fileUploaderService,
      close,
      plan.limits.dataSources.documents.count,
      totalNodesCount,
      doUpsertFileAsDataSourceEntry,
    ]
  );

  // Process dropped files if any.
  const { droppedFiles, setDroppedFiles } = useFileDrop();
  useEffect(() => {
    const handleDroppedFiles = async () => {
      const droppedFilesCopy = [...droppedFiles];
      if (droppedFilesCopy.length > 0) {
        // Make sure the files are cleared after processing
        setDroppedFiles([]);
        await uploadFiles(droppedFilesCopy);
      }
    };
    void handleDroppedFiles();
  }, [droppedFiles, setDroppedFiles, uploadFiles]);

  // Handle file change from file input.
  const handleFileChange = useCallback(
    async (
      e: ChangeEvent<HTMLInputElement> & { target: { files: File[] } }
    ) => {
      const selectedFiles = Array.from(
        (e?.target as HTMLInputElement).files ?? []
      );
      await uploadFiles(selectedFiles);
    },
    [uploadFiles]
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
