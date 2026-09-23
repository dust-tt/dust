"use client";

import {
  type DocumentSaveResult,
  Document as SparkleDocument,
} from "@dust-tt/sparkle/dist/esm/components/Document/index";
import { useVizContext } from "@viz/app/components/VizContext";
import {
  useFrameDataAPI,
  useUserIdentity,
} from "@viz/app/lib/frame-function-hooks";
import type { VisualizationDataAPI } from "@viz/app/lib/visualization-api";
import { cn } from "@viz/lib/utils";
import { type ReactNode, useCallback, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import useSWRImmutable from "swr/immutable";

export interface DocumentProps {
  /** Path to a JSON document inside this Frame's folder, such as ./content.json. */
  path: string;
  className?: string;
  readOnly?: boolean;
  /** React content for named visual blocks. JSON stores only the name. */
  visuals?: Record<string, ReactNode>;
  /** Idle time before autosaving, in milliseconds. Defaults to 3,000. */
  autosaveDebounceMs?: number;
}

interface DocumentFile {
  content: string;
  revision: string | null;
  canWrite: boolean;
}

interface DocumentEditorProps extends DocumentProps {
  file: DocumentFile;
  dataAPI: VisualizationDataAPI;
}

const readDocument = async ([, path, dataAPI]: readonly [
  string,
  string,
  VisualizationDataAPI,
]): Promise<DocumentFile | null> => {
  const file = await dataAPI.fetchFile(path);
  if (!file) {
    return null;
  }

  return {
    content: await file.file.text(),
    revision: file.revision,
    canWrite: file.canWrite,
  };
};

/**
 * @cc [owner:flvndvd,label:product] frame-document-style-isolation
 * Editor controls and tooltips MUST render inside Sparkle scopes.
 * Named Frame visuals MUST render outside those scopes and retain Viz utilities.
 */
const DocumentEditor = ({
  file,
  dataAPI,
  path,
  className,
  readOnly,
  autosaveDebounceMs,
  visuals,
}: DocumentEditorProps) => {
  const revisionRef = useRef(file.revision);
  const { user } = useUserIdentity();
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(
    null
  );
  const scopedVisuals =
    visuals &&
    Object.fromEntries(
      Object.entries(visuals).map(([name, visual]) => [
        name,
        visual == null ? (
          visual
        ) : (
          <div key={name} data-viz-sparkle-slot>
            {visual}
          </div>
        ),
      ])
    );

  const save = useCallback(
    async (content: string): Promise<DocumentSaveResult> => {
      const revision = revisionRef.current;
      if (readOnly || !file.canWrite || revision === null) {
        return { ok: false, error: "This document is read-only." };
      }

      const result = await dataAPI.writeFile({
        path,
        content,
        contentType: "application/json",
        revision,
      });

      if (!result.success) {
        return {
          ok: false,
          error:
            result.error.code === "conflict"
              ? "This file changed elsewhere. Your edits are still here. Copy them before reopening the document to get the latest version."
              : result.error.message,
        };
      }

      revisionRef.current = result.revision;
      return { ok: true };
    },
    [dataAPI, path, file.canWrite, readOnly]
  );

  return (
    <>
      <SparkleDocument
        initialContent={file.content}
        contentType="json"
        saveFormat="json"
        className={cn("viz-sparkle viz-document", className)}
        mountPortalContainer={portalContainer ?? undefined}
        readOnly={readOnly || !file.canWrite || file.revision === null}
        autosaveDebounceMs={autosaveDebounceMs}
        onSave={save}
        visuals={scopedVisuals}
        commentAuthor={
          user ? { name: user.fullName, avatarUrl: user.image } : undefined
        }
      />
      {typeof document !== "undefined" &&
        createPortal(
          <div className="viz-sparkle" ref={setPortalContainer} />,
          document.body
        )}
    </>
  );
};

const DocumentSession = (props: DocumentProps) => {
  const dataAPI = useFrameDataAPI();
  const { isPdfMode } = useVizContext();
  // Each opening reads a fresh snapshot and keeps it while the user edits.
  const sessionId = useId();
  const { data, error, isLoading } = useSWRImmutable(
    [sessionId, props.path, dataAPI] as const,
    readDocument,
    { shouldRetryOnError: false }
  );

  if (isLoading) {
    return (
      <p role="status" className={props.className}>
        Loading document…
      </p>
    );
  }

  if (error || !data) {
    return (
      <p role="alert" className={props.className}>
        This document could not be loaded. Reopen it to try again.
      </p>
    );
  }

  return (
    <DocumentEditor
      {...props}
      file={data}
      dataAPI={dataAPI}
      readOnly={props.readOnly || isPdfMode}
    />
  );
};

/**
 * @cc [owner:flvndvd,label:product] frame-document-persistence
 * Each opening MUST load a fresh file snapshot. Background reads MUST NOT replace a draft.
 * Saves MUST use that snapshot's revision, advancing it only after a confirmed save.
 * Read-only files, hosts without revision metadata and PDF renders MUST disable editing.
 * A changed path MUST start a separate editing session. Comments MUST be authored as the
 * workspace user returned by the Frame identity, and be unavailable without one.
 */
export const Document = (props: DocumentProps) => (
  <DocumentSession key={props.path} {...props} />
);
