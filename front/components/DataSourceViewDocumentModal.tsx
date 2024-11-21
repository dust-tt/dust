import { Label, Modal, Spinner } from "@dust-tt/sparkle";
import type { DataSourceViewType, LightWorkspaceType } from "@dust-tt/types";
import { useMemo } from "react";

import { useDataSourceViewDocument } from "@app/lib/swr/data_source_views";

interface DataSourceViewDocumentModalProps {
  dataSourceView: DataSourceViewType | null;
  documentId: string | null;
  isOpen: boolean;
  onClose: () => void;
  owner: LightWorkspaceType;
}

export default function DataSourceViewDocumentModal({
  dataSourceView,
  documentId,
  isOpen,
  onClose,
  owner,
}: DataSourceViewDocumentModalProps) {
  const { document, isDocumentLoading, isDocumentError } =
    useDataSourceViewDocument({
      documentId,
      dataSourceView,
      owner,
    });
  console.log(isDocumentError);

  const { title, text } = useMemo(() => {
    if (!document) {
      return { title: documentId ?? undefined, text: undefined };
    }

    const titleTag = document.tags.find((tag: string) =>
      tag.startsWith("title:")
    );

    return {
      title: titleTag ? titleTag.split("title:")[1] : undefined,
      text: document.text,
    };
  }, [document, documentId]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      hasChanged={false}
      title={title}
      variant="full-screen"
    >
      <div className="w-full">
        <div className="text-left">
          {isDocumentLoading && (
            <div className="flex justify-center py-8">
              <Spinner variant="dark" size="md" />
            </div>
          )}
          {!isDocumentLoading && isDocumentError && (
            <div className="flex flex-col gap-2 py-8">
              <Label className="text-warning-500">
                Unable to retrieve document.
              </Label>
              <span className="text-sm text-element-700">
                We were not able to synchronize this document. Please contact
                support@dust.tt for assistance.
              </span>
            </div>
          )}
          {!isDocumentLoading && document && (
            <>
              <div className="mb-4 mt-8 text-sm text-element-900">
                Content of the document:
              </div>
              <pre className="whitespace-pre-wrap bg-structure-100 py-8 pl-4 pr-2 text-sm text-element-800">
                {text}
              </pre>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
