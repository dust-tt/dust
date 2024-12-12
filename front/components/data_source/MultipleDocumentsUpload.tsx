import { Dialog, useSendNotification } from "@dust-tt/sparkle";
import type {
  DataSourceViewType,
  LightWorkspaceType,
  PlanType,
} from "@dust-tt/types";
import { Err, getSupportedNonImageFileExtensions } from "@dust-tt/types";
import type { ChangeEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { DocumentLimitPopup } from "@app/components/data_source/DocumentLimitPopup";
import type {
  FileBlob,
  FileBlobWithFileId,
} from "@app/hooks/useFileUploaderService";
import { useFileUploaderService } from "@app/hooks/useFileUploaderService";
import { useCreateDataSourceViewDocument } from "@app/lib/swr/data_source_view_documents";
import { getFileProcessedUrl } from "@app/lib/swr/file";

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
  const sendNotification = useSendNotification();
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

  const getFileProcessedContent = useCallback(
    async (fileId: string) => {
      const url = getFileProcessedUrl(owner, fileId);
      const res = await fetch(url);
      if (!res.ok) {
        return new Err(`Error reading the file content: ${res.status}`);
      }
      const content = await res.text();
      if (content === null || content === "") {
        return new Err("Empty file content");
      }
      return content;
    },
    [owner]
  );

  // Used for creating files, with text extraction post-processing
  const fileUploaderService = useFileUploaderService({
    owner,
    useCase: "folder_document",
  });

  // Mutation for creating documents, throw error on partial failure
  const doCreate = useCreateDataSourceViewDocument(owner, dataSourceView);

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

      // upload Files and get FileBlobs (only keep successfull uploads)
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
      // Done 1 by 1 for simplicity
      let i = 0;
      for (const blob of fileBlobs) {
        setIsBulkFilesUploading({
          total: fileBlobs.length,
          completed: i++,
        });
        // TODO : use an upsert endpoint here that will handle the upsert of the file

        // get processed text
        const content = await getFileProcessedContent(blob.fileId);
        if (content instanceof Err) {
          sendNotification({
            type: "error",
            title: `Error processing document ${blob.filename}`,
            description: content.error,
          });
          continue;
        }

        // Create the document
        const body = {
          name: blob.filename,
          title: blob.filename,
          mime_type: blob.contentType ?? undefined,
          timestamp: null,
          parent_id: null,
          parents: [blob.filename],
          section: {
            prefix: null,
            content: content,
            sections: [],
          },
          text: null,
          source_url: undefined,
          tags: [],
          light_document_output: true,
          upsert_context: null,
          async: false,
        };
        await doCreate(body);
      }

      // Reset the upload state
      setIsBulkFilesUploading(null);
      fileUploaderService.resetUpload();
      close(true);
    },
    [
      doCreate,
      fileUploaderService,
      getFileProcessedContent,
      close,
      plan.limits.dataSources.documents.count,
      sendNotification,
      totalNodesCount,
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
      <Dialog
        onCancel={() => {
          //no-op as we can't cancel file upload
        }}
        onValidate={() => {
          //no-op as we can't cancel file upload
        }}
        // isSaving is always true since we are showing this Dialog while
        // uploading files only
        isSaving={true}
        isOpen={isBulkFilesUploading !== null}
        title="Uploading files"
      >
        {isBulkFilesUploading && (
          <>
            Processing files {isBulkFilesUploading.completed} /{" "}
            {isBulkFilesUploading.total}
          </>
        )}
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
