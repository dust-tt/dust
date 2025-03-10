import {
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Spinner,
} from "@dust-tt/sparkle";
import type { DataSourceViewType, LightWorkspaceType } from "@dust-tt/types";
import { DocumentViewRawContentKey } from "@dust-tt/types";
import { useMemo } from "react";

import { useQueryParams } from "@app/hooks/useQueryParams";
import { useDataSourceViewDocument } from "@app/lib/swr/data_source_view_documents";

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

  const { title, text } = useMemo(() => {
    if (!document) {
      return { title: params.documentId.value ?? undefined, text: undefined };
    }

    const titleTag = document.tags.find((tag: string) =>
      tag.startsWith("title:")
    );

    return {
      title: titleTag ? titleTag.split("title:")[1] : undefined,
      text: document.text,
    };
  }, [document, params.documentId.value]);

  const onSheetClose = () => {
    params.setParams({
      documentId: undefined,
      [DocumentViewRawContentKey]: undefined,
    });
    if (onClose) {
      onClose();
    }
  };

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
                  <span className="text-sm text-element-700">
                    This document has no raw content available
                    <ul className="list-disc pl-4">
                      <li>
                        if the document is a spreadsheet, this is expected.
                        Spreasheets do not expose raw contents. They are made
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
              {!isDocumentLoading && document && (
                <>
                  <div className="mb-4 mt-8 text-sm text-foreground dark:text-foreground-night">
                    Content of the document:
                  </div>
                  <pre className="whitespace-pre-wrap bg-structure-100 py-8 pl-4 pr-2 text-sm text-element-800 dark:bg-structure-100-night dark:text-element-800-night">
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
