"use client";

import {
  type DocumentSaveOutcome,
  type DocumentSaveResult,
  Document as SparkleDocument,
} from "@dust-tt/sparkle/dist/esm/components/Document/index";
import { useVizContext } from "@viz/app/components/VizContext";
import {
  useFrameDataAPI,
  useUserIdentity,
} from "@viz/app/lib/frame-function-hooks";
import type { VisualizationDataAPI } from "@viz/app/lib/visualization-api";
import type { WriteFileResult } from "@viz/app/types";
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

const CONFLICT_ERROR_MESSAGE =
  "This file changed elsewhere. Your edits are still here. Copy them before reopening the document to get the latest version.";

const documentSaveOutcome = (result: WriteFileResult): DocumentSaveOutcome =>
  result.success
    ? { ok: true }
    : {
        ok: false,
        error:
          result.error.code === "conflict"
            ? CONFLICT_ERROR_MESSAGE
            : result.error.message,
      };

const readDocument = async (
  path: string,
  dataAPI: VisualizationDataAPI
): Promise<DocumentFile | null> => {
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
  const [canWrite, setCanWrite] = useState(
    file.canWrite && file.revision !== null
  );
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
      if (readOnly || !canWrite || revision === null) {
        return { ok: false, error: "This document is read-only." };
      }

      const write = async (content: string, revision: string) => {
        const result = await dataAPI.writeFile({
          path,
          content,
          contentType: "application/json",
          revision,
        });
        if (result.success) {
          revisionRef.current = result.revision;
        }
        return result;
      };

      const result = await write(content, revision);
      if (result.success || result.error.code !== "conflict") {
        return documentSaveOutcome(result);
      }

      const latest = await readDocument(path, dataAPI);
      if (!latest) {
        return documentSaveOutcome(result);
      }
      if (!latest.canWrite || latest.revision === null) {
        setCanWrite(false);
        return { ok: false, error: "This document is read-only." };
      }
      const latestRevision = latest.revision;
      return {
        ok: false,
        error: CONFLICT_ERROR_MESSAGE,
        conflict: {
          content: latest.content,
          adoptAndSave: async (recoveredContent) => {
            // Sparkle adopts this snapshot before invoking this callback. Keep its revision even
            // on failure so a later explicit save uses the recovered draft's baseline.
            revisionRef.current = latestRevision;
            return documentSaveOutcome(
              await write(recoveredContent, latestRevision)
            );
          },
        },
      };
    },
    [dataAPI, path, canWrite, readOnly]
  );

  return (
    <>
      <SparkleDocument
        initialContent={file.content}
        contentType="json"
        saveFormat="json"
        className={cn("viz-sparkle viz-document", className)}
        mountPortalContainer={portalContainer ?? undefined}
        readOnly={readOnly || !canWrite}
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
    ([, path, api]) => readDocument(path, api),
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
 * Saves MUST use that snapshot's revision. A confirmed save or the editor's explicit adoption
 * of a freshly fetched snapshot MUST advance the revision. A conflict MUST NOT advance the
 * revision unless the editor adopts that snapshot, and recovery MUST retry at most once.
 * Read-only files, hosts without revision metadata and PDF renders MUST disable editing.
 * A conflict read that reveals revoked write access or missing revision metadata MUST
 * disable further editing without replacing the draft or hiding its unsaved status.
 * A changed path MUST start a separate editing session. Comments MUST be authored as the
 * workspace user returned by the Frame identity, and be unavailable without one.
 */
export const Document = (props: DocumentProps) => (
  <DocumentSession key={props.path} {...props} />
);
