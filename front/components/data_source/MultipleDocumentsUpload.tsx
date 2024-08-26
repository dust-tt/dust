import { Dialog } from "@dust-tt/sparkle";
import type {
  DataSourceViewType,
  LightWorkspaceType,
  PlanType,
  PostDataSourceDocumentRequestBody,
} from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import { useContext, useEffect, useRef, useState } from "react";

import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { handleFileUploadToText } from "@app/lib/client/handle_file_upload";
import { ClientSideTracking } from "@app/lib/tracking/client";

const UPLOAD_ACCEPT = [".txt", ".pdf", ".md", ".csv"];

type MultipleDocumentsUploadProps = {
  dataSourceView: DataSourceViewType;
  isOpen: boolean;
  onClose: (save: boolean) => void;
  owner: LightWorkspaceType;
  plan: PlanType;
};

export const MultipleDocumentsUpload = ({
  dataSourceView,
  isOpen,
  onClose,
  owner,
  // plan // TODO check max files upload
}: MultipleDocumentsUploadProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      fileInputRef.current?.click();
      // Reset state immediately after opening the dialog, we don't need to keep it set
      onClose(false);
    }
  }, [isOpen, onClose]);

  const [bulkFilesUploading, setBulkFilesUploading] = useState<null | {
    total: number;
    completed: number;
  }>(null);

  const sendNotification = useContext(SendNotificationsContext);

  const handleUpsert = async (text: string, documentId: string) => {
    const body: PostDataSourceDocumentRequestBody = {
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
        `/api/w/${owner.sId}/data_sources/${
          dataSourceView.dataSource.name
        }/documents/${encodeURIComponent(documentId)}`,
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
  };

  return (
    <>
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
        isOpen={bulkFilesUploading !== null}
        title="Uploading files"
      >
        {bulkFilesUploading && (
          <>
            Processing files {bulkFilesUploading.completed} /{" "}
            {bulkFilesUploading.total}
          </>
        )}
      </Dialog>
      <input
        className="hidden"
        type="file"
        accept={UPLOAD_ACCEPT.join(",")}
        ref={fileInputRef}
        multiple={true}
        onChange={async (e) => {
          if (e.target.files && e.target.files.length > 0) {
            const files = e.target.files;
            ClientSideTracking.trackMultiFilesUploadUsed({
              fileCount: files.length,
              workspaceId: owner.sId,
            });
            let i = 0;
            for (const file of files) {
              setBulkFilesUploading({
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
            setBulkFilesUploading(null);
            onClose(true);
          }
        }}
      />
    </>
  );
};
