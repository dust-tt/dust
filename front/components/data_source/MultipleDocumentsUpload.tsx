import { Dialog, useSendNotification } from "@dust-tt/sparkle";
import type {
  DataSourceViewType,
  LightWorkspaceType,
  PlanType,
  PostDataSourceWithNameDocumentRequestBody,
} from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type { ChangeEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { DocumentLimitPopup } from "@app/components/data_source/DocumentLimitPopup";
import { handleFileUploadToText } from "@app/lib/client/handle_file_upload";

const UPLOAD_ACCEPT = [".txt", ".pdf", ".md", ".csv"];

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

  const [isBulkFilesUploading, setIsBulkFilesUploading] = useState<null | {
    total: number;
    completed: number;
  }>(null);

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

  const sendNotification = useSendNotification();

  const handleUpsert = useCallback(
    async (text: string, documentId: string) => {
      const body: PostDataSourceWithNameDocumentRequestBody = {
        name: documentId,
        timestamp: null,
        parents: null,
        section: {
          prefix: null,
          content: text,
          sections: [],
        },
        text: null,
        source_url: undefined,
        tags: [],
        light_document_output: true,
        upsert_context: null,
        async: false,
      };

      try {
        const res = await fetch(
          `/api/w/${owner.sId}/spaces/${dataSourceView.spaceId}/data_sources/${
            dataSourceView.dataSource.sId
          }/documents`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          }
        );

        if (!res.ok) {
          let errMsg = "";
          try {
            const data = await res.json();
            errMsg = data.error.message;
          } catch (e) {
            errMsg = "An error occurred while uploading your document.";
          }
          return new Err(errMsg);
        }
      } catch (e) {
        return new Err("An error occurred while uploading your document.");
      }

      return new Ok(null);
    },
    [dataSourceView.dataSource.sId, dataSourceView.spaceId, owner.sId]
  );

  const handleFileChange = useCallback(
    async (
      e: ChangeEvent<HTMLInputElement> & { target: { files: File[] } }
    ) => {
      if (e.target.files && e.target.files.length > 0) {
        if (
          plan.limits.dataSources.documents.count != -1 &&
          e.target.files.length + totalNodesCount >
            plan.limits.dataSources.documents.count
        ) {
          setIsLimitPopupOpen(true);
          return;
        }
        const files = e.target.files;
        let i = 0;
        for (const file of files) {
          setIsBulkFilesUploading({
            total: files.length,
            completed: i++,
          });
          try {
            const uploadRes = await handleFileUploadToText(file);
            if (uploadRes.isErr()) {
              sendNotification({
                type: "error",
                title: `Error uploading document ${file.name}`,
                description: uploadRes.error.message,
              });
            } else {
              const upsertRes = await handleUpsert(
                uploadRes.value.content,
                file.name
              );
              if (upsertRes.isErr()) {
                sendNotification({
                  type: "error",
                  title: `Error uploading document ${file.name}`,
                  description: upsertRes.error,
                });
              }
            }
          } catch (e) {
            sendNotification({
              type: "error",
              title: "Error uploading document",
              description: `An error occurred while uploading your documents.`,
            });
          }
        }
        setIsBulkFilesUploading(null);
        close(true);
      } else {
        close(false);
      }
    },
    [
      handleUpsert,
      close,
      plan.limits.dataSources.documents.count,
      sendNotification,
      totalNodesCount,
    ]
  );

  const handleFileInputBlur = useCallback(() => {
    close(false);
  }, [close]);

  useEffect(() => {
    const ref = fileInputRef.current;
    ref?.addEventListener("cancel", handleFileInputBlur);
    return () => {
      ref?.removeEventListener("cancel", handleFileInputBlur);
    };
  }, [handleFileInputBlur]);

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
        accept={UPLOAD_ACCEPT.join(",")}
        ref={fileInputRef}
        multiple={true}
        onChange={handleFileChange}
        onBlur={handleFileInputBlur}
      />
    </>
  );
};
