import { useQueryParams } from "@app/hooks/useQueryParams";
import { useDataSourceViewDocument } from "@app/lib/swr/data_source_view_documents";
import { getFileViewUrl } from "@app/lib/swr/files";
import type { DataSourceViewType } from "@app/types/data_source_view";
import { isPdfContentType } from "@app/types/files";
import { DocumentViewRawContentKey } from "@app/types/sheets";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Spinner,
} from "@dust-tt/sparkle";
import { useMemo } from "react";

interface DataSourceViewDocumentModalProps {
  dataSourceView: DataSourceViewType | null;
  owner: LightWorkspaceType;
  onClose?: () => void;
}

export default function DataSourceViewDocumentModal({
  dataSourceView,
  owner,
  onClose,
}: DataSourceViewDocumentModalProps) {
  const params = useQueryParams([DocumentViewRawContentKey, "documentId"]);
  const isOpen = params[DocumentViewRawContentKey].value === "true";

  const { document, isDocumentLoading, isDocumentError } =
    useDataSourceViewDocument({
      documentId: params.documentId.value ?? null,
      dataSourceView,
      owner,
      disabled: !params.documentId.value || !dataSourceView,
    });

  const { title, text, isPdf, fileViewUrl } = useMemo(() => {
    const defaultTitle = params.documentId.value ?? undefined;

    if (!document) {
      return {
        title: defaultTitle,
        text: undefined,
        isPdf: false,
        fileViewUrl: null,
      };
    }

    const mimeType = document.mime_type;
    const pdf = mimeType ? isPdfContentType(mimeType) : false;

    // For file-backed documents, extract fileId from tags to build the view URL.
    const fileIdTag = document.tags.find((tag: string) =>
      tag.startsWith("fileId:")
    );
    const fileId = fileIdTag ? fileIdTag.split("fileId:")[1] : null;
    const viewUrl = pdf ? getFileViewUrl(owner, fileId) : null;

    if (document.title) {
      return {
        title: document.title,
        text: document.text,
        isPdf: pdf,
        fileViewUrl: viewUrl,
      };
    }
    const titleTag = document.tags.find((tag: string) =>
      tag.startsWith("title:")
    );

    return {
      title: titleTag ? titleTag.split("title:")[1] : defaultTitle,
      text: document.text,
      isPdf: pdf,
      fileViewUrl: viewUrl,
    };
  }, [document, params.documentId.value, owner]);

  const onSheetClose = () => {
    params.setParams({
      documentId: undefined,
      [DocumentViewRawContentKey]: undefined,
    });
    if (onClose) {
      onClose();
    }
  };

  const pdfViewer = fileViewUrl ? (
    <iframe
      src={`${fileViewUrl}#navpanes=0`}
      className="h-full min-h-[600px] w-full rounded-lg border-0"
      title={title}
    />
  ) : (
    <div className="flex flex-col items-center gap-4 py-8">
      <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
        PDF preview is not available for this document.
      </span>
    </div>
  );

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onSheetClose();
        }
      }}
    >
      <SheetContent size="xl">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <div className="w-full">
            <div className="text-left">
              {isDocumentLoading && (
                <div className="flex justify-center py-8">
                  <Spinner variant="dark" size="md" />
                </div>
              )}
              {!isDocumentLoading && isDocumentError && (
                <div className="flex flex-col gap-2 py-8">
                  <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                    This document has no raw content available
                    <ul className="list-disc pl-4">
                      <li>
                        if the document is a spreadsheet, this is expected.
                        Spreadsheets do not expose raw contents. They are made
                        available in Dust via the `Table Query` action in
                        assistants.
                      </li>
                      <li>
                        Otherwise, this is unexpected. Please contact
                        support@dust.tt for assistance on synchronizing the
                        document.
                      </li>
                    </ul>
                  </span>
                </div>
              )}
              {!isDocumentLoading && document && isPdf && pdfViewer}
              {!isDocumentLoading && document && !isPdf && (
                <>
                  <div className="copy-sm mb-4 mt-8 text-foreground dark:text-foreground-night">
                    Content of the document:
                  </div>
                  <pre className="whitespace-pre-wrap bg-background py-8 pl-4 pr-2 text-sm text-muted-foreground dark:bg-background-night dark:text-muted-foreground-night">
                    {text}
                  </pre>
                </>
              )}
            </div>
          </div>
        </SheetContainer>
      </SheetContent>
    </Sheet>
  );
}
