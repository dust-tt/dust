import {
  NewDialog,
  NewDialogContainer,
  NewDialogContent,
  NewDialogDescription,
  NewDialogHeader,
  NewDialogTitle,
  Spinner,
} from "@dust-tt/sparkle";
import type {
  DataSourceViewType,
  LightWorkspaceType,
  PlanType,
} from "@dust-tt/types";
import {
  concurrentExecutor,
  getSupportedNonImageFileExtensions,
} from "@dust-tt/types";
import type { ChangeEvent } from "react";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { DocumentLimitPopup } from "@app/components/data_source/DocumentLimitPopup";
import type {
  FileBlob,
  FileBlobWithFileId,
} from "@app/hooks/useFileUploaderService";
import { useFileUploaderService } from "@app/hooks/useFileUploaderService";
import { useUpsertFileAsDatasourceEntry } from "@app/lib/swr/file";

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
    useCase: "folder_document",
  });

  const doUpsertFileAsDataSourceEntry = useUpsertFileAsDatasourceEntry(
    owner,
    dataSourceView
  );
  const [isBulkFilesUploading, setIsBulkFilesUploading] = useState<null | {
    total: number;
    completed: number;
  }>(null);

  const handleFileChange = useCallback(
    async (
      e: ChangeEvent<HTMLInputElement> & { target: { files: File[] } }
    ) => {
      // Empty file input
      if (!e.target.files || e.target.files.length === 0) {
        close(false);
        return;
      }

      // Open plan popup if limit is reached
      if (
        plan.limits.dataSources.documents.count != -1 &&
        e.target.files.length + totalNodesCount >
          plan.limits.dataSources.documents.count
      ) {
        setIsLimitPopupOpen(true);
        return;
      }

      setIsBulkFilesUploading({
        total: e.target.files.length,
        completed: 0,
      });

      // upload Files and get FileBlobs (only keep successful uploads)
      // Each individual error triggers a notification
      const fileBlobs = (await fileUploaderService.handleFileChange(e))?.filter(
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
              name: blob.filename,
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
      <NewDialog open={isBulkFilesUploading !== null}>
        <NewDialogContent
          size="md"
          isAlertDialog
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <NewDialogHeader hideButton>
            <NewDialogTitle>Uploading files</NewDialogTitle>
            <NewDialogDescription>
              {isBulkFilesUploading && (
                <>
                  Processing files {isBulkFilesUploading.completed} /{" "}
                  {isBulkFilesUploading.total}
                </>
              )}
            </NewDialogDescription>
          </NewDialogHeader>
          <NewDialogContainer>
            {isBulkFilesUploading && (
              <div className="flex justify-center">
                <Spinner variant="dark" size="md" />
              </div>
            )}
          </NewDialogContainer>
        </NewDialogContent>
      </NewDialog>
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
