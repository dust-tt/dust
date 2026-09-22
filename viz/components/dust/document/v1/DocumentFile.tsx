"use client";

import { Document } from "@dust-tt/sparkle/dist/esm/components/Document/index";
import type {
  DocumentProps,
  DocumentSaveResult,
} from "@dust-tt/sparkle/dist/esm/components/Document/types";
import type { VisualizationDataAPI } from "@viz/app/lib/visualization-api";
import type {
  FrameDocumentResult,
  FrameDocumentSnapshot,
} from "@viz/app/types";
import { useDocumentFilesContext } from "@viz/components/dust/document/DocumentFilesProvider";
import { cn } from "@viz/lib/utils";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  loadDocumentFile,
  type NativeDocumentEnvelope,
  parseDocumentFile,
} from "./content";

interface DocumentFileProps
  extends Pick<DocumentProps, "theme" | "renderVisual"> {
  src: string;
  className?: string;
}

export const DocumentFile = (props: DocumentFileProps) => (
  <DocumentFileSession key={props.src} {...props} />
);

const DocumentFileSession = ({
  src,
  className,
  theme,
  renderVisual,
}: DocumentFileProps) => {
  const context = useDocumentFilesContext();
  const id = useId();
  const [loaded, setLoaded] =
    useState<FrameDocumentResult<FrameDocumentSnapshot> | null>(null);
  const { dataAPI, register, update } = context ?? {};

  useEffect(() => {
    if (!dataAPI || !register || !update) {
      return;
    }
    if (!register(id, src)) {
      setLoaded({
        ok: false,
        error: "This document is already open elsewhere in this Frame.",
      });
      return;
    }
    let active = true;
    void loadDocumentFile(dataAPI, src).then(
      (result) => {
        if (active) {
          setLoaded(result);
          update(id, { loading: false });
        }
      },
      () => {
        if (active) {
          setLoaded({
            ok: false,
            error:
              "The document could not be loaded. Reopen the Frame to try again.",
          });
          update(id, { loading: false });
        }
      }
    );
    return () => {
      active = false;
      update(id, null);
    };
  }, [dataAPI, id, register, src, update]);

  const onPendingChangesChange = useCallback(
    (pending: boolean) => {
      update?.(id, { pending });
    },
    [id, update]
  );

  if (!context) {
    return (
      <DocumentFileMessage
        className={className}
        error
        message="Documents must be opened inside a Frame."
      />
    );
  }
  if (!loaded) {
    return (
      <DocumentFileMessage className={className} message="Opening document…" />
    );
  }
  if (!loaded.ok) {
    return (
      <DocumentFileMessage className={className} error message={loaded.error} />
    );
  }
  const document = parseDocumentFile(loaded.value.source);
  if (!document) {
    return (
      <DocumentFileMessage
        className={className}
        error
        message="This document is invalid or uses an unsupported version. Its file has not been changed."
      />
    );
  }
  return (
    <DocumentFileEditor
      src={src}
      className={className}
      theme={theme}
      renderVisual={renderVisual}
      snapshot={loaded.value}
      document={document}
      dataAPI={context.dataAPI}
      readOnly={context.readOnly}
      onPendingChangesChange={onPendingChangesChange}
    />
  );
};

interface DocumentFileEditorProps extends DocumentFileProps {
  snapshot: FrameDocumentSnapshot;
  document: NativeDocumentEnvelope;
  dataAPI: VisualizationDataAPI;
  readOnly: boolean;
  onPendingChangesChange: (pending: boolean) => void;
}

/**
 * @cc [owner:flvndvd,label:concurrency] frame-document-save-revision
 * Saves MUST use the last acknowledged revision and retain the native envelope.
 * Failed saves MUST preserve the open draft and MUST NOT advance the revision.
 */
const DocumentFileEditor = ({
  src,
  className,
  snapshot,
  theme,
  renderVisual,
  document,
  dataAPI,
  readOnly,
  onPendingChangesChange,
}: DocumentFileEditorProps) => {
  const revision = useRef(snapshot.revision);
  const save = useCallback(
    async (content: string): Promise<DocumentSaveResult> => {
      if (!dataAPI.documentFiles || readOnly || !snapshot.canEdit) {
        return { ok: false, error: "This document is read-only." };
      }
      const updatedContent: unknown = JSON.parse(content);
      const result = await dataAPI.documentFiles.save({
        src,
        source: JSON.stringify({ ...document, content: updatedContent }),
        revision: revision.current,
      });
      if (!result.ok) {
        return result;
      }
      revision.current = result.value.revision;
      return { ok: true };
    },
    [dataAPI, document, readOnly, snapshot.canEdit, src]
  );

  return (
    <Document
      initialContent={JSON.stringify(document.content)}
      theme={theme}
      renderVisual={renderVisual}
      contentType="json"
      saveFormat="json"
      readOnly={readOnly || !snapshot.canEdit || !dataAPI.documentFiles}
      onSave={save}
      onPendingChangesChange={onPendingChangesChange}
      className={cn("bg-background", className)}
    />
  );
};

interface DocumentFileMessageProps {
  message: string;
  className?: string;
  error?: boolean;
}

const DocumentFileMessage = ({
  message,
  className,
  error,
}: DocumentFileMessageProps) => (
  <div
    className={cn("p-6 text-muted-foreground", className)}
    role={error ? "alert" : "status"}
  >
    {message}
  </div>
);
