import { Modal } from "@dust-tt/sparkle";
import type { DataSourceType, LightWorkspaceType } from "@dust-tt/types";
import { useEffect, useState } from "react";

export default function ManagedDataSourceDocumentModal({
  owner,
  dataSource,
  documentId,
  isOpen,
  setOpen,
}: {
  owner: LightWorkspaceType;
  dataSource: DataSourceType | null;
  documentId: string | null;
  isOpen: boolean;
  setOpen: (open: boolean) => void;
}) {
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (documentId && dataSource) {
      setDownloading(true);
      fetch(
        `/api/w/${owner.sId}/data_sources/${dataSource.sId}/documents/${encodeURIComponent(documentId)}`
      )
        .then(async (res) => {
          if (res.ok) {
            const document = await res.json();
            const titleTag = document.document.tags.find((tag: string) =>
              tag.startsWith("title:")
            );
            if (titleTag) {
              setTitle(titleTag.split("title:")[1]);
            }
            setDownloading(false);
            setText(document.document.text);
          }
        })
        .catch((e) => console.error(e));
    }
  }, [dataSource, documentId, owner.sId]);

  function closeModal() {
    setOpen(false);
  }

  if (!documentId) {
    return null;
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={closeModal}
      hasChanged={false}
      title={title || documentId}
      variant="full-screen"
    >
      <div className="w-full">
        <div className="text-left">
          <div className="mb-4 mt-8 text-sm text-element-900">
            Content of the document:
          </div>
          {!downloading && documentId && text?.length ? (
            <>
              <pre className="whitespace-pre-wrap bg-structure-100 py-8 pl-4 pr-2 text-sm text-element-800">
                {text}
              </pre>
            </>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
