import { Modal } from "@dust-tt/sparkle";
import type { DataSourceViewType, LightWorkspaceType } from "@dust-tt/types";
import { useMemo } from "react";

import { useDataSourceViewDocument } from "@app/lib/swr";

export default function DataSourceViewDocumentModal({
  owner,
  dataSourceView,
  documentId,
  isOpen,
  setOpen,
}: {
  owner: LightWorkspaceType;
  dataSourceView: DataSourceViewType | null;
  documentId: string | null;
  isOpen: boolean;
  setOpen: (open: boolean) => void;
}) {
  const { document, isDocumentLoading } = useDataSourceViewDocument({
    documentId,
    dataSourceView,
    owner,
  });

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
      onClose={() => setOpen(false)}
      hasChanged={false}
      title={title}
      variant="full-screen"
    >
      <div className="w-full">
        <div className="text-left">
          <div className="mb-4 mt-8 text-sm text-element-900">
            Content of the document:
          </div>
          {!isDocumentLoading && document ? (
            <pre className="whitespace-pre-wrap bg-structure-100 py-8 pl-4 pr-2 text-sm text-element-800">
              {text}
            </pre>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
